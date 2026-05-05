import Link from "next/link";
import { Suspense } from "react";
import {
  listPayments,
  getPaymentStats,
  getUpcomingPaymentDues,
} from "@/lib/services/payments";
import { listStudents } from "@/lib/data/students";
import { listEnrollments } from "@/lib/data/enrollments";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { formatDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { DeletePaymentButton } from "./components/delete-payment-button";
import { NewPaymentDialog } from "./components/new-payment-dialog";
import { UpcomingDues } from "./components/upcoming-dues";
import { PaymentsFilter } from "./components/payments-filter";
import {
  TrendingUpIcon,
  AlertCircleIcon,
  ClockIcon,
  ReceiptIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

const METHOD_CONFIG: Record<string, { label: string; className: string }> = {
  CASH: {
    label: "Cash",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  BANK_TRANSFER: {
    label: "Bank Transfer",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  CARD: {
    label: "Card",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  OTHER: {
    label: "Other",
    className: "border-gray-200 bg-gray-50 text-gray-700",
  },
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    tab?: string;
    method?: string;
    studentId?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const tab = params.tab ?? "upcoming";
  const methodFilter = params.method;
  const studentIdFilter = params.studentId;

  const [
    { payments, total, pageSize },
    studentsData,
    enrollments,
    dues,
    stats,
  ] = await Promise.all([
    listPayments({
      page,
      method: methodFilter,
      studentId: studentIdFilter,
    }),
    listStudents({ status: "ACTIVE", pageSize: 200 }),
    listEnrollments({ status: "ACTIVE" }),
    getUpcomingPaymentDues(),
    getPaymentStats(),
  ]);

  const totalPages = Math.ceil(total / pageSize);
  const overdueCount = dues.filter((d) => !d.isPaid && d.isOverdue).length;
  const dueCount = dues.filter((d) => !d.isPaid && d.isDueThisMonth).length;
  const urgentCount = overdueCount + dueCount;

  const studentList = studentsData.students.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
  }));

  const enrollmentList = enrollments.map((e) => ({
    id: e.id,
    studentId: e.studentId,
    label: `${e.subject.name} — ${e.package.name}`,
  }));

  const revenueChange =
    stats.lastMonthTotal > 0
      ? ((stats.thisMonthTotal - stats.lastMonthTotal) / stats.lastMonthTotal) *
        100
      : null;

  return (
    <div className="space-y-6">
      <PageHero
        label="Financial Overview"
        title="Payments"
        description="Track incoming payments, manage billing cycles, and follow up on overdue balances across all active enrollments."
        gradient="from-emerald-50 via-background to-teal-50"
        stats={[
          {
            icon: TrendingUpIcon,
            label: "This Month",
            value:
              revenueChange !== null
                ? `${formatUSD(stats.thisMonthTotal)} (${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(0)}%)`
                : formatUSD(stats.thisMonthTotal),
          },
          {
            icon: ReceiptIcon,
            label: "Last Month",
            value: formatUSD(stats.lastMonthTotal),
          },
          {
            icon: AlertCircleIcon,
            label: "Overdue",
            value: overdueCount,
          },
          {
            icon: ClockIcon,
            label: "Due This Month",
            value: dueCount,
          },
        ]}
        action={
          <NewPaymentDialog
            students={studentList}
            enrollments={enrollmentList}
          />
        }
      />

      <Tabs defaultValue={tab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="h-9">
            <TabsTrigger value="upcoming" asChild>
              <Link href="/payments?tab=upcoming" className="gap-1.5">
                Upcoming Dues
                {urgentCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-destructive/45 text-destructive-foreground text-[10px] font-semibold leading-none h-4 min-w-4 px-1">
                    {urgentCount}
                  </span>
                )}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="history" asChild>
              <Link href="/payments?tab=history" className="gap-1.5">
                History
                <span className="text-muted-foreground text-[11px]">
                  {stats.total}
                </span>
              </Link>
            </TabsTrigger>
          </TabsList>

          {tab === "history" && (
            <Suspense>
              <PaymentsFilter students={studentList} />
            </Suspense>
          )}
        </div>

        {/* Upcoming dues tab */}
        <TabsContent value="upcoming" className="mt-4">
          <UpcomingDues dues={dues} />
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-4 space-y-4">
          {(methodFilter || studentIdFilter) && (
            <p className="text-sm text-muted-foreground">
              Showing {total} result{total !== 1 ? "s" : ""}
              {methodFilter && (
                <> · {METHOD_CONFIG[methodFilter]?.label ?? methodFilter}</>
              )}
              {studentIdFilter && (
                <>
                  {" "}
                  · {studentList.find((s) => s.id === studentIdFilter)?.name}
                </>
              )}
            </p>
          )}

          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Method
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Enrollment
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Covers
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Notes</TableHead>
                  <TableHead className="text-xs font-semibold">
                    Recorded By
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-16 text-center text-sm text-muted-foreground"
                    >
                      No payments found
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => {
                    const methodCfg = METHOD_CONFIG[payment.method] ?? {
                      label: payment.method,
                      className: "border-gray-200 bg-gray-50 text-gray-700",
                    };
                    return (
                      <TableRow key={payment.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(payment.paidAt)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href="/students"
                            className="font-medium text-sm hover:text-primary transition-colors"
                          >
                            {payment.student.firstName}{" "}
                            {payment.student.lastName}
                          </Link>
                        </TableCell>
                        <TableCell className="font-semibold text-sm">
                          {formatUSD(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${methodCfg.className}`}
                          >
                            {methodCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {payment.enrollment ? (
                            <Link
                              href="/enrollments"
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              {payment.enrollment.subject.name} ·{" "}
                              {payment.enrollment.package.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.coversMonth ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                          {payment.notes ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.recordedBy.name}
                        </TableCell>
                        <TableCell>
                          <DeletePaymentButton
                            paymentId={payment.id}
                            studentId={payment.studentId}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} records
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  asChild={page > 1}
                >
                  {page > 1 ? (
                    <Link
                      href={`/payments?tab=history&page=${page - 1}${methodFilter ? `&method=${methodFilter}` : ""}${studentIdFilter ? `&studentId=${studentIdFilter}` : ""}`}
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Link>
                  ) : (
                    <ChevronLeftIcon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages}
                  asChild={page < totalPages}
                >
                  {page < totalPages ? (
                    <Link
                      href={`/payments?tab=history&page=${page + 1}${methodFilter ? `&method=${methodFilter}` : ""}${studentIdFilter ? `&studentId=${studentIdFilter}` : ""}`}
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
