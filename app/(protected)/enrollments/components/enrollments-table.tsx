"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentAvatar } from "@/components/entity-avatar";
import { formatCalendarDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { EnrollmentPopup } from "./enrollment-popup";

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-gray-100 text-gray-700",
};

type EnrollmentRow = {
  id: string;
  status: keyof typeof STATUS_COLORS;
  startDate: string;
  priceAtEnrollment: string;
  customPriceOverride: string | null;
  student: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  subject: { name: string };
  package: {
    name: string;
    lessonType: string;
  };
  group: { name: string } | null;
  tutor: {
    firstName: string;
    lastName: string;
  };
};

export function EnrollmentsTable({
  enrollments,
  centerTimeZone,
  initialEnrollmentId,
}: {
  enrollments: EnrollmentRow[];
  centerTimeZone: string;
  initialEnrollmentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(
    initialEnrollmentId,
  );
  const [open, setOpen] = useState(Boolean(initialEnrollmentId));

  useEffect(() => {
    setSelectedEnrollmentId(initialEnrollmentId);
    setOpen(Boolean(initialEnrollmentId));
  }, [initialEnrollmentId]);

  function updateEnrollmentUrl(id: string | null) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (id) nextSearchParams.set("enrollment", id);
    else nextSearchParams.delete("enrollment");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function openEnrollment(id: string) {
    setSelectedEnrollmentId(id);
    setOpen(true);
    updateEnrollmentUrl(id);
  }

  return (
    <>
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
                onClick={() => openEnrollment(enrollment.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEnrollment(enrollment.id);
                  }
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <StudentAvatar
                      firstName={enrollment.student.firstName}
                      lastName={enrollment.student.lastName}
                      avatarUrl={enrollment.student.avatarUrl}
                      className="h-8 w-8 rounded-xl"
                    />
                    <span className="font-medium">
                      {enrollment.student.firstName}{" "}
                      {enrollment.student.lastName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {enrollment.subject.name}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">
                      {enrollment.package.name}
                    </p>
                    {enrollment.package.lessonType === "GROUP" &&
                      enrollment.group && (
                        <p className="text-xs text-muted-foreground">
                          Group:{" "}
                          <span className="font-medium text-foreground">
                            {enrollment.group.name}
                          </span>
                        </p>
                      )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {enrollment.tutor.firstName} {enrollment.tutor.lastName}
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {formatUSD(
                    enrollment.customPriceOverride ??
                      enrollment.priceAtEnrollment,
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatCalendarDate(enrollment.startDate)}
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

      <EnrollmentPopup
        centerTimeZone={centerTimeZone}
        enrollmentId={selectedEnrollmentId}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) return;
          setSelectedEnrollmentId(null);
          updateEnrollmentUrl(null);
        }}
      />
    </>
  );
}
