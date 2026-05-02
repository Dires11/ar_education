"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  BanknoteIcon,
  CalendarClockIcon,
  ClockIcon,
  BookOpenIcon,
  UsersIcon,
  UserRoundIcon,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  const lessonType = useWatch({ control: form.control, name: "lessonType" });
  const billingPeriod = useWatch({ control: form.control, name: "billingPeriod" });
  const sessionsPerWeek = useWatch({ control: form.control, name: "sessionsPerWeek" });
  const subjectId = useWatch({ control: form.control, name: "subjectId" });

  const billingPeriodLabel =
    billingPeriod === "YEARLY"
      ? "year"
      : billingPeriod === "THREE_MONTHS"
      ? "3 months"
      : "month";
  const subjectLabel =
    subjects.find((s) => s.id === subjectId)?.name ?? "Any subject";

  async function handleSubmit(values: CreatePackageInput) {
    try {
      await onSubmit(values);
    } catch {
      toast.error("Failed to save package");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        <section className="rounded-xl border bg-muted/20 p-4 space-y-3">

          {/* Row 1 — Name + Subject */}
          <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Package Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Math 2×/week · Private"
                      className="h-9 bg-background"
                      {...field}
                    />
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
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Subject
                  </FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "any" ? "" : v)}
                    value={field.value || "any"}
                  >
                    <FormControl>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Any subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="any">Any subject</SelectItem>
                      {subjects.map((s) => (
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
          </div>

          {/* Divider */}
          <div className="border-t border-border/60" />

          {/* Row 2 — Format + Billing Type + Period */}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="lessonType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Format
                  </FormLabel>
                  <FormControl>
                    <div className="flex h-9 overflow-hidden rounded-lg border bg-background">
                      {(
                        [
                          { value: "PRIVATE", icon: UserRoundIcon, label: "Private" },
                          { value: "GROUP", icon: UsersIcon, label: "Group" },
                        ] as const
                      ).map((opt, i) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 text-sm transition-colors",
                            i === 0 ? "border-r" : "",
                            lessonType === opt.value
                              ? "bg-primary/8 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted/50"
                          )}
                        >
                          <opt.icon className="h-3.5 w-3.5 shrink-0" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Billing
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-9 bg-background">
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
                    <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Period
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "MONTHLY"}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="THREE_MONTHS">Every 3 months</SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col justify-end">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Period
                </p>
                <div className="flex h-9 items-center rounded-lg border bg-background px-3 text-sm text-muted-foreground">
                  Per session
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border/60" />

          {/* Row 3 — Price + Duration + Sessions */}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {packageType === "MONTHLY" ? "Price / period" : "Price / session"}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <BanknoteIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="h-9 bg-background pl-9"
                        {...field}
                      />
                    </div>
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
                  <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Duration (min)
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <ClockIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        min="15"
                        step="15"
                        className="h-9 bg-background pl-9"
                        {...field}
                      />
                    </div>
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
                    <FormLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Sessions / week
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <CalendarClockIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="number"
                          min="1"
                          placeholder="2"
                          className="h-9 bg-background pl-9"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col justify-end">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sessions / week
                </p>
                <div className="flex h-9 items-center rounded-lg border bg-background px-3 text-sm text-muted-foreground">
                  Unlimited
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Summary strip */}
        {packageType === "MONTHLY" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5">
            <Badge
              variant="outline"
              className="rounded-full border-primary/20 bg-background/80 text-xs font-medium text-primary"
            >
              <CalendarClockIcon className="mr-1 h-3 w-3" />
              {sessionsPerWeek || "0"}&thinsp;×&thinsp;/week
            </Badge>
            <span className="text-xs text-muted-foreground">
              Paid every {billingPeriodLabel}
            </span>
            <span className="text-xs text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <BookOpenIcon className="h-3 w-3" />
              {subjectLabel}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (onCancel ? onCancel() : router.back())}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
