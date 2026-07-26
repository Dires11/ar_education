import { listSubjects } from "@/lib/data/subjects";
import { TutorForm } from "../components/tutor-form";

export default async function NewTutorPage() {
  const subjects = await listSubjects();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New Tutor</h1>
        <p className="text-sm text-muted-foreground">Add a tutor to the center</p>
      </div>
      <TutorForm subjects={subjects} />
    </div>
  );
}
