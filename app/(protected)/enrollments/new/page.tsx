import { listStudents } from "@/lib/data/students";
import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listPackages } from "@/lib/data/packages";
import { NewEnrollmentForm } from "../components/new-enrollment-form";

export default async function NewEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const params = await searchParams;

  const [studentsData, tutorsData, subjects, packages] = await Promise.all([
    listStudents({ status: "ACTIVE", pageSize: 200 }),
    listTutors({ status: "ACTIVE", pageSize: 200 }),
    listSubjects(),
    listPackages(true),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New Enrollment</h1>
        <p className="text-sm text-muted-foreground">
          Enroll a student in a package with a tutor
        </p>
      </div>
      <NewEnrollmentForm
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
          subjectId: p.subjectId ?? null,
        }))}
        defaultStudentId={params.studentId}
      />
    </div>
  );
}
