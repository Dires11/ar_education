"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelSessionAction } from "@/app/actions/sessions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel(by: "TUTOR" | "STUDENT") {
    setLoading(true);
    try {
      await cancelSessionAction(sessionId, by);
      toast.success("Session cancelled");
      router.refresh();
    } catch {
      toast.error("Failed to cancel session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          Cancel
          <ChevronDownIcon className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleCancel("TUTOR")}>
          Cancelled by Tutor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCancel("STUDENT")}>
          Cancelled by Student
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
