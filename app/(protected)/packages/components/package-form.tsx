"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createPackageSchema,
  type CreatePackageInput,
} from "@/lib/validators/packages";
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

type Subject = { id: string; name: string };

interface PackageFormProps {
  subjects: Subject[];
  defaultValues?: Partial<CreatePackageInput>;
  onSubmit: (values: CreatePackageInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function PackageForm({
  subjects,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: PackageFormProps) {
  const router = useRouter();
  const form = useForm<CreatePackageInput>({
    resolver: zodResolver(createPackageSchema),
    defaultValues: {
      name: "",
      type: "MONTHLY",
      billingPeriod: "MONTHLY",
      lessonType: "PRIVATE",
      subjectId: "",
      basePrice: "",
      sessionsPerWeek: "",
      durationMinutes: "60",
      ...defaultValues,
    },
  });

  const packageType = useWatch({ control: form.control, name: "type" });

  async function handleSubmit(values: CreatePackageInput) {
    try {
      await onSubmit(values);
    } catch {
      toast.error("Failed to save package");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-1">
        <section className="space-y-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Package Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Math 2x/week Private" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === "any" ? "" : value)
                    }
                    value={field.value || "any"}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Any subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="any">Any subject</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="lessonType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Format</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PRIVATE">Private</SelectItem>
                      <SelectItem value="GROUP">Group</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Subscription</SelectItem>
                      <SelectItem value="PER_SESSION">Per Session</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {packageType === "MONTHLY" ? (
              <FormField
                control={form.control}
                name="billingPeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Period</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "MONTHLY"}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="THREE_MONTHS">
                          Every 3 months
                        </SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col justify-end">
                <p className="mb-2 text-sm font-medium">Billing Period</p>
                <div className="flex h-8 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
                  Per session
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {packageType === "MONTHLY"
                      ? "Price / period"
                      : "Price / session"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (min)</FormLabel>
                  <FormControl>
                    <Input type="number" min="15" step="15" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {packageType === "MONTHLY" ? (
              <FormField
                control={form.control}
                name="sessionsPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sessions / week</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" placeholder="2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col justify-end">
                <p className="mb-2 text-sm font-medium">Sessions / week</p>
                <div className="flex h-8 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
                  Unlimited
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => (onCancel ? onCancel() : router.back())}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
