"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GraduationCapIcon } from "lucide-react";
import { PersonStatus } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils/dates";
import { updateStudentStatusAction } from "@/app/actions/students";
import { StudentPopup } from "./student-popup";
import { StudentStatusMenu } from "./student-status-menu";
import { GuardianAvatar, StudentAvatar } from "./entity-avatar";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  school: string | null;
  gradeLevel: string | null;
  status: PersonStatus;
  createdAt: Date;
  guardians: Array<{
    isPrimary: boolean;
    guardian: {
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      phone: string;
      email: string | null;
    };
  }>;
};

export function StudentsTable({
  students,
  initialStudentId,
}: {
  students: StudentRow[];
  initialStudentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedId(initialStudentId);
  }, [initialStudentId]);

  function updateStudentUrl(id: string | null) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (id) nextSearchParams.set("student", id);
    else nextSearchParams.delete("student");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function openStudent(id: string) {
    setSelectedId(id);
    updateStudentUrl(id);
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Student Records</h2>
            <p className="text-xs text-muted-foreground">
              Click any row to open the student popup.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {students.length} shown
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Guardian</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  No students found
                </TableCell>
              </TableRow>
            ) : (
              students.map((student) => {
                const primary = student.guardians.find((g) => g.isPrimary);
                const guardian =
                  primary?.guardian ?? student.guardians[0]?.guardian;
                return (
                  <TableRow
                    key={student.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => openStudent(student.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <StudentAvatar
                          firstName={student.firstName}
                          lastName={student.lastName}
                          avatarUrl={student.avatarUrl}
                          size="lg"
                          className="h-10 w-10 rounded-2xl"
                        />
                        <p className="font-medium">
                          {student.firstName} {student.lastName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {guardian ? (
                        <div className="flex items-center gap-3">
                          <GuardianAvatar
                            firstName={guardian.firstName}
                            lastName={guardian.lastName}
                            avatarUrl={guardian.avatarUrl}
                            className="rounded-xl"
                          />
                          <div className="space-y-1">
                            <p className="text-sm">
                              {guardian.firstName} {guardian.lastName}
                            </p>
                            {guardian.phone && (
                              <p className="text-xs text-muted-foreground">
                                {guardian.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {student.school ? (
                        <div className="flex items-center gap-2">
                          <GraduationCapIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{student.school}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {student.gradeLevel ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div onClick={(event) => event.stopPropagation()}>
                        <StudentStatusMenu
                          status={student.status}
                          disabled={isPending}
                          onChange={(value) =>
                            startTransition(async () => {
                              await updateStudentStatusAction(student.id, value);
                            })
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(student.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <StudentPopup
        studentId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedId(null);
          updateStudentUrl(null);
        }}
      />
    </>
  );
}
