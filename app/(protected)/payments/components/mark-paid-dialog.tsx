"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markPaymentPaidAction } from "@/app/actions/payments";
import { formatUSD } from "@/lib/utils/money";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  amount: string;
  month: string;
  monthLabel: string;
};

export function MarkPaidDialog({
  open,
  onOpenChange,
  enrollmentId,
  studentId,
  studentName,
  amount,
  month,
  monthLabel,
}: Props) {
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD" | "OTHER">("CASH");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await markPaymentPaidAction({ enrollmentId, studentId, amount, method, month });
      toast.success(`Payment recorded for ${studentName} — ${monthLabel}`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
          <DialogDescription>
            Record a payment of{" "}
            <strong>{formatUSD(amount)}</strong> for{" "}
            <strong>{studentName}</strong> — {monthLabel}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Payment Method</label>
            <Select
              value={method}
              onValueChange={(v) =>
                setMethod(v as "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              <CheckIcon className="mr-2 h-4 w-4" />
              {loading ? "Recording..." : "Confirm Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
