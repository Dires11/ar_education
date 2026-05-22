"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetaPillItem = {
  icon: LucideIcon;
  label?: React.ReactNode;
  mobileLabel?: React.ReactNode;
  hideLabelOnMobile?: boolean;
};

export function MetaPill({
  items,
  compact = false,
}: {
  items: MetaPillItem[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground",
        compact
          ? "shrink-0 whitespace-nowrap max-sm:gap-1.5 max-sm:px-2"
          : "shrink-0 flex-wrap",
      )}
    >
      {items.map((item, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1">
          <item.icon className="h-3.5 w-3.5 shrink-0" />
          {item.label !== undefined && (
            <span
              className={cn(
                "font-medium text-foreground",
                item.hideLabelOnMobile && "max-sm:sr-only",
              )}
            >
              {item.mobileLabel !== undefined ? (
                <>
                  <span className="sm:hidden">{item.mobileLabel}</span>
                  <span className="max-sm:hidden">{item.label}</span>
                </>
              ) : (
                item.label
              )}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
