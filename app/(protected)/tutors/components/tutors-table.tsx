"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUSD } from "@/lib/utils/money";
import { TutorAvatar } from "@/components/entity-avatar";
import { TutorPopup } from "./tutor-popup";

type TutorRow = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  email: string;
  phone: string;
  hourlyRate: string;
  status: "ACTIVE" | "PAUSED" | "INACTIVE";
  subjects: Array<{ subject: { name: string } }>;
};

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  INACTIVE: "bg-gray-100 text-gray-700",
};

export function TutorsTable({ tutors }: { tutors: TutorRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openTutor(id: string) {
    setSelectedId(id);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Tutor Records</h2>
            <p className="text-xs text-muted-foreground">
              Click any row to open the tutor profile.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {tutors.length} shown
          </Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Subjects</TableHead>
              <TableHead>Rate/hr</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tutors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  No tutors found
                </TableCell>
              </TableRow>
            ) : (
              tutors.map((tutor) => (
                <TableRow
                  key={tutor.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => openTutor(tutor.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TutorAvatar
                        firstName={tutor.firstName}
                        lastName={tutor.lastName}
                        avatarUrl={tutor.avatarUrl}
                        size="lg"
                        className="h-10 w-10 rounded-2xl"
                      />
                      <div>
                        <p className="font-medium">
                          {tutor.firstName} {tutor.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tutor.phone}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tutor.email}
                  </TableCell>
                  <TableCell className="text-sm">
                    {tutor.subjects.map((ts) => ts.subject.name).join(", ") || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatUSD(tutor.hourlyRate)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[tutor.status]}`}
                    >
                      {tutor.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TutorPopup
        tutorId={selectedId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
