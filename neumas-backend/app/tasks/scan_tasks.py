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
from app.core.logging import get_logger, log_business_event

logger = get_logger(__name__)

_VENDOR_CREATE_CONFIDENCE_THRESHOLD = 0.80

# ── Unit-of-measure normalisation table ───────────────────────────────────────
_UNIT_MAP: dict[str, str] = {
    # Count / each
    "ct": "unit", "ea": "unit", "each": "unit",
    "pcs": "unit", "pc": "unit", "piece": "unit", "pieces": "unit",
    # Case / box
    "cs": "case", "case": "case", "cases": "case", "box": "box",
    # Weight – imperial
    "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    # Weight – metric
    "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gm": "g", "gr": "g", "gram": "g", "grams": "g",
    # Volume – metric
    "ml": "ml", "milliliter": "ml", "milliliters": "ml",
    "l": "l", "ltr": "l", "litre": "l", "litres": "l",
    "liter": "l", "liters": "l",
    # Volume – imperial
    "fl oz": "fl oz", "floz": "fl oz",
    # Packaging
    "doz": "dozen", "dozen": "dozen", "dzn": "dozen",
    "btl": "bottle", "bottle": "bottle", "bottles": "bottle",
    "bag": "bag", "bags": "bag",
    "pack": "pack", "packs": "pack", "pkt": "pack",
    "can": "can", "cans": "can",
    "roll": "roll", "rolls": "roll",
}


