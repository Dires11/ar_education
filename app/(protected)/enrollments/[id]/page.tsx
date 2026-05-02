import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollment } from "@/lib/services/enrollments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { EnrollmentStatusSelect } from "../components/enrollment-status";
import { DiscountManager } from "../components/discount-manager";

const SESSION_STATUS_COLORS = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  NO_SHOW: "bg-red-100 text-red-800",
  CANCELLED_BY_TUTOR: "bg-orange-100 text-orange-800",
  CANCELLED_BY_STUDENT: "bg-orange-100 text-orange-800",
};

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const enrollment = await getEnrollment(id);

  if (!enrollment) notFound();

  const effectivePrice =
    enrollment.customPriceOverride ?? enrollment.package.basePrice;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            <Link
              href={`/students/${enrollment.studentId}`}
              className="hover:underline"
            >
              {enrollment.student.firstName} {enrollment.student.lastName}
            </Link>
            <span className="text-muted-foreground font-normal mx-2">—</span>
            {enrollment.subject.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {enrollment.package.name} · Tutor:{" "}
            {enrollment.tutor.firstName} {enrollment.tutor.lastName} ·
            Started {formatDate(enrollment.startDate)}
          </p>
        </div>
        <EnrollmentStatusSelect
          enrollmentId={id}
          studentId={enrollment.studentId}
          currentStatus={enrollment.status}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Package Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {enrollment.package.type === "MONTHLY"
                ? "Subscription"
                : "Per Session"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Effective Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">{formatUSD(effectivePrice)}</p>
            {enrollment.customPriceOverride && (
              <p className="text-xs text-muted-foreground">
                Base: {formatUSD(enrollment.package.basePrice)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Discounts Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {enrollment.discounts.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="discounts">
        <TabsList>
          <TabsTrigger value="discounts">
            Discounts ({enrollment.discounts.length})
          </TabsTrigger>
          <TabsTrigger value="sessions">
            Recent Sessions ({enrollment.sessions.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments ({enrollment.payments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discounts" className="mt-4">
          <DiscountManager
            enrollmentId={id}
            studentId={enrollment.studentId}
            discounts={enrollment.discounts.map((d) => ({
              id: d.id,
              kind: d.kind,
              value: d.value.toString(),
              temporary: d.temporary,
              validFrom: d.validFrom?.toISOString().split("T")[0] ?? undefined,
              validUntil:
                d.validUntil?.toISOString().split("T")[0] ?? undefined,
              usesRemaining: d.usesRemaining ?? undefined,
              notes: d.notes ?? undefined,
            }))}
          />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          {enrollment.sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No sessions yet.{" "}
              <Link href="/schedule" className="underline">
                Go to schedule
              </Link>
            </div>
          ) : (
            <div className="rounded-md border">
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
                        <Link
                          href={`/schedule/${session.id}`}
                          className="hover:underline"
                        >
                          {formatDateTime(session.scheduledFor)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SESSION_STATUS_COLORS[session.status]}`}
                        >
                          {session.status.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {session.attendance.map((a) =>
                          `${a.student.firstName} ${a.student.lastName}${a.billable ? " ✓" : ""}`
                        ).join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {enrollment.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments tagged to this enrollment yet.
            </p>
          ) : (
            <div className="rounded-md border">
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
                  {enrollment.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {formatDate(p.paidAt)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {formatUSD(p.amount)}
                      </TableCell>
                      <TableCell className="text-sm">{p.method}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.notes ?? "—"}
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
  );
}
