"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  MailIcon,
  CheckIcon,
  ChevronDownIcon,
  SendIcon,
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
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 gap-1 shrink-0">
        <CheckCircle2Icon className="h-3 w-3" /> Paid
      </Badge>
    );
  if (due.isOverdue)
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 gap-1 shrink-0">
        <AlertCircleIcon className="h-3 w-3" /> Overdue
      </Badge>
    );
  if (due.isDueThisMonth)
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 gap-1 shrink-0">
        <ClockIcon className="h-3 w-3" /> Due this month
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1 shrink-0">
      Upcoming
    </Badge>
  );
}

function DueRow({
  due,
  onMarkPaid,
  reminding,
  onRemind,
}: {
  due: PaymentDue;
  onMarkPaid: (due: PaymentDue) => void;
  reminding: string | null;
  onRemind: (due: PaymentDue) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
        due.isOverdue
          ? "border-red-100 bg-red-50/40 hover:bg-red-50/70"
          : due.isDueThisMonth
          ? "border-amber-100 bg-amber-50/40 hover:bg-amber-50/70"
          : "border-border bg-card hover:bg-muted/30"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{due.studentName}</span>
          <span className="text-xs text-muted-foreground">
            {due.subjectName} · {due.packageName}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
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
            onClick={() => onRemind(due)}
            className="h-8 gap-1.5"
          >
            <MailIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {reminding === due.key ? "Sending…" : "Remind"}
            </span>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground italic hidden sm:inline">No email</span>
        )}
        <Button size="sm" onClick={() => onMarkPaid(due)} className="h-8 gap-1.5">
          <CheckIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Mark Paid</span>
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  variant,
  children,
  headerAction,
}: {
  title: string;
  count: number;
  variant: "overdue" | "due" | "upcoming";
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  const colors = {
    overdue: "text-red-700 bg-red-100/60 border-red-200",
    due: "text-amber-700 bg-amber-100/60 border-amber-200",
    upcoming: "text-muted-foreground bg-muted/40 border-border",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
              colors[variant]
            )}
          >
            {count}
          </span>
        </div>
        {headerAction}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function UpcomingDues({ dues }: { dues: PaymentDue[] }) {
  const [markPaid, setMarkPaid] = useState<PaymentDue | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

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

  async function handleSendAllReminders(overdueDues: PaymentDue[]) {
    const withEmail = overdueDues.filter((d) => d.recipientEmail);
    if (withEmail.length === 0) {
      toast.error("No overdue students have email addresses");
      return;
    }
    setSendingAll(true);
    let sent = 0;
    let failed = 0;
    for (const due of withEmail) {
      try {
        await sendPaymentReminderAction(due.enrollmentId, due.month);
        sent++;
      } catch {
        failed++;
      }
    }
    setSendingAll(false);
    if (sent > 0) toast.success(`Sent ${sent} reminder${sent !== 1 ? "s" : ""}`);
    if (failed > 0) toast.error(`${failed} reminder${failed !== 1 ? "s" : ""} failed`);
  }

  const overdue = dues.filter((d) => !d.isPaid && d.isOverdue);
  const dueThisMonth = dues.filter((d) => !d.isPaid && d.isDueThisMonth);
  const upcoming = dues.filter((d) => !d.isPaid && !d.isOverdue && !d.isDueThisMonth);
  const paid = dues.filter((d) => d.isPaid);

  if (dues.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No monthly enrollments found
      </div>
    );
  }

  const totalUnpaid = overdue.length + dueThisMonth.length;

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

      {totalUnpaid === 0 && upcoming.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2Icon className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-medium">All payments up to date</p>
          <p className="text-xs text-muted-foreground mt-1">
            No overdue or upcoming dues to action
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <Section
              title="Overdue"
              count={overdue.length}
              variant="overdue"
              headerAction={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50"
                  disabled={sendingAll}
                  onClick={() => handleSendAllReminders(overdue)}
                >
                  <SendIcon className="h-3 w-3" />
                  {sendingAll ? "Sending…" : "Send All Reminders"}
                </Button>
              }
            >
              {overdue.map((due) => (
                <DueRow
                  key={due.key}
                  due={due}
                  onMarkPaid={setMarkPaid}
                  reminding={reminding}
                  onRemind={handleSendReminder}
                />
              ))}
            </Section>
          )}

          {dueThisMonth.length > 0 && (
            <Section title="Due This Month" count={dueThisMonth.length} variant="due">
              {dueThisMonth.map((due) => (
                <DueRow
                  key={due.key}
                  due={due}
                  onMarkPaid={setMarkPaid}
                  reminding={reminding}
                  onRemind={handleSendReminder}
                />
              ))}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section title="Upcoming" count={upcoming.length} variant="upcoming">
              {upcoming.map((due) => (
                <DueRow
                  key={due.key}
                  due={due}
                  onMarkPaid={setMarkPaid}
                  reminding={reminding}
                  onRemind={handleSendReminder}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {paid.length > 0 && (
        <div className="mt-6 border-t pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-1 select-none"
            onClick={() => setPaidOpen((v) => !v)}
          >
            <span>
              {paid.length} paid this period
            </span>
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 transition-transform",
                paidOpen && "rotate-180"
              )}
            />
          </button>
          {paidOpen && (
            <div className="mt-2 space-y-1.5">
              {paid.map((due) => (
                <div
                  key={due.key}
                  className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50/30 px-4 py-2.5 opacity-75"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{due.studentName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {due.subjectName} · {due.monthLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-green-700">
                      {formatUSD(due.amount)}
                    </span>
                    <StatusBadge due={due} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
