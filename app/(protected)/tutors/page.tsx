import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { UsersIcon, UserCheckIcon, BookOpenIcon } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { NewTutorDialog } from "./components/new-tutor-dialog";
import { TutorsTable } from "./components/tutors-table";

export default async function TutorsPage() {
  const [{ tutors, total }, subjects] = await Promise.all([
    listTutors(),
    listSubjects(),
  ]);

  const activeCount = tutors.filter((t) => t.status === "ACTIVE").length;
  const uniqueSubjects = new Set(
    tutors.flatMap((t) => t.subjects.map((ts) => ts.subject.name))
  ).size;

  return (
    <div className="space-y-6">
      <PageHero
        label="Tutor Directory"
        title="Tutors"
        description="Manage tutor profiles, subjects taught, and payroll. Click any row to open a tutor's full profile."
        gradient="from-violet-50 via-background to-indigo-50"
        stats={[
          { icon: UsersIcon, label: "Total", value: total },
          { icon: UserCheckIcon, label: "Active", value: activeCount },
          { icon: BookOpenIcon, label: "Subjects Covered", value: uniqueSubjects },
        ]}
        action={<NewTutorDialog subjects={subjects} />}
      />

      <TutorsTable
        tutors={tutors.map((t) => ({
          ...t,
          hourlyRate: t.hourlyRate.toString(),
        }))}
      />
    </div>
  );
}
