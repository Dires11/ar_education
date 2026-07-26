"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createPaymentAction } from "@/app/actions/payments";
import {
  createPaymentSchema,
  type CreatePaymentInput,
} from "@/lib/validators/payments";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { DatePicker } from "@/components/date-picker";
import type {
  PaymentEnrollmentOption,
  PaymentStudentOption,
} from "./payment-form-types";

export function NewPaymentForm({
  students,
  enrollments,
  defaultStudentId,
  defaultPaidAt,
  onSuccess,
}: {
  students: PaymentStudentOption[];
  enrollments: PaymentEnrollmentOption[];
  defaultStudentId?: string;
  defaultPaidAt: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const form = useForm<CreatePaymentInput>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      studentId: defaultStudentId ?? "",
      amount: "",
      method: "CASH",
      paidAt: defaultPaidAt,
      enrollmentId: "",
      coversMonth: "",
      notes: "",
    },
  });

  const selectedStudentId = useWatch({
    control: form.control,
    name: "studentId",
  });
  const selectedEnrollmentId = useWatch({
    control: form.control,
    name: "enrollmentId",
  });

  const studentEnrollments = enrollments.filter(
    (e) => e.studentId === selectedStudentId
  );
  const selectedEnrollment = studentEnrollments.find(
    (enrollment) => enrollment.id === selectedEnrollmentId,
  );

  async function onSubmit(values: CreatePaymentInput) {
    try {
      const result = await createPaymentAction(values);
      if (result.success) {
        toast.success("Payment recorded");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/payments");
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to record payment",
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        <FormField
          control={form.control}
          name="studentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Student</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue("enrollmentId", "");
                  form.setValue("coversMonth", "");
                }}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (USD)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Method</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="paidAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Date</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Pick payment date"
                  clearable={false}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {studentEnrollments.length > 0 && (
          <FormField
            control={form.control}
            name="enrollmentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link to Enrollment (optional)</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (
                      !value ||
                      enrollments.find((enrollment) => enrollment.id === value)
                        ?.packageType !== "MONTHLY"
                    ) {
                      form.setValue("coversMonth", "");
                    }
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No enrollment" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">No enrollment</SelectItem>
                    {studentEnrollments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {selectedEnrollment?.packageType === "MONTHLY" && (
          <FormField
            control={form.control}
            name="coversMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Covers Month (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="month"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Assign this payment to a valid billing-period start month.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Recording..." : "Record Payment"}
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
