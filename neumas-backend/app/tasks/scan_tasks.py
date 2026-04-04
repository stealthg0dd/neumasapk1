"""
Celery tasks for scan processing.

Provides:
- scans.process_scan    -- full pipeline: vision -> inventory -> patterns -> predictions
- scans.reprocess_scan  -- re-run the pipeline for an existing scan

IMPORTANT: Service imports are done INSIDE async functions to avoid circular
imports at module load time.
"""

import asyncio
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.celery_app import neumas_task
from app.core.logging import get_logger

logger = get_logger(__name__)


# =============================================================================
# Category -> DB-normalised name mapping (from VisionAgent output)
# =============================================================================
CATEGORY_MAP: dict[str, str] = {
    "Dairy":     "dairy",
    "Produce":   "produce",
    "Meat":      "meat",
    "Dry Goods": "dry_goods",
    "Beverages": "beverages",
    "Alcohol":   "alcohol",
    "Cleaning":  "cleaning",
    "Other":     "other",
}


# =============================================================================
# Task: scans.process_scan
# =============================================================================

@neumas_task(
    name="scans.process_scan",
    bind=True,
    queue="scans",
    max_retries=3,
    default_retry_delay=60,
)
def process_scan(
    self,
    scan_id: str,
    property_id: str,
    user_id: str,
    image_url: str,
    scan_type: str = "receipt",
) -> dict[str, Any]:
    """
    Process a receipt scan through the full AI pipeline.

    Pipeline:
    1. Mark scan as 'processing'
    2. Call VisionAgent (Claude 3.5 Sonnet) -> extract items
    3. Save raw results + processed_results to scans table
    4. Upsert extracted items into inventory_items (add to existing qty)
    5. Recompute consumption patterns for the property
    6. Recompute stockout predictions for the property
    7. Mark scan as 'completed' (or 'failed' on error)

    Idempotent: re-running updates existing records.

    Args:
        scan_id:     UUID of the scan record
        property_id: UUID of the property being scanned
        user_id:     UUID of the user who initiated the scan
        image_url:   Publicly accessible URL of the receipt image
        scan_type:   "receipt" | "barcode"

    Returns:
        Summary dict with status, item counts, and timing.
    """
    logger.info(
        "Scan task received",
        scan_id=scan_id,
        property_id=property_id,
        scan_type=scan_type,
    )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _process_scan_async(
            task=self,
            scan_id=scan_id,
            property_id=property_id,
            user_id=user_id,
            image_url=image_url,
            scan_type=scan_type,
        )
    )


