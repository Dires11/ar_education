"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknoteIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/utils/dates";
import { formatUSD } from "@/lib/utils/money";
import { getTutorAction, archiveTutorAction } from "@/app/actions/tutors";
import { TutorAvatar } from "@/components/entity-avatar";
import { TutorEditForm } from "./tutor-edit-form";
import Link from "next/link";

type TutorData = NonNullable<Awaited<ReturnType<typeof getTutorAction>>>;

const STATUS_COLORS = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  INACTIVE: "bg-gray-100 text-gray-700",
};

export function TutorPopup({
  tutorId,
  open,
  onOpenChange,
}: {
  tutorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [tutor, setTutor] = useState<TutorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

  const loadTutor = useCallback(async () => {
    if (!tutorId) return;
    setLoading(true);
    try {
      const data = await getTutorAction(tutorId);
      setTutor(data ?? null);
    } catch {
      toast.error("Failed to load tutor");
    } finally {
      setLoading(false);
    }
  }, [tutorId]);

  useEffect(() => {
    if (open && tutorId) {
      loadTutor();
    } else {
      setTutor(null);
    }
  }, [loadTutor, open, tutorId]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) {
            setActiveTab("details");
            setConfirmArchiveOpen(false);
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl [&_[data-slot=dialog-close]]:!right-6 [&_[data-slot=dialog-close]]:!top-6">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {tutor
                ? `${tutor.firstName} ${tutor.lastName}`
                : "Tutor details"}
            </DialogTitle>
            <DialogDescription>
              Review tutor details, update the profile, and manage enrollments.
            </DialogDescription>
          </DialogHeader>

          {loading && !tutor ? (
            <div className="flex h-40 items-center justify-center p-6 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : !tutor ? null : (
            <div className="max-h-[85vh] space-y-4 overflow-y-auto p-4">
              <section className="rounded-2xl border bg-gradient-to-br from-violet-50 via-background to-indigo-50 px-4 py-4 pr-16">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <TutorAvatar
                        firstName={tutor.firstName}
                        lastName={tutor.lastName}
                        avatarUrl={tutor.avatarUrl}
                        size="lg"
                        className="h-10 w-10 rounded-2xl"
                      />
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight">
                          {tutor.firstName} {tutor.lastName}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {tutor.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[tutor.status]}`}
                      >
                        {tutor.status}
                      </span>
                      <Badge variant="outline" className="rounded-full bg-background/80">
                        {formatUSD(tutor.hourlyRate)}/hr
                      </Badge>
                      <Badge variant="outline" className="rounded-full bg-background/80">
                        {tutor.enrollments.length} active{" "}
                        {tutor.enrollments.length === 1
                          ? "enrollment"
                          : "enrollments"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pt-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/tutors/${tutor.id}`}>
                        <ExternalLinkIcon className="mr-1.5 h-3.5 w-3.5" />
                        Full Profile
                      </Link>
                    </Button>
                    {tutor.status !== "INACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmArchiveOpen(true)}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="enrollments">
                    Enrollments ({tutor.enrollments.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-3 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <PhoneIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Phone
                        </p>
                      </div>
                      <p className="text-sm font-medium">{tutor.phone}</p>
                    </div>
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <MailIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Email
                        </p>
                      </div>
                      <p className="text-sm font-medium break-all">
                        {tutor.email}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <BanknoteIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Hourly Rate
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {formatUSD(tutor.hourlyRate)}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <BookOpenIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Subjects
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {tutor.subjects.map((ts) => ts.subject.name).join(", ") ||
                          "None assigned"}
                      </p>
                    </div>
                  </div>

                  {tutor.notes && (
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Notes
                      </p>
                      <p className="text-sm leading-6">{tutor.notes}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="edit" className="pt-2">
                  <div className="rounded-2xl border p-4">
                    <TutorEditForm
                      tutorId={tutor.id}
                      defaultValues={{
                        firstName: tutor.firstName,
                        lastName: tutor.lastName,
                        avatarUrl: tutor.avatarUrl ?? "",
                        avatarPublicId: tutor.avatarPublicId ?? "",
                        email: tutor.email,
                        phone: tutor.phone,
                        hourlyRate: tutor.hourlyRate.toString(),
                        notes: tutor.notes ?? "",
                      }}
                      onSuccess={() => {
                        loadTutor();
                        setActiveTab("details");
                      }}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="enrollments" className="pt-2">
                  {tutor.enrollments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                      No active enrollments for this tutor.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Package</TableHead>
                            <TableHead>Since</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tutor.enrollments.map((enrollment) => (
                            <TableRow key={enrollment.id}>
                              <TableCell className="font-medium">
                                {enrollment.student.firstName}{" "}
                                {enrollment.student.lastName}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enrollment.subject.name}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enrollment.package.name}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatCalendarDate(enrollment.startDate)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmArchiveOpen} onOpenChange={setConfirmArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive Tutor</DialogTitle>
            <DialogDescription>
              This will mark the tutor as inactive. Their history and session
              records will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmArchiveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isArchiving || !tutor}
              onClick={() =>
                startArchiveTransition(async () => {
                  if (!tutor) return;
                  try {
                    await archiveTutorAction(tutor.id);
                    toast.success("Tutor archived");
                    setConfirmArchiveOpen(false);
                    onOpenChange(false);
                    router.refresh();
                  } catch {
                    toast.error("Failed to archive tutor");
                  }
                })
              }
            >
              {isArchiving ? "Archiving..." : "Archive Tutor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
