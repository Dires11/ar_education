"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deletePaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";

export function DeletePaymentButton({
  paymentId,
  studentId,
}: {
  paymentId: string;
  studentId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this payment record?")) return;
    setLoading(true);
    try {
      await deletePaymentAction(paymentId, studentId);
      toast.success("Payment deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={loading}
    >
      <TrashIcon className="h-3.5 w-3.5" />
    </Button>
  );
}
