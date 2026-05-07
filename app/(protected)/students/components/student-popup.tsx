"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CakeIcon,
  GraduationCapIcon,
  PencilIcon,
  PlusIcon,
  SchoolIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import {
  Dialog,
  DialogFooter,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  guardianSchema,
  type GuardianFormValues,
  type GuardianInput,
} from "@/lib/validators/students";
import {
  getStudentAction,
  addGuardianAction,
  updateGuardianAction,
  removeGuardianAction,
  deleteStudentAction,
  updateStudentStatusAction,
} from "@/app/actions/students";
import { formatDate } from "@/lib/utils/dates";
import { EditStudentDialog } from "./edit-student-dialog";
import { StudentStatusMenu } from "./student-status-menu";
import { CloudinaryImageUpload } from "@/components/cloudinary-image-upload";
import { GuardianAvatar, StudentAvatar } from "./entity-avatar";
import { useCloudinaryCleanup } from "@/hooks/use-cloudinary-cleanup";

type StudentData = NonNullable<Awaited<ReturnType<typeof getStudentAction>>>;
type GuardianRow = StudentData["guardians"][0];

type GuardianDialogState =
  | { mode: "add" }
  | { mode: "edit"; row: GuardianRow }
  | null;

function getAdultStatus(dob: Date | string | null | undefined) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate());

  if (beforeBirthday) age -= 1;

  return {
    age,
    isAdult: age >= 18,
  };
}

function GuardianForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  defaultValues?: Partial<GuardianInput>;
  onSubmit: (values: GuardianInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { trackUpload, commit } = useCloudinaryCleanup();
  const form = useForm<GuardianFormValues, undefined, GuardianInput>({
    resolver: zodResolver(guardianSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      avatarUrl: "",
      avatarPublicId: "",
      phone: "",
      email: "",
      relationship: "PARENT",
      notes: "",
      isPrimary: false,
      ...defaultValues,
    },
  });
  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const avatarPublicId = useWatch({ control: form.control, name: "avatarPublicId" });
  const firstName = useWatch({ control: form.control, name: "firstName" });
  const lastName = useWatch({ control: form.control, name: "lastName" });

  useEffect(() => {
    form.reset({
      firstName: "",
      lastName: "",
      avatarUrl: "",
      avatarPublicId: "",
      phone: "",
      email: "",
      relationship: "PARENT",
      notes: "",
      isPrimary: false,
      ...defaultValues,
    });
  }, [defaultValues, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values);
          commit();
        })}
        className="space-y-4"
      >
        <CloudinaryImageUpload
          value={avatarUrl ?? ""}
          publicId={avatarPublicId ?? ""}
          onChange={(url, publicId) => {
            trackUpload(publicId);
            form.setValue("avatarUrl", url, { shouldDirty: true });
            form.setValue("avatarPublicId", publicId, { shouldDirty: true });
          }}
          label="Guardian photo"
          fallback={
            <GuardianAvatar
              firstName={firstName}
              lastName={lastName}
              className="h-full w-full rounded-none"
            />
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="relationship"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relationship</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value ?? "PARENT"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="GUARDIAN">Guardian</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isPrimary"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="font-normal cursor-pointer">
                Primary contact
              </FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : submitLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function StudentPopup({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [student, setStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianDialog, setGuardianDialog] =
    useState<GuardianDialogState>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [isStatusPending, startStatusTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const loadStudent = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const data = await getStudentAction(studentId);
      setStudent(data ?? null);
    } catch {
      toast.error("Failed to load student");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (open && studentId) {
      loadStudent();
    } else {
      setStudent(null);
    }
  }, [loadStudent, open, studentId]);

  async function handleAddGuardian(values: GuardianInput) {
    if (!studentId) return;
    try {
      await addGuardianAction(studentId, values);
      toast.success("Guardian added");
      setGuardianDialog(null);
      await loadStudent();
    } catch {
      toast.error("Failed to add guardian");
    }
  }

  async function handleEditGuardian(guardianId: string, values: GuardianInput) {
    if (!studentId) return;
    try {
      await updateGuardianAction(guardianId, studentId, values);
      toast.success("Guardian updated");
      setGuardianDialog(null);
      await loadStudent();
    } catch {
      toast.error("Failed to update guardian");
    }
  }

  async function handleRemoveGuardian(guardianId: string) {
    if (!studentId) return;
    setRemovingId(guardianId);
    try {
      await removeGuardianAction(studentId, guardianId);
      toast.success("Guardian removed");
      await loadStudent();
    } catch {
      toast.error("Failed to remove guardian");
    } finally {
      setRemovingId(null);
    }
  }

  const ageInfo = getAdultStatus(student?.dob);
  const isAdult = ageInfo?.isAdult ?? false;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) {
            setGuardianDialog(null);
            setActiveTab("details");
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-3xl [&_[data-slot=dialog-close]]:!right-6 [&_[data-slot=dialog-close]]:!top-6">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {student
                ? `${student.firstName} ${student.lastName}`
                : "Student details"}
            </DialogTitle>
            <DialogDescription>
              Review student details, update the profile, and manage guardians.
            </DialogDescription>
          </DialogHeader>
          {loading && !student ? (
            <div className="flex h-40 items-center justify-center p-6 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : !student ? null : (
            <div className="max-h-[85dvh] space-y-4 overflow-y-auto p-4">
              <section className="rounded-2xl border bg-gradient-to-br from-amber-50 via-background to-emerald-50 px-4 py-4 pr-16">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StudentAvatar
                        firstName={student.firstName}
                        lastName={student.lastName}
                        avatarUrl={student.avatarUrl}
                        size="lg"
                        className="h-10 w-10 rounded-2xl"
                      />
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight">
                          {student.firstName} {student.lastName}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Student since {formatDate(student.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StudentStatusMenu
                        status={student.status}
                        disabled={isStatusPending}
                        className="bg-background/80"
                        onChange={(value) =>
                          startStatusTransition(async () => {
                            await updateStudentStatusAction(student.id, value);
                            await loadStudent();
                          })
                        }
                      />
                      {ageInfo && (
                        <Badge variant="outline" className="rounded-full">
                          {ageInfo.age} years old
                        </Badge>
                      )}
                      <Badge variant="outline" className="rounded-full">
                        {isAdult ? "Adult student" : "Minor student"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-2 sm:pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </section>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="student">Edit</TabsTrigger>
                  <TabsTrigger value="guardians">
                    Guardians ({student.guardians.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <SchoolIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          School
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {student.school ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <GraduationCapIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Grade
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {student.gradeLevel ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                        <CakeIcon className="h-4 w-4" />
                        <p className="text-xs uppercase tracking-[0.2em]">
                          Date of Birth
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {student.dob ? formatDate(student.dob) : "—"}
                      </p>
                    </div>
                    {isAdult && (
                      <div className="rounded-2xl border bg-card p-3 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                          <UserRoundIcon className="h-4 w-4" />
                          <p className="text-xs uppercase tracking-[0.2em]">
                            Student Contact
                          </p>
                        </div>
                        <p className="text-sm font-medium">
                          {student.phone ?? student.email ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {student.phone && student.email
                            ? student.email
                            : "Adult students can use their own phone and email."}
                        </p>
                      </div>
                    )}
                  </div>

                  {student.notes && (
                    <div className="rounded-2xl border bg-card p-3 shadow-sm">
                      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Notes
                      </p>
                      <p className="text-sm leading-6">{student.notes}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Primary Contact</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveTab("guardians")}
                      >
                        Manage
                      </Button>
                    </div>

                    {student.guardians.length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        {isAdult
                          ? "No guardian on file."
                          : "No guardians on file yet."}
                      </div>
                    ) : (
                      student.guardians.slice(0, 1).map((row) => (
                        <div
                          key={row.guardian.id}
                          className="rounded-2xl border bg-card p-4 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <GuardianAvatar
                              firstName={row.guardian.firstName}
                              lastName={row.guardian.lastName}
                              avatarUrl={row.guardian.avatarUrl}
                              size="lg"
                              className="h-10 w-10 rounded-2xl"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">
                                  {row.guardian.firstName}{" "}
                                  {row.guardian.lastName}
                                </span>
                                {row.isPrimary && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Primary
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {row.guardian.relationship}
                                </Badge>
                              </div>
                              <div className="space-y-1 text-sm">
                                <p>{row.guardian.phone}</p>
                                {row.guardian.email && (
                                  <p className="text-muted-foreground">
                                    {row.guardian.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="student" className="space-y-4 pt-2">
                  <div className="rounded-2xl border p-4">
                    <EditStudentDialog
                      studentId={student.id}
                      defaultValues={{
                        firstName: student.firstName,
                        lastName: student.lastName,
                        avatarUrl: student.avatarUrl ?? "",
                        avatarPublicId: student.avatarPublicId ?? "",
                        dob: student.dob
                          ? new Date(student.dob).toISOString().split("T")[0]
                          : "",
                        email: student.email ?? "",
                        phone: student.phone ?? "",
                        school: student.school ?? "",
                        gradeLevel: student.gradeLevel ?? "",
                        notes: student.notes ?? "",
                      }}
                      onSuccess={() => {
                        loadStudent();
                        setActiveTab("details");
                      }}
                      inline
                    />
                  </div>
                </TabsContent>

                <TabsContent value="guardians" className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">
                        Guardians ({student.guardians.length})
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {isAdult
                          ? "Optional for adults. Add one if you want an emergency contact on file."
                          : "Use guardians for primary contacts, parents, and emergency contacts."}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGuardianDialog({ mode: "add" })}
                    >
                      <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                      Add Guardian
                    </Button>
                  </div>

                  {guardianDialog && (
                    <div className="rounded-2xl border bg-card p-4 shadow-sm">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-medium">
                            {guardianDialog.mode === "add"
                              ? "Add Guardian"
                              : "Edit Guardian"}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Update guardian contact and primary contact details.
                          </p>
                        </div>
                      </div>
                      {guardianDialog.mode === "add" && (
                        <GuardianForm
                          submitLabel="Add Guardian"
                          onCancel={() => setGuardianDialog(null)}
                          onSubmit={handleAddGuardian}
                        />
                      )}
                      {guardianDialog.mode === "edit" && (
                        <GuardianForm
                          submitLabel="Save Changes"
                          defaultValues={{
                            firstName: guardianDialog.row.guardian.firstName,
                            lastName: guardianDialog.row.guardian.lastName,
                            avatarUrl:
                              guardianDialog.row.guardian.avatarUrl ?? "",
                            avatarPublicId:
                              guardianDialog.row.guardian.avatarPublicId ?? "",
                            phone: guardianDialog.row.guardian.phone,
                            email: guardianDialog.row.guardian.email ?? "",
                            relationship: guardianDialog.row.guardian
                              .relationship as GuardianInput["relationship"],
                            notes: guardianDialog.row.guardian.notes ?? "",
                            isPrimary: guardianDialog.row.isPrimary,
                          }}
                          onCancel={() => setGuardianDialog(null)}
                          onSubmit={(values) =>
                            handleEditGuardian(
                              guardianDialog.row.guardian.id,
                              values,
                            )
                          }
                        />
                      )}
                    </div>
                  )}

                  {student.guardians.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                      {isAdult
                        ? "No guardian on file. Adult students do not need one."
                        : "No guardians on file yet."}
                    </div>
                  ) : (
                    student.guardians
                      .filter(
                        (row) =>
                          !(
                            guardianDialog?.mode === "edit" &&
                            guardianDialog.row.guardian.id === row.guardian.id
                          ),
                      )
                      .map((row) => (
                        <div
                          key={row.guardian.id}
                          className="rounded-2xl border bg-card p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <GuardianAvatar
                                firstName={row.guardian.firstName}
                                lastName={row.guardian.lastName}
                                avatarUrl={row.guardian.avatarUrl}
                                size="lg"
                                className="h-10 w-10 rounded-2xl"
                              />
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium">
                                    {row.guardian.firstName}{" "}
                                    {row.guardian.lastName}
                                  </span>
                                  {row.isPrimary && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Primary
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {row.guardian.relationship}
                                  </Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  <p>{row.guardian.phone}</p>
                                  {row.guardian.email && (
                                    <p className="text-muted-foreground">
                                      {row.guardian.email}
                                    </p>
                                  )}
                                  {row.guardian.notes && (
                                    <p className="text-xs text-muted-foreground">
                                      {row.guardian.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() =>
                                  setGuardianDialog({ mode: "edit", row })
                                }
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                disabled={removingId === row.guardian.id}
                                onClick={() =>
                                  handleRemoveGuardian(row.guardian.id)
                                }
                              >
                                <Trash2Icon className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete Student</DialogTitle>
            <DialogDescription>
              This permanently deletes the student record. If the student has
              linked records like enrollments or payments, deletion may be
              blocked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting || !student}
              onClick={() =>
                startDeleteTransition(async () => {
                  if (!student) return;
                  try {
                    await deleteStudentAction(student.id);
                    toast.success("Student deleted");
                    setConfirmDeleteOpen(false);
                    onOpenChange(false);
                    router.refresh();
                  } catch {
                    toast.error(
                      "Failed to delete student. Remove linked records first.",
                    );
                  }
                })
              }
            >
              {isDeleting ? "Deleting..." : "Delete Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
