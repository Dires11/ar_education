import { notFound } from "next/navigation";
import Link from "next/link";
import { getTutor, getTutorPayrollSessions } from "@/lib/data/tutors";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Prisma } from "@/generated/prisma";
import { ArchiveTutorButton } from "../components/archive-button";
import { EditTutorDialog } from "../components/edit-tutor-dialog";

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  INACTIVE: "bg-gray-100 text-gray-700",
};

export default async function TutorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tutor = await getTutor(id);

  if (!tutor) notFound();

  // Payroll: current month by default
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const payrollSessions = await getTutorPayrollSessions(id, monthStart, monthEnd);
  const totalMinutes = payrollSessions.reduce((s, sess) => s + sess.durationMinutes, 0);
  const totalHours = new Prisma.Decimal(totalMinutes).div(60);
  const earnings = totalHours.mul(tutor.hourlyRate);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {tutor.firstName} {tutor.lastName}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[tutor.status]}`}
            >
              {tutor.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{tutor.email}</p>
        </div>
        <div className="flex gap-2">
          <EditTutorDialog
            tutorId={id}
            defaultValues={{
              firstName: tutor.firstName,
              lastName: tutor.lastName,
              avatarUrl: tutor.avatarUrl ?? "",
              avatarPublicId: tutor.avatarPublicId ?? "",
              email: tutor.email,
              phone: tutor.phone,
              hourlyRate: tutor.hourlyRate.toString(),
              notes: tutor.notes ?? "",
            }}
          />
          {tutor.status !== "INACTIVE" && <ArchiveTutorButton tutorId={id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Phone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{tutor.phone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hourly Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">{formatUSD(tutor.hourlyRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {tutor.subjects.map((ts) => ts.subject.name).join(", ") || "None assigned"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="enrollments">
        <TabsList>
          <TabsTrigger value="enrollments">
            Active Enrollments ({tutor.enrollments.length})
          </TabsTrigger>
          <TabsTrigger value="payroll">Payroll (This Month)</TabsTrigger>
        </TabsList>

        <TabsContent value="enrollments" className="mt-4">
          {tutor.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active enrollments</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tutor.enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <Link
                          href={`/students/${enrollment.studentId}`}
                          className="hover:underline font-medium"
                        >
                          {enrollment.student.firstName} {enrollment.student.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>{enrollment.subject.name}</TableCell>
                      <TableCell>{enrollment.package.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(enrollment.startDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{payrollSessions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totalHours.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Earned</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatUSD(earnings)}</p>
              </CardContent>
            </Card>
          </div>

          {payrollSessions.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="text-sm">{formatDateTime(session.scheduledFor)}</TableCell>
                      <TableCell className="text-sm">
                        {session.enrollment?.student
                          ? `${session.enrollment.student.firstName} ${session.enrollment.student.lastName}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{session.subject.name}</TableCell>
                      <TableCell className="text-sm">{session.durationMinutes} min</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {tutor.notes && (
        <div className="rounded-md border p-4">
          <p className="text-sm font-medium mb-1">Notes</p>
          <p className="text-sm text-muted-foreground">{tutor.notes}</p>
        </div>
      )}
    </div>
  );
}