async def _process_scan_async(
    task: Any,
    scan_id: str,
    property_id: str,
    user_id: str,
    image_url: str,
    scan_type: str,
    org_id: str = "",
) -> dict[str, Any]:
    """
    Async implementation of the full scan pipeline.

    Uses the Supabase service-role (admin) client throughout because Celery
    workers have no user JWT.  DB column names match the schema in
    app/db/models.py (Scan + InventoryItem).
    """
    # Lazy imports to prevent circular imports at module load
    from app.db.supabase_client import get_async_supabase_admin
    from app.services.pattern_agent import recompute_patterns_for_property
    from app.services.predict_agent import recompute_predictions_for_property
    from app.services.vision_agent import get_vision_agent

    wall_start = time.perf_counter()

    supabase = await get_async_supabase_admin()
    if not supabase:
        logger.error("Supabase admin client unavailable", scan_id=scan_id)
        return {"error": "Database not configured", "scan_id": scan_id}

    # -- Resolve org_id if not provided (Celery path doesn't pass it) ----------
    if not org_id:
        try:
            prop_resp = await (
                supabase.table("properties")
                .select("org_id")
                .eq("id", property_id)
                .single()
                .execute()
            )
            org_id = (prop_resp.data or {}).get("org_id", "")
        except Exception as exc:
            logger.warning("Could not resolve org_id from properties", property_id=property_id, error=str(exc))

    # -- Idempotency check: skip if already completed --------------------------
    existing_resp = await (
        supabase.table("scans")
        .select("status, items_detected, processing_time_ms")
        .eq("id", scan_id)
        .single()
        .execute()
    )
    if existing_resp.data and existing_resp.data.get("status") == "completed":
        logger.info(
            "Scan already completed -- skipping pipeline",
            scan_id=scan_id,
            property_id=property_id,
        )
        return {
            "scan_id": scan_id,
            "property_id": property_id,
            "status": "completed",
            "items_upserted": existing_resp.data.get("items_detected", 0),
            "errors": [],
            "skipped": True,
        }

    result: dict[str, Any] = {
        "scan_id": scan_id,
        "property_id": property_id,
        "status": "processing",
        "items_upserted": 0,
        "errors": [],
    }

    try:
        # =================================================================
        # Step 1 -- Mark scan as processing
        # =================================================================
        await supabase.table("scans").update({
            "status": "processing",
            "started_at": datetime.now(UTC).isoformat(),
            "error_message": None,
        }).eq("id", scan_id).execute()

        logger.info("Scan marked as processing", scan_id=scan_id)

        # =================================================================
        # Step 2 -- Run VisionAgent
        # =================================================================
        vision_agent = await get_vision_agent()
        vision_result = await vision_agent.analyze_receipt(
            image_url=image_url,
            scan_type=scan_type,
        )

        if vision_result.get("error"):
            error_msg: str = vision_result["error"]
            logger.error("VisionAgent failed", scan_id=scan_id, error=error_msg)
            await _mark_failed(supabase, scan_id, error_msg)
            result["status"] = "failed"
            result["errors"].append({"stage": "vision", "error": error_msg})
            return result

        extracted_items: list[dict[str, Any]] = vision_result.get("items", [])
        receipt_meta: dict[str, Any] = vision_result.get("receipt_metadata") or {}
        vision_confidence: float = float(vision_result.get("confidence") or 0)

        logger.info(
            "VisionAgent complete",
            scan_id=scan_id,
            items_extracted=len(extracted_items),
            confidence=vision_confidence,
        )

        # =================================================================
        # Step 3 -- Persist raw + processed results in scans table
        # =================================================================
        ms_after_vision = int((time.perf_counter() - wall_start) * 1000)

        # raw_results: full LLM response including usage metadata
        raw_results: dict[str, Any] = {
            "llm_provider": vision_result.get("llm_provider"),
            "llm_model":    vision_result.get("llm_model"),
            "usage":        vision_result.get("usage"),
            "confidence":   vision_confidence,
        }

        # processed_results: what PatternAgent reads later
        processed_results: dict[str, Any] = {
            "items":            extracted_items,
            "receipt_metadata": receipt_meta,
            "confidence":       vision_confidence,
        }

        await supabase.table("scans").update({
            "raw_results":        raw_results,
            "processed_results":  processed_results,
            "items_detected":     len(extracted_items),
            "confidence_score":   str(vision_confidence),
            "processing_time_ms": ms_after_vision,
        }).eq("id", scan_id).execute()

        # =================================================================
        # Step 4 -- Upsert items into inventory_items
        # =================================================================
        upserted: list[dict[str, Any]] = []
        for item in extracted_items:
            try:
                inv_item = await _upsert_inventory_item(
                    supabase=supabase,
                    org_id=org_id,
                    property_id=property_id,
                    item=item,
                )
                if inv_item:
                    upserted.append(inv_item)
            except Exception as exc:
                logger.warning(
                    "Inventory upsert failed for item",
                    item_name=item.get("item_name"),
                    error=str(exc),
                )
                result["errors"].append({
                    "stage": "inventory",
                    "item": item.get("item_name"),
                    "error": str(exc),
                })

        result["items_upserted"] = len(upserted)
        logger.info(
            "Inventory upsert complete",
            scan_id=scan_id,
            upserted=len(upserted),
            of_extracted=len(extracted_items),
        )

        # =================================================================
        # Step 5 -- Recompute consumption patterns
        # =================================================================
        try:
            pattern_result = await recompute_patterns_for_property(
                UUID(property_id)
            )
            logger.info(
                "Pattern recomputation complete",
                scan_id=scan_id,
                property_id=property_id,
                items_analyzed=pattern_result.get("items_analyzed", 0),
                patterns_upserted=pattern_result.get("patterns_found", 0),
            )
        except Exception as exc:
            logger.warning(
                "Pattern recomputation failed (non-fatal)",
                scan_id=scan_id,
                error=str(exc),
            )
            result["errors"].append({"stage": "patterns", "error": str(exc)})

        # =================================================================
        # Step 6 -- Recompute stockout predictions
        # =================================================================
        try:
            pred_result = await recompute_predictions_for_property(
                UUID(property_id)
            )
            logger.info(
                "Prediction recomputation complete",
                scan_id=scan_id,
                property_id=property_id,
                predictions_upserted=pred_result.get("predictions_upserted", 0),
                critical_count=pred_result.get("critical_count", 0),
            )
        except Exception as exc:
            logger.warning(
                "Prediction recomputation failed (non-fatal)",
                scan_id=scan_id,
                error=str(exc),
            )
            result["errors"].append({"stage": "predictions", "error": str(exc)})

        # =================================================================
        # Step 7 -- Mark scan as completed
        # =================================================================
        total_ms = int((time.perf_counter() - wall_start) * 1000)

        await supabase.table("scans").update({
            "status":             "completed",
            "processing_time_ms": total_ms,
            "completed_at":       datetime.now(UTC).isoformat(),
        }).eq("id", scan_id).execute()

        result["status"] = "completed"
        result["processing_time_ms"] = total_ms
        result["receipt_metadata"] = receipt_meta

        logger.info(
            "Scan processing complete",
            scan_id=scan_id,
            property_id=property_id,
            items_upserted=len(upserted),
            total_ms=total_ms,
            errors=len(result["errors"]),
        )

        return result

    except Exception as exc:
        error_msg = str(exc)
        logger.exception(
            "Scan processing failed",
            scan_id=scan_id,
            error=error_msg,
        )
        try:
            await _mark_failed(supabase, scan_id, error_msg)
        except Exception as db_exc:
            logger.error(
                "Failed to persist error state",
                scan_id=scan_id,
                error=str(db_exc),
            )
        result["status"] = "failed"
        result["errors"].append({"stage": "pipeline", "error": error_msg})
        if task is not None:
            raise   # triggers Celery retry
        return result


