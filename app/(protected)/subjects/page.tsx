import { listSubjects } from "@/lib/data/subjects";
import { SubjectsManager } from "./components/subjects-manager";
import { PageHero } from "@/components/page-hero";
import { BookMarkedIcon } from "lucide-react";

export default async function SubjectsPage() {
  const subjects = await listSubjects();

  return (
    <div className="space-y-6">
      <PageHero
        label="Subjects & Curriculum"
        title="Subjects"
        description="Define the subjects offered at the center. Subjects are linked to packages and tutor profiles."
        gradient="from-rose-50 via-background to-pink-50"
        stats={[
          { icon: BookMarkedIcon, label: "Total Subjects", value: subjects.length },
        ]}
      />

      <SubjectsManager subjects={subjects} />
    </div>
  );
}
