"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createTutorAction } from "@/app/actions/tutors";
import {
  createTutorSchema,
  type CreateTutorInput,
} from "@/lib/validators/tutors";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CloudinaryImageUpload } from "@/components/cloudinary-image-upload";
import { TutorAvatar } from "./tutor-avatar";
import { useCloudinaryCleanup } from "@/hooks/use-cloudinary-cleanup";

type Subject = { id: string; name: string };

export function TutorForm({
  subjects,
  onSuccess,
}: {
  subjects: Subject[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { trackUpload, commit } = useCloudinaryCleanup();
  const form = useForm<CreateTutorInput>({
    resolver: zodResolver(createTutorSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      avatarUrl: "",
      email: "",
      phone: "",
      hourlyRate: "",
      subjectIds: [],
      notes: "",
    },
  });

  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const avatarPublicId = useWatch({
    control: form.control,
    name: "avatarPublicId",
  });
  const firstName = useWatch({ control: form.control, name: "firstName" });
  const lastName = useWatch({ control: form.control, name: "lastName" });

  async function onSubmit(values: CreateTutorInput) {
    try {
      const result = await createTutorAction(values);
      if (result.success) {
        commit();
        toast.success("Tutor created");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/tutors/${result.id}`);
        }
      }
    } catch {
      toast.error("Failed to create tutor");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        <CloudinaryImageUpload
          value={avatarUrl ?? ""}
          publicId={avatarPublicId ?? ""}
          onChange={(url, publicId) => {
            trackUpload(publicId);
            form.setValue("avatarUrl", url, { shouldDirty: true });
            form.setValue("avatarPublicId", publicId, { shouldDirty: true });
          }}
          label="Tutor photo"
          fallback={
            <TutorAvatar
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
                  <Input {...field} />
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
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="hourlyRate"
          render={({ field }) => (
            <FormItem className="max-w-[160px]">
              <FormLabel>Hourly Rate (USD)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subjectIds"
          render={() => (
            <FormItem>
              <FormLabel>Subjects</FormLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {subjects.map((subject) => (
                  <FormField
                    key={subject.id}
                    control={form.control}
                    name="subjectIds"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(subject.id)}
                            onCheckedChange={(checked) => {
                              const current = field.value ?? [];
                              field.onChange(
                                checked
                                  ? [...current, subject.id]
                                  : current.filter((v) => v !== subject.id),
                              );
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">
                          {subject.name}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
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
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating..." : "Create Tutor"}
          </Button>
          {!onSuccess && (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
