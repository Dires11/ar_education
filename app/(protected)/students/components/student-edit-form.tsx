"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateStudentAction } from "@/app/actions/students";
import {
  updateStudentSchema,
  type UpdateStudentFormValues,
  type UpdateStudentInput,
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
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryImageUpload } from "@/components/cloudinary-image-upload";
import { StudentAvatar } from "./entity-avatar";
import { useCloudinaryCleanup } from "@/hooks/use-cloudinary-cleanup";

export function StudentEditForm({
  studentId,
  defaultValues,
  onSuccess,
}: {
  studentId: string;
  defaultValues: UpdateStudentFormValues;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { trackUpload, commit } = useCloudinaryCleanup();
  const form = useForm<UpdateStudentFormValues, undefined, UpdateStudentInput>({
    resolver: zodResolver(updateStudentSchema),
    defaultValues,
  });

  const avatarUrl = useWatch({ control: form.control, name: "avatarUrl" });
  const avatarPublicId = useWatch({ control: form.control, name: "avatarPublicId" });
  const firstName = useWatch({ control: form.control, name: "firstName" });
  const lastName = useWatch({ control: form.control, name: "lastName" });

  async function onSubmit(values: UpdateStudentInput) {
    try {
      await updateStudentAction(studentId, values);
      commit();
      toast.success("Student updated");
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/students");
      }
    } catch {
      toast.error("Failed to update student");
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
          label="Student photo"
          fallback={
            <StudentAvatar
              firstName={firstName}
              lastName={lastName}
              className="h-full w-full rounded-none"
            />
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="dob"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of Birth</FormLabel>
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

        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex gap-2 pt-1">
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
