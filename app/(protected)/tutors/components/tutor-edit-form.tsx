"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateTutorAction } from "@/app/actions/tutors";
import {
  updateTutorSchema,
  type UpdateTutorInput,
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
import { CloudinaryImageUpload } from "@/components/cloudinary-image-upload";
import { TutorAvatar } from "./tutor-avatar";
import { useCloudinaryCleanup } from "@/hooks/use-cloudinary-cleanup";

export function TutorEditForm({
  tutorId,
  defaultValues,
  onSuccess,
}: {
  tutorId: string;
  defaultValues: UpdateTutorInput;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { trackUpload, commit } = useCloudinaryCleanup();
  const form = useForm<UpdateTutorInput>({
    resolver: zodResolver(updateTutorSchema),
    defaultValues,
  });

  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const avatarPublicId = useWatch({ control: form.control, name: "avatarPublicId" });
  const firstName = useWatch({ control: form.control, name: "firstName" });
  const lastName = useWatch({ control: form.control, name: "lastName" });

  async function onSubmit(values: UpdateTutorInput) {
    try {
      await updateTutorAction(tutorId, values);
      commit([values.avatarPublicId]);
      toast.success("Tutor updated");
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/tutors/${tutorId}`);
      }
    } catch {
      toast.error("Failed to update tutor");
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
                <FormControl><Input {...field} /></FormControl>
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
                <FormControl><Input {...field} /></FormControl>
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
                <FormControl><Input type="email" {...field} /></FormControl>
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
                <FormControl><Input type="tel" {...field} /></FormControl>
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl><Textarea {...field} rows={2} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
          {!onSuccess && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
