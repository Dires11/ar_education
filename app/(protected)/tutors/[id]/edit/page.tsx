import { notFound } from "next/navigation";
import { getTutor } from "@/lib/data/tutors";
import { TutorEditForm } from "../../components/tutor-edit-form";

export default async function EditTutorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tutor = await getTutor(id);

  if (!tutor) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit Tutor</h1>
        <p className="text-sm text-muted-foreground">
          {tutor.firstName} {tutor.lastName}
        </p>
      </div>
      <TutorEditForm
        tutorId={id}
        defaultValues={{
          firstName: tutor.firstName,
          lastName: tutor.lastName,
          email: tutor.email,
          phone: tutor.phone,
          hourlyRate: tutor.hourlyRate.toString(),
          notes: tutor.notes ?? undefined,
        }}
      />
    </div>
  );
}
