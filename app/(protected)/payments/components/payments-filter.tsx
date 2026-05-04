"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const METHOD_OPTIONS = [
  { value: "ALL", label: "All Methods" },
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

type Student = { id: string; name: string };

export function PaymentsFilter({ students }: { students: Student[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const method = searchParams.get("method") ?? "ALL";
  const studentId = searchParams.get("studentId") ?? "ALL";
  const hasFilters = method !== "ALL" || studentId !== "ALL";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set("tab", "history");
    params.delete("page");
    router.push(`/payments?${params.toString()}`);
  }

  function clearFilters() {
    router.push("/payments?tab=history");
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={method} onValueChange={(v) => update("method", v)}>
        <SelectTrigger className="h-8 w-40 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METHOD_OPTIONS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={studentId} onValueChange={(v) => update("studentId", v)}>
        <SelectTrigger className="h-8 w-48 text-sm">
          <SelectValue placeholder="All Students" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Students</SelectItem>
          {students.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={clearFilters}
        >
          <XIcon className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
