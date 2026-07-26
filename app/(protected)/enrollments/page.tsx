import { listEnrollments, listGroups } from "@/lib/services/enrollments";
import { listStudents } from "@/lib/data/students";
import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listPackages } from "@/lib/data/packages";
import { Badge } from "@/components/ui/badge";
import { NewEnrollmentDialog } from "./components/new-enrollment-dialog";
import { ManageGroupsDialog } from "./components/manage-groups-dialog";
import { PageHero } from "@/components/page-hero";
import { ClipboardListIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { EnrollmentsTable } from "./components/enrollments-table";

export default async function EnrollmentsPage() {
  const [enrollments, studentsData, tutorsData, subjects, packages, groups] =
    await Promise.all([
      listEnrollments({ status: "ACTIVE" }),
      listStudents({ status: "ACTIVE", pageSize: 200 }),
      listTutors({ status: "ACTIVE" }),
      listSubjects(),
      listPackages(true),
      listGroups(),
    ]);

  const uniqueStudents = new Set(
    enrollments.map((e) => e.student.id)
  ).size;
  const groupOptions = groups.map((g) => ({
    id: g.id,
    name: g.name,
    tutorId: g.tutorId,
    tutorName: `${g.tutor.firstName} ${g.tutor.lastName}`,
    subjectId: g.subjectId,
    subjectName: g.subject.name,
    memberCount: g.enrollments.filter((e) =>
      ["ACTIVE", "PAUSED"].includes(e.status)
    ).length,
  }));

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
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <ManageGroupsDialog groups={groupOptions} />
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
                billingPeriod: p.billingPeriod,
                lessonType: p.lessonType,
                basePrice: p.basePrice.toString(),
                sessionsPerWeek: p.sessionsPerWeek,
                durationMinutes: p.durationMinutes,
                subjectId: p.subjectId,
                subjectName: p.subject?.name ?? null,
              }))}
              groups={groupOptions}
            />
          </div>
        }
      />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Enrollment Records</h2>
            <p className="text-xs text-muted-foreground">
              Click any row to open enrollment details.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {enrollments.length} active
          </Badge>
        </div>
        <EnrollmentsTable
          enrollments={enrollments.map((enrollment) => ({
            id: enrollment.id,
            status: enrollment.status,
            startDate: enrollment.startDate.toISOString(),
            priceAtEnrollment: enrollment.priceAtEnrollment.toString(),
            customPriceOverride:
              enrollment.customPriceOverride?.toString() ?? null,
            student: {
              firstName: enrollment.student.firstName,
              lastName: enrollment.student.lastName,
              avatarUrl: enrollment.student.avatarUrl,
            },
            subject: { name: enrollment.subject.name },
            package: {
              name: enrollment.package.name,
              lessonType: enrollment.package.lessonType,
            },
            group: enrollment.group ? { name: enrollment.group.name } : null,
            tutor: {
              firstName: enrollment.tutor.firstName,
              lastName: enrollment.tutor.lastName,
            },
          }))}
        />
      </div>
    </div>
  );
}
