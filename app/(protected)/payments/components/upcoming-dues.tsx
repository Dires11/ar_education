"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  MailIcon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendPaymentReminderAction } from "@/app/actions/payments";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { formatUSD } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import type { PaymentDue } from "@/lib/services/payments";

function StatusBadge({ due }: { due: PaymentDue }) {
  if (due.isPaid)
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 gap-1">
        <CheckCircle2Icon className="h-3 w-3" /> Paid
      </Badge>
    );
  if (due.isOverdue)
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 gap-1">
        <AlertCircleIcon className="h-3 w-3" /> Overdue
      </Badge>
    );
  if (due.isDueThisMonth)
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 gap-1">
        <ClockIcon className="h-3 w-3" /> Due this month
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      Upcoming
    </Badge>
  );
}

export function UpcomingDues({ dues }: { dues: PaymentDue[] }) {
  const [markPaid, setMarkPaid] = useState<PaymentDue | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);

  async function handleSendReminder(due: PaymentDue) {
    setReminding(due.key);
    try {
      await sendPaymentReminderAction(due.enrollmentId, due.month);
      toast.success(`Reminder sent to ${due.studentName}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send reminder");
    } finally {
      setReminding(null);
    }
  }

  const unpaid = dues.filter((d) => !d.isPaid);
  const paid = dues.filter((d) => d.isPaid);

  if (dues.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No monthly enrollments found
      </div>
    );
  }

  return (
    <>
      {markPaid && (
        <MarkPaidDialog
          open={!!markPaid}
          onOpenChange={(v) => !v && setMarkPaid(null)}
          enrollmentId={markPaid.enrollmentId}
          studentId={markPaid.studentId}
          studentName={markPaid.studentName}
          amount={markPaid.amount}
          month={markPaid.month}
          monthLabel={markPaid.monthLabel}
        />
      )}

      <div className="space-y-1">
        {unpaid.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            All payments up to date
          </div>
        )}

        {unpaid.map((due) => (
          <div
            key={due.key}
            className={cn(
              "flex items-center gap-4 rounded-xl border px-4 py-3",
              due.isOverdue
                ? "border-red-100 bg-red-50/40"
                : due.isDueThisMonth
                ? "border-amber-100 bg-amber-50/40"
                : "border-border bg-card"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{due.studentName}</span>
                <span className="text-xs text-muted-foreground">
                  {due.subjectName} · {due.packageName}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-sm font-semibold">{formatUSD(due.amount)}</span>
                <span className="text-xs text-muted-foreground">{due.monthLabel}</span>
                <StatusBadge due={due} />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {due.recipientEmail ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reminding === due.key}
                  onClick={() => handleSendReminder(due)}
                  className="gap-1.5"
                >
                  <MailIcon className="h-3.5 w-3.5" />
                  {reminding === due.key ? "Sending..." : "Remind"}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground italic">No email</span>
              )}
              <Button
                size="sm"
                onClick={() => setMarkPaid(due)}
                className="gap-1.5"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Mark Paid
              </Button>
            </div>
          </div>
        ))}

        {paid.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground select-none py-2 hover:text-foreground transition-colors">
              {paid.length} paid payment{paid.length !== 1 ? "s" : ""} this period
            </summary>
            <div className="space-y-1 mt-2">
              {paid.map((due) => (
                <div
                  key={due.key}
                  className="flex items-center gap-4 rounded-xl border border-green-100 bg-green-50/30 px-4 py-2.5 opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{due.studentName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {due.subjectName} · {due.monthLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-green-700">
                      {formatUSD(due.amount)}
                    </span>
                    <StatusBadge due={due} />
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