# =============================================================================
# Helpers
# =============================================================================

async def _mark_failed(supabase: Any, scan_id: str, error_msg: str) -> None:
    """Set scan status to failed and persist the error message."""
    await supabase.table("scans").update({
        "status":        "failed",
        "error_message": error_msg[:2000],   # guard against very long traces
        "completed_at":  datetime.now(UTC).isoformat(),
    }).eq("id", scan_id).execute()


async def _upsert_inventory_item(
    supabase: Any,
    org_id: str,
    property_id: str,
    item: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Add a scanned item to the inventory.

    - If an item with the same name (case-insensitive) already exists:
      increment its quantity.
    - Otherwise create a new inventory_items row.

    Columns written: property_id, name, quantity, unit, status
    """
    item_name: str = (item.get("item_name") or "").strip()
    if not item_name:
        return None

    qty_to_add = float(item.get("quantity") or 1)
    unit       = str(item.get("unit") or "unit")

    # Look for existing item by name (case-insensitive)
    existing_resp = await (
        supabase.table("inventory_items")
        .select("id, quantity")
        .eq("property_id", property_id)
        .ilike("name", item_name)
        .limit(1)
        .execute()
    )

    if existing_resp.data:
        existing = existing_resp.data[0]
        new_qty = float(existing.get("quantity") or 0) + qty_to_add

        resp = await (
            supabase.table("inventory_items")
            .update({"quantity": str(new_qty)})
            .eq("id", existing["id"])
            .execute()
        )

        logger.info(
            "Incremented inventory quantity",
            item_id=existing["id"],
            item_name=item_name,
            added=qty_to_add,
            new_total=new_qty,
        )
        return resp.data[0] if resp.data else existing

    # Create new item
    insert_payload: dict[str, Any] = {
        "org_id":      org_id,
        "property_id": property_id,
        "name":        item_name,
        "quantity":    str(qty_to_add),
        "unit":        unit,
        "is_active":   True,
    }

    resp = await supabase.table("inventory_items").insert(insert_payload).execute()

    logger.info(
        "Created new inventory item from scan",
        item_name=item_name,
        quantity=qty_to_add,
        property_id=property_id,
    )
    return resp.data[0] if resp.data else None


# =============================================================================
# Task: scans.reprocess_scan
# =============================================================================

@neumas_task(
    name="scans.reprocess_scan",
    bind=True,
    queue="scans",
    max_retries=2,
)
def reprocess_scan(
    self,
    scan_id: str,
) -> dict[str, Any]:
    """
    Re-run the full pipeline for an existing scan.

    Fetches the original image URL from the scan record and calls
    process_scan's async implementation directly.

    Args:
        scan_id: UUID of the scan to reprocess
    """
    logger.info("Reprocess scan task received", scan_id=scan_id)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(_reprocess_scan_async(self, scan_id))


async def _reprocess_scan_async(
    task: Any,
    scan_id: str,
) -> dict[str, Any]:
    """Fetch the original scan record and re-run the pipeline."""
    from app.db.supabase_client import get_async_supabase_admin

    supabase = await get_async_supabase_admin()
    if not supabase:
        raise RuntimeError("Database not configured")

    resp = await (
        supabase.table("scans")
        .select("*")
        .eq("id", scan_id)
        .single()
        .execute()
    )
    scan = resp.data
    if not scan:
        raise ValueError(f"Scan {scan_id} not found")

    property_id = str(scan.get("property_id", ""))
    user_id     = str(scan.get("user_id") or scan.get("created_by_id") or "")
    scan_type   = scan.get("scan_type", "receipt")

    # Recover image URL from image_urls JSONB array or raw_results
    image_url: str | None = None
    image_urls = scan.get("image_urls") or []
    if image_urls:
        image_url = image_urls[0]
    elif (scan.get("raw_results") or {}).get("image_url"):
        image_url = scan["raw_results"]["image_url"]

    if not image_url:
        raise ValueError(f"No image URL recoverable for scan {scan_id}")

    return await _process_scan_async(
        task=task,
        scan_id=scan_id,
        property_id=property_id,
        user_id=user_id,
        image_url=image_url,
        scan_type=scan_type,
    )
