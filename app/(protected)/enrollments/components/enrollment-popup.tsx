"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClockIcon,
  CreditCardIcon,
  PackageIcon,
  PercentIcon,
  UserRoundIcon,
} from "lucide-react";
import { getEnrollmentAction } from "@/app/actions/enrollments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentAvatar } from "@/components/entity-avatar";
import { formatCalendarDate, formatDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { EnrollmentStatusSelect } from "./enrollment-status";
import { DiscountManager } from "./discount-manager";
import { formatInstantInTimeZone } from "@/lib/utils/time-zone";

type EnrollmentData = NonNullable<Awaited<ReturnType<typeof getEnrollmentAction>>>;

const SESSION_STATUS_COLORS = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  NO_SHOW: "bg-red-100 text-red-800",
  CANCELLED_BY_TUTOR: "bg-orange-100 text-orange-800",
  CANCELLED_BY_STUDENT: "bg-orange-100 text-orange-800",
};

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return new Date(value).toISOString().split("T")[0];
}

export function EnrollmentPopup({
  enrollmentId,
  centerTimeZone,
  open,
  onOpenChange,
}: {
  enrollmentId: string | null;
  centerTimeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("discounts");

  const loadEnrollment = useCallback(async () => {
    if (!enrollmentId) return;
    setLoading(true);
    try {
      const data = await getEnrollmentAction(enrollmentId);
      setEnrollment(data ?? null);
    } catch {
      toast.error("Failed to load enrollment");
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    if (open && enrollmentId) {
      loadEnrollment();
    } else {
      setEnrollment(null);
    }
  }, [loadEnrollment, open, enrollmentId]);

  const effectivePrice = enrollment
    ? enrollment.customPriceOverride ?? enrollment.priceAtEnrollment
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setActiveTab("discounts");
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-4xl [&_[data-slot=dialog-close]]:!right-6 [&_[data-slot=dialog-close]]:!top-6">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {enrollment
              ? `${enrollment.student.firstName} ${enrollment.student.lastName} enrollment`
              : "Enrollment details"}
          </DialogTitle>
          <DialogDescription>
            Review enrollment details, discounts, sessions, and payments.
          </DialogDescription>
        </DialogHeader>

        {loading && !enrollment ? (
          <div className="flex h-40 items-center justify-center p-6 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !enrollment ? null : (
          <div className="max-h-[85dvh] space-y-4 overflow-y-auto p-4">
            <section className="rounded-2xl border bg-gradient-to-br from-teal-50 via-background to-cyan-50 px-4 py-4 pr-16">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <StudentAvatar
                      firstName={enrollment.student.firstName}
                      lastName={enrollment.student.lastName}
                      avatarUrl={enrollment.student.avatarUrl}
                      size="lg"
                      className="h-10 w-10 rounded-2xl"
                    />
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">
                        {enrollment.student.firstName}{" "}
                        {enrollment.student.lastName}
                        <span className="mx-2 font-normal text-muted-foreground">
                          -
                        </span>
                        {enrollment.subject.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {enrollment.package.name} with{" "}
                        {enrollment.tutor.firstName} {enrollment.tutor.lastName}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EnrollmentStatusSelect
                      enrollmentId={enrollment.id}
                      studentId={enrollment.studentId}
                      currentStatus={enrollment.status}
                      onUpdated={loadEnrollment}
                    />
                    <Badge variant="outline" className="rounded-full bg-background/80">
                      Started {formatCalendarDate(enrollment.startDate)}
                    </Badge>
                    <Badge variant="outline" className="rounded-full bg-background/80">
                      {formatUSD(effectivePrice)}
                    </Badge>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <PackageIcon className="h-4 w-4" />
                  <p className="text-xs uppercase tracking-[0.2em]">Package</p>
                </div>
                <p className="text-sm font-medium">
                  {enrollment.package.type === "MONTHLY"
                    ? "Subscription"
                    : "Per Session"}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <CreditCardIcon className="h-4 w-4" />
                  <p className="text-xs uppercase tracking-[0.2em]">Price</p>
                </div>
                <p className="text-sm font-semibold">{formatUSD(effectivePrice)}</p>
                {enrollment.customPriceOverride && (
                  <p className="text-xs text-muted-foreground">
                    Enrollment price:{" "}
                    {formatUSD(enrollment.priceAtEnrollment)}
                  </p>
                )}
              </div>
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <PercentIcon className="h-4 w-4" />
                  <p className="text-xs uppercase tracking-[0.2em]">Discounts</p>
                </div>
                <p className="text-2xl font-semibold">
                  {enrollment.discounts.length}
                </p>
              </div>
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                  <UserRoundIcon className="h-4 w-4" />
                  <p className="text-xs uppercase tracking-[0.2em]">Tutor</p>
                </div>
                <p className="text-sm font-medium">
                  {enrollment.tutor.firstName} {enrollment.tutor.lastName}
                </p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="discounts">
                  Discounts ({enrollment.discounts.length})
                </TabsTrigger>
                <TabsTrigger value="sessions">
                  Sessions ({enrollment.sessions.length})
                </TabsTrigger>
                <TabsTrigger value="payments">
                  Payments ({enrollment.payments.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="discounts" className="pt-2">
                <DiscountManager
                  enrollmentId={enrollment.id}
                  studentId={enrollment.studentId}
                  discounts={enrollment.discounts.map((d) => ({
                    id: d.id,
                    kind: d.kind,
                    value: d.value.toString(),
                    temporary: d.temporary,
                    validFrom: toDateInput(d.validFrom),
                    validUntil: toDateInput(d.validUntil),
                    usesRemaining: d.usesRemaining ?? undefined,
                    notes: d.notes ?? undefined,
                  }))}
                  onUpdated={loadEnrollment}
                />
              </TabsContent>

              <TabsContent value="sessions" className="pt-2">
                {enrollment.sessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                    No sessions yet.{" "}
                    <Link href="/schedule" className="underline">
                      Go to schedule
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Attendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollment.sessions.map((session) => (
                          <TableRow key={session.id}>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <CalendarClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                {formatInstantInTimeZone(
                                  session.scheduledFor,
                                  "MMM d, yyyy h:mm a",
                                  centerTimeZone,
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SESSION_STATUS_COLORS[session.status]}`}
                              >
                                {session.status.replace(/_/g, " ")}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {session.attendance
                                .map(
                                  (a) =>
                                    `${a.student.firstName} ${a.student.lastName}${
                                      a.billable ? " paid" : ""
                                    }`,
                                )
                                .join(", ") || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="pt-2">
                {enrollment.payments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                    No payments tagged to this enrollment yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollment.payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="text-sm">
                              {formatDate(payment.paidAt)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {formatUSD(payment.amount)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {payment.method}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {payment.notes ?? "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
