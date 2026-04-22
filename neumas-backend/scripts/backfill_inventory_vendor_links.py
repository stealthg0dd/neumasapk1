"""
One-time reconciliation utility for inventory_items.vendor_id.

This script scans completed receipts and links inventory_items rows to vendors
using receipt_metadata.vendor_name + extracted line-item names.

Usage:
    uv run python scripts/backfill_inventory_vendor_links.py [--org-id UUID] [--min-confidence 0.8]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main(org_id: str | None, min_confidence: float) -> None:
    from app.tasks.scan_tasks import _backfill_inventory_vendor_links_async

    result = await _backfill_inventory_vendor_links_async(
        org_id=org_id,
        min_confidence=min_confidence,
    )
    print(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill inventory vendor links from completed scans")
    parser.add_argument("--org-id", default=None, help="Limit backfill to one organization UUID")
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.80,
        help="Minimum confidence required before auto-creating unknown vendors",
    )
    args = parser.parse_args()

    asyncio.run(main(org_id=args.org_id, min_confidence=args.min_confidence))
