import Link from "next/link";
import { listEnrollments } from "@/lib/services/enrollments";
import { listStudents } from "@/lib/data/students";
import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listPackages } from "@/lib/data/packages";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { NewEnrollmentDialog } from "./components/new-enrollment-dialog";
import { PageHero } from "@/components/page-hero";
import { ClipboardListIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { StudentAvatar } from "@/components/entity-avatar";

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-gray-100 text-gray-700",
};

export default async function EnrollmentsPage() {
  const [enrollments, studentsData, tutorsData, subjects, packages] =
    await Promise.all([
      listEnrollments({ status: "ACTIVE" }),
      listStudents({ status: "ACTIVE", pageSize: 200 }),
      listTutors({ status: "ACTIVE" }),
      listSubjects(),
      listPackages(true),
    ]);

  const uniqueStudents = new Set(
    enrollments.map((e) => e.student.id)
  ).size;

  return (
    <div className="space-y-6">
      <PageHero
        label="Active Enrollments"
        title="Enrollments"
        description="Track active student–tutor pairings, manage pricing overrides, and monitor session activity."
        gradient="from-teal-50 via-background to-cyan-50"
        stats={[
          {
            icon: ClipboardListIcon,
            label: "Active",
            value: enrollments.length,
          },
          {
            icon: UsersIcon,
            label: "Students Enrolled",
            value: uniqueStudents,
          },
          {
            icon: UserCheckIcon,
            label: "Tutors Active",
            value: new Set(enrollments.map((e) => e.tutor.id)).size,
          },
        ]}
        action={
          <NewEnrollmentDialog
            students={studentsData.students.map((s) => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName}`,
            }))}
            tutors={tutorsData.tutors.map((t) => ({
              id: t.id,
              name: `${t.firstName} ${t.lastName}`,
              subjectIds: t.subjects.map((ts) => ts.subjectId),
            }))}
            subjects={subjects}
            packages={packages.map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              basePrice: p.basePrice.toString(),
              subjectId: p.subjectId,
            }))}
          />
        }
      />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Enrollment Records</h2>
            <p className="text-xs text-muted-foreground">
              Click any row to open the enrollment detail page.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {enrollments.length} active
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Tutor</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No active enrollments
                </TableCell>
              </TableRow>
            ) : (
              enrollments.map((enrollment) => (
                <TableRow
                  key={enrollment.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <TableCell>
                    <Link
                      href={`/enrollments/${enrollment.id}`}
                      className="flex items-center gap-3"
                    >
                      <StudentAvatar
                        firstName={enrollment.student.firstName}
                        lastName={enrollment.student.lastName}
                        avatarUrl={enrollment.student.avatarUrl}
                        className="h-8 w-8 rounded-xl"
                      />
                      <span className="font-medium hover:underline">
                        {enrollment.student.firstName}{" "}
                        {enrollment.student.lastName}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {enrollment.subject.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {enrollment.package.name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {enrollment.tutor.firstName} {enrollment.tutor.lastName}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatUSD(
                      enrollment.customPriceOverride ??
                        enrollment.package.basePrice
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(enrollment.startDate)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[enrollment.status]}`}
                    >
                      {enrollment.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
