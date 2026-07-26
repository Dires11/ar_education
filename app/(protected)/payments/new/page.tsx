import { listStudents } from "@/lib/data/students";
import { listEnrollments } from "@/lib/data/enrollments";
import { NewPaymentForm } from "../components/new-payment-form";
import {
  getCalendarDateKey,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const params = await searchParams;

  const [studentsData, enrollments] = await Promise.all([
    listStudents({ status: "ACTIVE", pageSize: 200 }),
    listEnrollments({ status: "ACTIVE" }),
  ]);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Record Payment</h1>
        <p className="text-sm text-muted-foreground">
          Log a payment from a student
        </p>
      </div>
      <NewPaymentForm
        students={studentsData.students.map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
        }))}
        enrollments={enrollments.map((e) => ({
          id: e.id,
          studentId: e.studentId,
          label: `${e.subject.name} — ${e.package.name}`,
          packageType: e.package.type,
        }))}
        defaultStudentId={params.studentId}
        defaultPaidAt={getCalendarDateKey(
          new Date(),
          getConfiguredCenterTimeZone(),
        )}
      />
    </div>
  );
}
