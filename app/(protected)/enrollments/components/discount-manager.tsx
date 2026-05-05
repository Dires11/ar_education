"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { addDiscountAction, removeDiscountAction } from "@/app/actions/enrollments";
import {
  createDiscountSchema,
  type CreateDiscountInput,
} from "@/lib/validators/enrollments";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { PlusIcon, TrashIcon } from "lucide-react";

type Discount = {
  id: string;
  kind: string;
  value: string;
  temporary: boolean;
  validFrom?: string;
  validUntil?: string;
  usesRemaining?: number;
  notes?: string;
};

const DISCOUNT_LABELS: Record<string, string> = {
  PERCENT_OFF: "% Off",
  FIXED_OFF: "Fixed $ Off",
  FREE_SESSIONS: "Free Sessions",
  FREE_MONTH: "Free Month",
  REDUCED_RATE: "Reduced Rate",
};

export function DiscountManager({
  enrollmentId,
  studentId,
  discounts,
  onUpdated,
}: {
  enrollmentId: string;
  studentId: string;
  discounts: Discount[];
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateDiscountInput>({
    resolver: zodResolver(createDiscountSchema),
    defaultValues: {
      kind: "PERCENT_OFF",
      value: "",
      temporary: false,
      validFrom: "",
      validUntil: "",
      usesRemaining: "",
      notes: "",
    },
  });

  const kind = useWatch({ control: form.control, name: "kind" });
  const isTemporary = useWatch({ control: form.control, name: "temporary" });

  async function handleAdd(values: CreateDiscountInput) {
    try {
      await addDiscountAction(enrollmentId, studentId, values);
      toast.success("Discount added");
      setOpen(false);
      form.reset();
      await onUpdated?.();
      router.refresh();
    } catch {
      toast.error("Failed to add discount");
    }
  }

  async function handleRemove(discountId: string) {
    try {
      await removeDiscountAction(discountId, enrollmentId, studentId);
      toast.success("Discount removed");
      await onUpdated?.();
      router.refresh();
    } catch {
      toast.error("Failed to remove discount");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Discount
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Discount</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAdd)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {Object.entries(DISCOUNT_LABELS).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Value{kind === "PERCENT_OFF" ? " (%)" : kind === "FREE_SESSIONS" ? " (sessions)" : " ($)"}
                        </FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="temporary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "true")}
                        defaultValue={field.value ? "true" : "false"}
                      >
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="false">Permanent</SelectItem>
                          <SelectItem value="true">Temporary</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isTemporary && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="validFrom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valid From</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="validUntil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valid Until</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    Add Discount
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {discounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No discounts applied</p>
      ) : (
        <div className="rounded-md border divide-y">
          {discounts.map((discount) => (
            <div key={discount.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {DISCOUNT_LABELS[discount.kind]}:{" "}
                    {discount.kind === "PERCENT_OFF"
                      ? `${discount.value}%`
                      : discount.kind === "FREE_SESSIONS"
                        ? `${discount.value} sessions free`
                        : discount.kind === "FREE_MONTH"
                          ? "First month free"
                          : `$${discount.value}`}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      discount.temporary
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {discount.temporary ? "Temporary" : "Permanent"}
                  </span>
                </div>
                {discount.temporary && (discount.validFrom || discount.validUntil) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {discount.validFrom && `From ${discount.validFrom}`}
                    {discount.validFrom && discount.validUntil && " · "}
                    {discount.validUntil && `Until ${discount.validUntil}`}
                  </p>
                )}
                {discount.notes && (
                  <p className="text-xs text-muted-foreground">{discount.notes}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleRemove(discount.id)}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
