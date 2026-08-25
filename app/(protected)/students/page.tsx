import {
  getStudentDirectoryStats,
  listStudents,
} from "@/lib/data/students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BookOpenIcon, CirclePauseIcon, UsersIcon, UserCheckIcon } from "lucide-react";
import { PersonStatus } from "@/generated/prisma";
import { StudentsSearch } from "./components/students-search";
import { NewStudentDialog } from "./components/new-student-dialog";
import { StudentsTable } from "./components/students-table";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    student?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.search;
  const status = params.status as PersonStatus | undefined;
  const page = Number(params.page ?? 1);

  const [{ students, total, pageSize }, stats] = await Promise.all([
    listStudents({ search, status, page }),
    getStudentDirectoryStats({ search, status }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-amber-50 via-background to-emerald-50">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="rounded-full bg-background/80">
              Student Directory
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Manage student records, guardian contacts, and enrollment context from one place.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/80 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UsersIcon className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.18em]">Total</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{total}</p>
              </div>
              <div className="rounded-2xl border bg-background/80 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserCheckIcon className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.18em]">Active</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {stats.activeCount}
                </p>
              </div>
              <div className="rounded-2xl border bg-background/80 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BookOpenIcon className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.18em]">With Contacts</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {stats.withContactsCount}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <NewStudentDialog />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CirclePauseIcon className="h-3.5 w-3.5" />
              <span>
                {stats.pausedCount} paused students in the current result set
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <StudentsSearch defaultSearch={search} defaultStatus={status} />
      </section>

      <StudentsTable
        students={students}
        initialStudentId={params.student ?? null}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/students?${new URLSearchParams({
                    ...(search && { search }),
                    ...(status && { status }),
                    page: String(page - 1),
                  })}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/students?${new URLSearchParams({
                    ...(search && { search }),
                    ...(status && { status }),
                    page: String(page + 1),
                  })}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