def _normalize_unit(raw: str | None) -> str:
    """Normalise a free-text unit string to a canonical form."""
    if not raw:
        return "unit"
    u = raw.strip().lower()
    return _UNIT_MAP.get(u, u) or "unit"


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
                .select("organization_id")
                .eq("id", property_id)
                .single()
                .execute()
            )
            org_id = (prop_resp.data or {}).get("organization_id", "")
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
    stage_details: dict[str, Any] = {}

    try:
        # =================================================================
        # Step 1 -- Mark scan as processing
        # =================================================================
        stage_started = time.perf_counter()
        await supabase.table("scans").update({
            "status": "processing",
            "started_at": datetime.now(UTC).isoformat(),
            "error_message": None,
        }).eq("id", scan_id).execute()
        stage_details["queue_to_processing_ms"] = int((time.perf_counter() - stage_started) * 1000)

        logger.info("Scan marked as processing", scan_id=scan_id)
        log_business_event(
            "scan.started",
            property_id=property_id,
            user_id=user_id,
            scan_id=scan_id,
            scan_type=scan_type,
        )

        # =================================================================
        # Step 2 -- Run VisionAgent
        # =================================================================
        stage_started = time.perf_counter()
        vision_agent = await get_vision_agent()
        vision_result = await vision_agent.analyze_receipt(
            image_url=image_url,
            scan_type=scan_type,
        )
        stage_details["ocr_ms"] = int((time.perf_counter() - stage_started) * 1000)

        if vision_result.get("error"):
            error_msg: str = vision_result["error"]
            logger.error("VisionAgent failed", scan_id=scan_id, error=error_msg)
            stage_errors = [{"stage": "ocr", "error": error_msg}]
            await _mark_failed(
                supabase,
                scan_id,
                error_msg,
                stage_details=stage_details,
                stage_errors=stage_errors,
            )
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

        # Emit review-required event when confidence is below threshold
        from app.core.constants import CONFIDENCE_REVIEW_THRESHOLD
        if vision_confidence < CONFIDENCE_REVIEW_THRESHOLD:
            log_business_event(
                "scan.document_review_required",
                property_id=property_id,
                user_id=user_id,
                scan_id=scan_id,
                confidence=vision_confidence,
                threshold=CONFIDENCE_REVIEW_THRESHOLD,
            )

        # =================================================================
        # Step 2b -- Duplicate receipt check (invoice + vendor combo)
        # =================================================================
        ms_after_vision = int((time.perf_counter() - wall_start) * 1000)

        if receipt_meta:
            dup_id = await _check_receipt_duplicate(supabase, property_id, receipt_meta, scan_id)
            if dup_id:
                logger.warning(
                    "Duplicate receipt detected — skipping inventory upsert",
                    scan_id=scan_id,
                    duplicate_of=dup_id,
                )
                await supabase.table("scans").update({
                    "status":             "completed",
                    "items_detected":     0,
                    "confidence_score":   str(vision_confidence),
                    "processing_time_ms": ms_after_vision,
                    "completed_at":       datetime.now(UTC).isoformat(),
                    "raw_results": {
                        "llm_provider": vision_result.get("llm_provider"),
                        "llm_model":    vision_result.get("llm_model"),
                        "duplicate_of_scan_id": dup_id,
                    },
                    "processed_results": {
                        "items":            extracted_items,
                        "receipt_metadata": receipt_meta,
                        "duplicate":        True,
                        "duplicate_of_scan_id": dup_id,
                        "confidence":       vision_confidence,
                        "stage_details": {
                            **stage_details,
                            "duplicate_check": "matched",
                        },
                        "stage_errors": [],
                    },
                }).eq("id", scan_id).execute()
                result["status"] = "completed"
                result["duplicate_of"] = dup_id
                result["items_upserted"] = 0
                return result

        # =================================================================
        # Step 3 -- Persist raw + processed results in scans table
        # =================================================================

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
        # Step 4 -- Resolve vendor + upsert items into inventory_items
        # =================================================================
        vendor_name = (receipt_meta.get("vendor_name") or "").strip()
        vendor_id: str | None = await _resolve_or_create_vendor_id(
            supabase=supabase,
            org_id=org_id,
            vendor_name=vendor_name,
            confidence=vision_confidence,
        )

        stage_started = time.perf_counter()
        upserted: list[dict[str, Any]] = []
        for item in extracted_items:
            try:
                inv_item = await _upsert_inventory_item(
                    supabase=supabase,
                    org_id=org_id,
                    property_id=property_id,
                    item=item,
                    vendor_id=vendor_id,
                    vendor_name=vendor_name,
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
        stage_details["inventory_upsert_ms"] = int((time.perf_counter() - stage_started) * 1000)
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
            stage_started = time.perf_counter()
            pattern_result = await recompute_patterns_for_property(
                UUID(property_id)
            )
            stage_details["baseline_recompute_ms"] = int((time.perf_counter() - stage_started) * 1000)
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
            stage_started = time.perf_counter()
            pred_result = await recompute_predictions_for_property(
                UUID(property_id)
            )
            stage_details["predictions_recompute_ms"] = int((time.perf_counter() - stage_started) * 1000)
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

        final_status = "partial_failed" if result["errors"] else "completed"
        stage_details["total_pipeline_ms"] = total_ms
        await supabase.table("scans").update({
            "status":             final_status,
            "processing_time_ms": total_ms,
            "completed_at":       datetime.now(UTC).isoformat(),
            "processed_results": {
                **processed_results,
                "stage_details": stage_details,
                "stage_errors": result["errors"],
            },
        }).eq("id", scan_id).execute()

        result["status"] = final_status
        result["processing_time_ms"] = total_ms
        result["receipt_metadata"] = receipt_meta

        log_business_event(
            "scan.completed",
            property_id=property_id,
            user_id=user_id,
            scan_id=scan_id,
            items_upserted=len(upserted),
            elapsed_ms=total_ms,
            errors=len(result["errors"]),
        )
        logger.info(
            "Scan processing complete",
            scan_id=scan_id,
            property_id=property_id,
            items_upserted=len(upserted),
            total_ms=total_ms,
            errors=len(result["errors"]),
        )

        # =================================================================
        # Step 8 -- Write structured audit log entry
        # =================================================================
        if org_id and user_id:
            try:
                from app.db.repositories.audit_logs import AuditLogsRepository
                await AuditLogsRepository().log_admin(
                    org_id=org_id,
                    user_id=user_id,
                    action="scan.completed",
                    resource_type="scan",
                    resource_id=scan_id,
                    property_id=property_id,
                    actor_role="system",
                    metadata={
                        "items_upserted": len(upserted),
                        "items_detected": len(extracted_items),
                        "scan_type": scan_type,
                        "confidence": vision_confidence,
                        "processing_time_ms": total_ms,
                        "partial_errors": len(result["errors"]),
                    },
                )
            except Exception as exc:
                logger.warning("Audit log write failed (non-fatal)", scan_id=scan_id, error=str(exc))

        return result

    except Exception as exc:
        error_msg = str(exc)
        logger.exception(
            "Scan processing failed",
            scan_id=scan_id,
            error=error_msg,
        )
        try:
            await _mark_failed(
                supabase,
                scan_id,
                error_msg,
                stage_details=stage_details,
                stage_errors=result.get("errors", []) + [{"stage": "pipeline", "error": error_msg}],
            )
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

async def _resolve_vendor_id(
    supabase: Any,
    org_id: str,
    vendor_name: str | None,
) -> str | None:
    """
    Resolve a raw vendor name string to a vendors.id UUID.

    Lookup order:
      1. vendor_aliases.alias_name  (catches OCR variants and abbreviations)
      2. vendors.name               (canonical match)

    Returns the vendor UUID string, or None if no match found.
    Non-fatal: any DB error returns None.
    """
    if not vendor_name or not org_id:
        return None

    raw = vendor_name.strip()
    if not raw:
        return None

    try:
        # 1. Check aliases first (broader coverage)
        alias_resp = await (
            supabase.table("vendor_aliases")
            .select("vendor_id")
            .eq("organization_id", org_id)
            .ilike("alias_name", raw)
            .limit(1)
            .execute()
        )
        if alias_resp.data:
            return str(alias_resp.data[0]["vendor_id"])

        # 2. Fall back to canonical vendors.name
        vendor_resp = await (
            supabase.table("vendors")
            .select("id")
            .eq("organization_id", org_id)
            .ilike("name", raw)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if vendor_resp.data:
            return str(vendor_resp.data[0]["id"])

    except Exception as exc:
        logger.warning(
            "Vendor ID resolution failed (non-fatal)",
            vendor_name=raw,
            org_id=org_id,
            error=str(exc),
        )

    return None


async def _resolve_or_create_vendor_id(
    supabase: Any,
    org_id: str,
    vendor_name: str | None,
    confidence: float,
    create_threshold: float = _VENDOR_CREATE_CONFIDENCE_THRESHOLD,
) -> str | None:
    """
    Resolve vendor by name; create and alias it only when confidence is high.

    This keeps ingestion conservative while still learning new suppliers from
    high-confidence receipts.
    """
    if not vendor_name or not org_id:
        return None

    clean_name = vendor_name.strip()
    if not clean_name:
        return None

    existing_id = await _resolve_vendor_id(supabase, org_id, clean_name)
    if existing_id:
        return existing_id

    if confidence < create_threshold:
        logger.info(
            "Vendor not found; skipping auto-create due to low confidence",
            vendor_name=clean_name,
            confidence=confidence,
            threshold=create_threshold,
        )
        return None

    normalized = clean_name.lower()
    try:
        create_resp = await (
            supabase.table("vendors")
            .upsert(
                {
                    "organization_id": org_id,
                    "name": clean_name,
                    "normalized_name": normalized,
                    "is_active": True,
                },
                on_conflict="organization_id,normalized_name",
            )
            .execute()
        )
        if not create_resp.data:
            return None

        created_vendor_id = str(create_resp.data[0]["id"])

        await (
            supabase.table("vendor_aliases")
            .upsert(
                {
                    "vendor_id": created_vendor_id,
                    "organization_id": org_id,
                    "alias_name": clean_name,
                    "source": "llm",
                },
                on_conflict="organization_id,alias_name",
            )
            .execute()
        )

        logger.info(
            "Auto-created vendor from high-confidence scan",
            vendor_name=clean_name,
            vendor_id=created_vendor_id,
            confidence=confidence,
        )
        return created_vendor_id
    except Exception as exc:
        logger.warning(
            "Vendor create-or-link failed (non-fatal)",
            vendor_name=clean_name,
            error=str(exc),
        )
        return None


async def _check_receipt_duplicate(
    supabase: Any,
    property_id: str,
    receipt_meta: dict[str, Any],
    current_scan_id: str,
) -> str | None:
    """
    Returns the scan_id of the first completed scan that has the same
    invoice_number + vendor_name combination, or None if no duplicate exists.
    Only checked when both fields are non-empty.
    """
    invoice_number = (receipt_meta.get("invoice_number") or "").strip()
    vendor_name    = (receipt_meta.get("vendor_name") or "").strip()

    if not invoice_number or not vendor_name:
        return None

    try:
        resp = await (
            supabase.table("scans")
            .select("id, processed_results")
            .eq("property_id", property_id)
            .eq("status", "completed")
            .neq("id", current_scan_id)
            .execute()
        )
        for row in (resp.data or []):
            pr   = row.get("processed_results") or {}
            meta = pr.get("receipt_metadata") or {}
            if (
                (meta.get("invoice_number") or "").strip().lower() == invoice_number.lower()
                and (meta.get("vendor_name") or "").strip().lower() == vendor_name.lower()
            ):
                return str(row["id"])
    except Exception as exc:
        logger.warning("Duplicate receipt check failed (non-fatal)", error=str(exc))

    return None


async def _mark_failed(
    supabase: Any,
    scan_id: str,
    error_msg: str,
    stage_details: dict[str, Any] | None = None,
    stage_errors: list[dict[str, Any]] | None = None,
) -> None:
    """Set scan status to failed and persist the error message."""
    await supabase.table("scans").update({
        "status":        "failed",
        "error_message": error_msg[:2000],   # guard against very long traces
        "completed_at":  datetime.now(UTC).isoformat(),
        "processed_results": {
            "stage_details": stage_details or {},
            "stage_errors": stage_errors or [],
        },
    }).eq("id", scan_id).execute()


async def _upsert_inventory_item(
    supabase: Any,
    org_id: str,
    property_id: str,
    item: dict[str, Any],
    vendor_id: str | None = None,
    vendor_name: str | None = None,
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
    unit       = _normalize_unit(item.get("unit"))

    # Look for existing item by name (case-insensitive)
    existing_resp = await (
        supabase.table("inventory_items")
        .select("id, quantity, vendor_id, supplier_info")
        .eq("property_id", property_id)
        .ilike("name", item_name)
        .limit(1)
        .execute()
    )

    if existing_resp.data:
        existing = existing_resp.data[0]
        new_qty = float(existing.get("quantity") or 0) + qty_to_add

        update_payload: dict[str, Any] = {"quantity": str(new_qty)}
        if vendor_id and not existing.get("vendor_id"):
            update_payload["vendor_id"] = vendor_id
        if vendor_name:
            supplier_info = existing.get("supplier_info") or {}
            if supplier_info.get("name") != vendor_name:
                supplier_info = {**supplier_info, "name": vendor_name}
                update_payload["supplier_info"] = supplier_info

        resp = await (
            supabase.table("inventory_items")
            .update(update_payload)
            .eq("id", existing["id"])
            .execute()
        )

        if not resp.data:
            logger.warning(
                "Inventory quantity update returned no data — possible RLS block",
                item_id=existing["id"],
                item_name=item_name,
                new_qty=new_qty,
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
        "organization_id":      org_id,
        "property_id":          property_id,
        "name":                 item_name,
        "quantity":             str(qty_to_add),
        "unit":                 unit,
        "is_active":            True,
    }
    if vendor_id:
        insert_payload["vendor_id"] = vendor_id
    if vendor_name:
        insert_payload["supplier_info"] = {"name": vendor_name}

    resp = await supabase.table("inventory_items").insert(insert_payload).execute()

    if not resp.data:
        logger.warning(
            "Inventory insert returned no data — possible RLS block on inventory_items",
            item_name=item_name,
            property_id=property_id,
        )
        return None

    logger.info(
        "Created new inventory item from scan",
        item_name=item_name,
        quantity=qty_to_add,
        property_id=property_id,
    )
    return resp.data[0]


@neumas_task(
    name="scans.backfill_inventory_vendor_links",
    bind=True,
    queue="scans",
    max_retries=1,
)
def backfill_inventory_vendor_links(
    self,
    org_id: str | None = None,
    min_confidence: float = _VENDOR_CREATE_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """
    One-time reconciliation task.

    Iterates completed scans and links inventory_items to vendor_id based on
    receipt_metadata.vendor_name + extracted item names.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        _backfill_inventory_vendor_links_async(
            org_id=org_id,
            min_confidence=min_confidence,
        )
    )


async def _backfill_inventory_vendor_links_async(
    org_id: str | None = None,
    min_confidence: float = _VENDOR_CREATE_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Backfill vendor links for existing inventory from completed scans."""
    from app.db.supabase_client import get_async_supabase_admin

    supabase = await get_async_supabase_admin()
    if not supabase:
        return {"status": "failed", "error": "Database not configured"}

    query = (
        supabase.table("scans")
        .select("id, organization_id, property_id, confidence_score, processed_results")
        .eq("status", "completed")
        .order("created_at", desc=False)
    )
    if org_id:
        query = query.eq("organization_id", org_id)

    scans_resp = await query.limit(5000).execute()
    scans = scans_resp.data or []

    linked_items = 0
    scans_processed = 0
    scans_with_vendor = 0

    for scan in scans:
        scans_processed += 1
        processed_results = scan.get("processed_results") or {}
        receipt_meta = processed_results.get("receipt_metadata") or {}
        items = processed_results.get("items") or []
        vendor_name = (receipt_meta.get("vendor_name") or "").strip()
        if not vendor_name:
            continue

        scan_confidence = float(scan.get("confidence_score") or 0)
        vendor_id = await _resolve_or_create_vendor_id(
            supabase=supabase,
            org_id=str(scan.get("organization_id") or ""),
            vendor_name=vendor_name,
            confidence=scan_confidence,
            create_threshold=min_confidence,
        )
        if not vendor_id:
            continue

        scans_with_vendor += 1
        for item in items:
            item_name = (item.get("item_name") or "").strip()
            if not item_name:
                continue

            upd_resp = await (
                supabase.table("inventory_items")
                .update({"vendor_id": vendor_id})
                .eq("property_id", str(scan.get("property_id")))
                .ilike("name", item_name)
                .is_("vendor_id", "null")
                .execute()
            )
            linked_items += len(upd_resp.data or [])

    summary = {
        "status": "completed",
        "scans_processed": scans_processed,
        "scans_with_vendor": scans_with_vendor,
        "items_linked": linked_items,
    }
    logger.info("Vendor link backfill complete", **summary)
    return summary


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
