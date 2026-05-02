import Link from "next/link";
import { listPayments } from "@/lib/services/payments";
import { getUpcomingPaymentDues } from "@/lib/services/payments";
import { listStudents } from "@/lib/data/students";
import { listEnrollments } from "@/lib/data/enrollments";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { DeletePaymentButton } from "./components/delete-payment-button";
import { NewPaymentDialog } from "./components/new-payment-dialog";
import { UpcomingDues } from "./components/upcoming-dues";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  OTHER: "Other",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const tab = params.tab ?? "upcoming";

  const [{ payments, total, pageSize }, studentsData, enrollments, dues] =
    await Promise.all([
      listPayments({ page }),
      listStudents({ status: "ACTIVE", pageSize: 200 }),
      listEnrollments({ status: "ACTIVE" }),
      getUpcomingPaymentDues(),
    ]);
  const totalPages = Math.ceil(total / pageSize);

  const overdueCount = dues.filter((d) => !d.isPaid && d.isOverdue).length;
  const dueCount = dues.filter((d) => !d.isPaid && d.isDueThisMonth).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {overdueCount > 0 && (
              <span className="text-red-600 font-medium">{overdueCount} overdue · </span>
            )}
            {dueCount > 0 && (
              <span className="text-amber-600 font-medium">{dueCount} due this month · </span>
            )}
            {total} recorded
          </p>
        </div>
        <NewPaymentDialog
          students={studentsData.students.map((s) => ({
            id: s.id,
            name: `${s.firstName} ${s.lastName}`,
          }))}
          enrollments={enrollments.map((e) => ({
            id: e.id,
            studentId: e.studentId,
            label: `${e.subject.name} — ${e.package.name}`,
          }))}
        />
      </div>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="upcoming" asChild>
            <Link href="/payments?tab=upcoming">
              Upcoming Dues
              {(overdueCount + dueCount) > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-semibold leading-none">
                  {overdueCount + dueCount}
                </span>
              )}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="history" asChild>
            <Link href="/payments?tab=history">History</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingDues dues={dues} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Enrollment</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Recorded By</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-8"
                    >
                      No payments recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/students/${payment.studentId}`}
                          className="font-medium text-sm hover:underline"
                        >
                          {payment.student.firstName} {payment.student.lastName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {formatUSD(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {METHOD_LABELS[payment.method]}
                      </TableCell>
                      <TableCell className="text-sm">
                        {payment.enrollment ? (
                          <Link
                            href={`/enrollments/${payment.enrollmentId}`}
                            className="hover:underline text-muted-foreground"
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
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm mt-4">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/payments?tab=history&page=${page - 1}`}>
                      Previous
                    </Link>
                  </Button>
                )}
                {page < totalPages && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/payments?tab=history&page=${page + 1}`}>
                      Next
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
