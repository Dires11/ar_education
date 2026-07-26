"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createStudentAction } from "@/app/actions/students";
import {
  createStudentSchema,
  type CreateStudentFormValues,
  type CreateStudentInput,
} from "@/lib/validators/students";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryImageUpload } from "@/components/cloudinary-image-upload";
import { GuardianAvatar, StudentAvatar } from "./entity-avatar";
import { useCloudinaryCleanup } from "@/hooks/use-cloudinary-cleanup";

function RequiredLabel({ children }: { children: string }) {
  return (
    <FormLabel>
      {children} <span className="text-destructive">*</span>
    </FormLabel>
  );
}

function getAgeInfo(dob: string | undefined) {
  if (!dob) return null;

  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const beforeBirthday =
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());

  if (beforeBirthday) age -= 1;

  return {
    age,
    isAdult: age >= 18,
  };
}

export function StudentForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const { trackUpload, commit } = useCloudinaryCleanup();

  const form = useForm<CreateStudentFormValues, undefined, CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      avatarUrl: "",
      dob: "",
      email: "",
      phone: "",
      school: "",
      gradeLevel: "",
      notes: "",
      guardian: {
        firstName: "",
        lastName: "",
        avatarUrl: "",
        phone: "",
        email: "",
        relationship: "PARENT",
        notes: "",
        isPrimary: true,
      },
    },
  });

  const dob = useWatch({ control: form.control, name: "dob" });
  const studentAvatarUrl = useWatch({
    control: form.control,
    name: "avatarUrl",
  });
  const studentAvatarPublicId = useWatch({
    control: form.control,
    name: "avatarPublicId",
  });
  const studentFirstName = useWatch({
    control: form.control,
    name: "firstName",
  });
  const studentLastName = useWatch({ control: form.control, name: "lastName" });
  const guardianAvatarUrl = useWatch({
    control: form.control,
    name: "guardian.avatarUrl",
  });
  const guardianAvatarPublicId = useWatch({
    control: form.control,
    name: "guardian.avatarPublicId",
  });
  const guardianFirstName = useWatch({
    control: form.control,
    name: "guardian.firstName",
  });
  const guardianLastName = useWatch({
    control: form.control,
    name: "guardian.lastName",
  });
  const ageInfo = useMemo(() => getAgeInfo(dob), [dob]);
  const isAdult = ageInfo?.isAdult ?? false;

  useEffect(() => {
    if (isAdult) {
      form.unregister("guardian");
    } else {
      form.setValue("email", "");
      form.setValue("phone", "");
    }
  }, [form, isAdult]);

  async function goToContactStep() {
    const valid = await form.trigger([
      "firstName",
      "lastName",
      "dob",
      "school",
      "gradeLevel",
      "notes",
    ]);

    if (valid) {
      setStep(2);
    }
  }

  async function onSubmit(values: CreateStudentInput) {
    try {
      const payload: CreateStudentInput = {
        firstName: values.firstName,
        lastName: values.lastName,
        avatarUrl: values.avatarUrl,
        avatarPublicId: values.avatarPublicId,
        dob: values.dob,
        email: isAdult ? values.email : "",
        phone: isAdult ? values.phone : "",
        school: values.school,
        gradeLevel: values.gradeLevel,
        notes: values.notes,
        guardian: isAdult
          ? undefined
          : {
              firstName: values.guardian?.firstName ?? "",
              lastName: values.guardian?.lastName ?? "",
              avatarUrl: values.guardian?.avatarUrl ?? "",
              avatarPublicId: values.guardian?.avatarPublicId ?? "",
              phone: values.guardian?.phone ?? "",
              email: values.guardian?.email ?? "",
              relationship: values.guardian?.relationship ?? "PARENT",
              notes: values.guardian?.notes ?? "",
              isPrimary: true,
            },
      };

      const result = await createStudentAction(payload);

      if (result.success) {
        commit([
          payload.avatarPublicId,
          payload.guardian?.avatarPublicId,
        ]);
        toast.success("Student created");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/students");
        }
      }
    } catch {
      toast.error("Failed to create student");
    }
  }

  async function handleCreate() {
    if (isAdult) {
      const valid = await form.trigger(["email", "phone"]);
      if (!valid) return;
    } else {
      const valid = await form.trigger([
        "guardian.firstName",
        "guardian.lastName",
        "guardian.phone",
        "guardian.email",
        "guardian.relationship",
        "guardian.notes",
      ]);
      if (!valid) return;
    }

    await form.handleSubmit(onSubmit)();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Step {step} of 2
              </p>
              <h3 className="text-base font-semibold">
                {step === 1
                  ? "Student Information"
                  : isAdult
                    ? "Student Contact"
                    : "Guardian Contact"}
              </h3>
            </div>
            {ageInfo && (
              <div className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {ageInfo.age} years old · {isAdult ? "Adult" : "Minor"}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-xs">
            <div
              className={`h-1.5 rounded-full ${step >= 1 ? "bg-foreground" : "bg-muted"}`}
            />
            <div
              className={`h-1.5 rounded-full ${step >= 2 ? "bg-foreground" : "bg-muted"}`}
            />
          </div>
        </div>

        {step === 1 && (
          <section className="space-y-1">
            <div className="pb-2 pt-2">
              <CloudinaryImageUpload
                value={studentAvatarUrl ?? ""}
                publicId={studentAvatarPublicId ?? ""}
                onChange={(url, publicId) => {
                  trackUpload(publicId);
                  form.setValue("avatarUrl", url, { shouldDirty: true });
                  form.setValue("avatarPublicId", publicId, {
                    shouldDirty: true,
                  });
                }}
                label="Student photo"
                fallback={
                  <StudentAvatar
                    firstName={studentFirstName}
                    lastName={studentLastName}
                    className="h-full w-full rounded-none after:rounded-none [&_[data-slot=avatar-fallback]]:rounded-none"
                  />
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <RequiredLabel>First Name</RequiredLabel>
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
                    <RequiredLabel>Last Name</RequiredLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <RequiredLabel>Date of Birth</RequiredLabel>
                    <FormControl>
                      <input
                        type="date"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="school"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
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
                    <Textarea rows={3} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>
        )}

        {step === 2 && (
          <section className="space-y-1">
            {isAdult ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        Phone
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          {...field}
                          value={field.value ?? ""}
                        />
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
                      <FormLabel className="flex items-center gap-2">
                        <MailIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <>
                <div className="pb-2">
                  <CloudinaryImageUpload
                    value={guardianAvatarUrl ?? ""}
                    publicId={guardianAvatarPublicId ?? ""}
                    onChange={(url, publicId) => {
                      trackUpload(publicId);
                      form.setValue("guardian.avatarUrl", url, {
                        shouldDirty: true,
                      });
                      form.setValue("guardian.avatarPublicId", publicId, {
                        shouldDirty: true,
                      });
                    }}
                    label="Guardian photo"
                    fallback={
                      <GuardianAvatar
                        firstName={guardianFirstName}
                        lastName={guardianLastName}
                        className="h-full w-full rounded-none after:rounded-none [&_[data-slot=avatar-fallback]]:rounded-none"
                      />
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="guardian.firstName"
                    render={({ field }) => (
                      <FormItem>
                        <RequiredLabel>Guardian First Name</RequiredLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.lastName"
                    render={({ field }) => (
                      <FormItem>
                        <RequiredLabel>Guardian Last Name</RequiredLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="guardian.phone"
                    render={({ field }) => (
                      <FormItem>
                        <RequiredLabel>Guardian Phone</RequiredLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian.email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Guardian Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="guardian.relationship"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredLabel>Relationship</RequiredLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? "PARENT"}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
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
                  name="guardian.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guardian Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </section>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {step === 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {!onSuccess && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            )}

            {step === 1 ? (
              <Button
                type="button"
                onClick={goToContactStep}
                disabled={!dob || form.formState.isSubmitting}
              >
                Next
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleCreate}
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating..." : "Create Student"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
