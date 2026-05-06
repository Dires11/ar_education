"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback, useRef } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonStatus } from "@/generated/prisma";

export function StudentsSearch({
  defaultSearch,
  defaultStatus,
}: {
  defaultSearch?: string;
  defaultStatus?: PersonStatus;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateParams = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1 pr-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Filter Students
        </p>
        <p className="text-sm text-muted-foreground">
          Search by student or guardian name and narrow by status.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search students or guardians..."
            defaultValue={defaultSearch}
            className="h-10 w-full pl-9 sm:min-w-[320px]"
            onChange={(e) => {
              const value = e.target.value;
              if (searchTimer.current) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(
                () => updateParams("search", value || undefined),
                300
              );
            }}
          />
        </div>
        <Select
          defaultValue={defaultStatus ?? "ALL"}
          onValueChange={(v) =>
            updateParams("status", v === "ALL" ? undefined : v)
          }
        >
          <SelectTrigger className="h-10 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value={PersonStatus.ACTIVE}>Active</SelectItem>
            <SelectItem value={PersonStatus.PAUSED}>Paused</SelectItem>
            <SelectItem value={PersonStatus.INACTIVE}>Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(defaultSearch || defaultStatus) && (
          <Badge variant="secondary" className="h-10 rounded-xl px-3">
            Active filters
          </Badge>
        )}
      </div>
    </div>
  );
}
