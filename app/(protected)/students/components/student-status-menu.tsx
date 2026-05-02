"use client";

import { ChevronDownIcon } from "lucide-react";
import { PersonStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_STYLES: Record<PersonStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  PAUSED: "bg-amber-100 text-amber-800 border-amber-200",
  INACTIVE: "bg-orange-100 text-orange-800 border-orange-200",
};

const STATUS_LABELS: Record<PersonStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  INACTIVE: "Inactive",
};

export function StudentStatusMenu({
  status,
  onChange,
  disabled = false,
  className,
}: {
  status: PersonStatus;
  onChange: (status: PersonStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
            STATUS_STYLES[status],
            className
          )}
        >
          <span>{STATUS_LABELS[status]}</span>
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => onChange(value as PersonStatus)}
        >
          <DropdownMenuRadioItem value="ACTIVE">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Active
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="PAUSED">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Paused
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="INACTIVE">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              Inactive
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
