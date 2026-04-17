/**
 * VendorCard — renders a single vendor record.
 */
"use client";

import { type Vendor } from "@/lib/api/endpoints";

interface VendorCardProps {
  vendor: Vendor;
}

export function VendorCard({ vendor }: VendorCardProps) {
  return (
    <div className="border border-gray-100 rounded-xl bg-white p-4 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{vendor.name}</p>
          {!vendor.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              Inactive
            </span>
          )}
        </div>
        {vendor.contact_name && (
          <p className="text-sm text-gray-600 mt-0.5">{vendor.contact_name}</p>
        )}
        <div className="flex flex-wrap gap-3 mt-1">
          {vendor.contact_email && (
            <a
              href={`mailto:${vendor.contact_email}`}
              className="text-xs text-blue-600 hover:underline"
            >
              {vendor.contact_email}
            </a>
          )}
          {vendor.phone && (
            <span className="text-xs text-gray-500">{vendor.phone}</span>
          )}
        </div>
        {vendor.notes && (
          <p className="text-xs text-gray-400 mt-1 italic">{vendor.notes}</p>
        )}
      </div>
      <p className="text-xs text-gray-400 shrink-0">
        {new Date(vendor.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
