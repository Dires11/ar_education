"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format, setHours, setMinutes, endOfMonth } from "date-fns";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CalendarIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  DoorOpenIcon,
  InfoIcon,
  RepeatIcon,
  StickyNoteIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import {
  createAdHocSessionAction,
  createRecurringScheduleAction,
  getEnrollmentMonthSummaryAction,
  getActiveRecurrenceRulesAction,
} from "@/app/actions/sessions";
import type { EnrollmentMonthSummary } from "@/lib/services/sessions";
import { EditRecurringGroupDialog, type GroupRule } from "./edit-recurring-group-dialog";
import {
  createAdHocSessionSchema,
  createRecurrenceSchema,
  type CreateAdHocSessionInput,
  type CreateRecurrenceInput,
} from "@/lib/validators/sessions";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ENROLLMENT_PALETTE_FORM = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#10b981",
  "#14b8a6","#06b6d4","#0ea5e9","#6366f1","#8b5cf6",
  "#a855f7","#ec4899",
];

function hashToColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h) + id.charCodeAt(i);
    h = h & h;
  }
  return ENROLLMENT_PALETTE_FORM[Math.abs(h) % ENROLLMENT_PALETTE_FORM.length];
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const hex = value || "#6366f1";
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2">
      <div
        className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-border"
        style={{ backgroundColor: hex }}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{hex}</span>
    </label>
  );
}

type Tutor = { id: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string };
type Enrollment = {
  id: string;
  label: string;
  studentId: string;
  tutorId: string;
  subjectId: string;
  sessionsPerWeek?: number | null;
  packageName?: string | null;
};

// Monday-first to match the calendar grid
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Maps button index (0=Mon) to JS day-of-week value (0=Sun..6=Sat)
const DAY_VALUES = ["1", "2", "3", "4", "5", "6", "0"];

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
}: {
  options: { value: string; label: string; sublabel?: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="min-w-0 truncate text-left">
              {selected.label}
              {selected.sublabel && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {selected.sublabel}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>{emptyText ?? "No options found."}</CommandEmpty>
          <CommandGroup className="max-h-56 overflow-y-auto">
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === o.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.sublabel}
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DatePickerButton({
  date,
  onSelect,
  placeholder = "Pick a date",
}: {
  date: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {date ? format(date, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onSelect(d);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function NewSessionForm({
  tutors,
  subjects,
  enrollments,
  defaultDate,
  onSuccess,
}: {
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: Enrollment[];
  defaultDate?: Date;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"adhoc" | "recurring">("adhoc");

  // ── Ad-hoc date/time state ────────────────────────────────────────
  const [adHocDate, setAdHocDate] = useState<Date | undefined>(defaultDate);
  const [adHocTime, setAdHocTime] = useState("09:00");
  const [monthSummary, setMonthSummary] = useState<EnrollmentMonthSummary | null>(null);

  // ── Recurring date state ──────────────────────────────────────────
  const [recurStartDate, setRecurStartDate] = useState<Date | undefined>(
    defaultDate ?? new Date()
  );
  const [recurEndDate, setRecurEndDate] = useState<Date | undefined>();
  const [perDayTimes, setPerDayTimes] = useState<Record<string, string>>({});
  const [touchedDays, setTouchedDays] = useState<Set<string>>(new Set());
  const [recurringColor, setRecurringColor] = useState<string>("#6366f1");
  type ActiveRule = GroupRule & { enrollment: { subject: { name: string } } };
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [editingGroupOpen, setEditingGroupOpen] = useState(false);

  // ── Forms ─────────────────────────────────────────────────────────
  const adHocForm = useForm<CreateAdHocSessionInput>({
    resolver: zodResolver(createAdHocSessionSchema),
    defaultValues: {
      enrollmentId: "",
      tutorId: "",
      subjectId: "",
      scheduledFor: "",
      durationMinutes: "60",
      room: "",
      notes: "",
      studentIds: [],
    },
  });

  const recurringForm = useForm<CreateRecurrenceInput>({
    resolver: zodResolver(createRecurrenceSchema),
    defaultValues: {
      enrollmentId: "",
      daysOfWeek: [],
      startTime: "09:00",
      durationMinutes: "60",
      intervalWeeks: "1",
      room: "",
      startsOn: defaultDate
        ? format(defaultDate, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      endsOn: "",
    },
  });

  // ── Sync ad-hoc date+time → scheduledFor ─────────────────────────
  useEffect(() => {
    if (adHocDate) {
      const [h, m] = adHocTime.split(":").map(Number);
      const combined = setMinutes(setHours(new Date(adHocDate), h), m);
      adHocForm.setValue("scheduledFor", combined.toISOString());
    } else {
      adHocForm.setValue("scheduledFor", "");
    }
  }, [adHocDate, adHocTime]);

  // ── Sync recurring start/end dates ────────────────────────────────
  useEffect(() => {
    recurringForm.setValue(
      "startsOn",
      recurStartDate ? format(recurStartDate, "yyyy-MM-dd") : ""
    );
  }, [recurStartDate]);

  useEffect(() => {
    recurringForm.setValue(
      "endsOn",
      recurEndDate ? format(recurEndDate, "yyyy-MM-dd") : ""
    );
  }, [recurEndDate]);

  // ── Enrollment auto-fill ──────────────────────────────────────────
  const selectedEnrollmentId = useWatch({
    control: adHocForm.control,
    name: "enrollmentId",
  });
  const selectedEnrollment = enrollments.find(
    (e) => e.id === selectedEnrollmentId
  );
  const autoFilled = !!selectedEnrollment;
  const recurringEnrollmentId = useWatch({
    control: recurringForm.control,
    name: "enrollmentId",
  });
  const recurringDaysOfWeek = useWatch({
    control: recurringForm.control,
    name: "daysOfWeek",
  });

  const recurringStartTime = useWatch({
    control: recurringForm.control,
    name: "startTime",
  });

  const recurringEnrollment = enrollments.find((e) => e.id === recurringEnrollmentId);
  const packageLimit = recurringEnrollment?.sessionsPerWeek ?? null;
  const daysOverLimit =
    packageLimit !== null && recurringDaysOfWeek.length > packageLimit;
  const recurringExceedsLimit = daysOverLimit && !recurEndDate;

  const hasExistingRecurring = activeRules.length > 0;
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ── Sessions remaining for selected enrollment + date ─────────────
  useEffect(() => {
    if (!selectedEnrollmentId || !adHocDate) {
      Promise.resolve().then(() => setMonthSummary(null));
      return;
    }
    const [h, m] = adHocTime.split(":").map(Number);
    const combined = setMinutes(setHours(new Date(adHocDate), h), m);
    getEnrollmentMonthSummaryAction(selectedEnrollmentId, combined.toISOString())
      .then(setMonthSummary)
      .catch(() => setMonthSummary(null));
  }, [selectedEnrollmentId, adHocDate, adHocTime]);

  // ── Active recurrence rules for recurring enrollment ─────────────
  useEffect(() => {
    if (!recurringEnrollmentId) {
      setActiveRules([]);
      return;
    }
    getActiveRecurrenceRulesAction(recurringEnrollmentId)
      .then(setActiveRules)
      .catch(() => setActiveRules([]));
  }, [recurringEnrollmentId]);

  // ── Seed color from enrollment hash ──────────────────────────────
  useEffect(() => {
    if (recurringEnrollmentId) {
      setRecurringColor(hashToColor(recurringEnrollmentId));
    }
  }, [recurringEnrollmentId]);

  // ── Per-day times: seed new days with default time, drop removed ones ──────
  useEffect(() => {
    setPerDayTimes((prev) => {
      const next: Record<string, string> = {};
      for (const day of recurringDaysOfWeek) {
        next[day] = prev[day] ?? recurringStartTime;
      }
      return next;
    });
    setTouchedDays((prev) => {
      const next = new Set(prev);
      for (const day of [...prev]) {
        if (!recurringDaysOfWeek.includes(day)) next.delete(day);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringDaysOfWeek]);

  // ── When default time changes, sync all untouched day times ─────────────────
  useEffect(() => {
    setPerDayTimes((prev) => {
      const next = { ...prev };
      for (const day of recurringDaysOfWeek) {
        if (!touchedDays.has(day)) next[day] = recurringStartTime;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringStartTime]);

  async function onAdHocSubmit(values: CreateAdHocSessionInput) {
    try {
      const result = await createAdHocSessionAction(values);
      if (result.success) {
        toast.success("Session created");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/schedule/${result.id}`);
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    }
  }

  async function onRecurringSubmit(values: CreateRecurrenceInput) {
    try {
      const submitValues: CreateRecurrenceInput = {
        ...values,
        startTimes: values.daysOfWeek.length > 1 ? perDayTimes : undefined,
        color: recurringColor,
      };
      const result = await createRecurringScheduleAction(submitValues);
      toast.success(
        `Recurring schedule created (${result.rulesCreated} day${result.rulesCreated !== 1 ? "s" : ""})`
      );
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/schedule");
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create recurring schedule"
      );
    }
  }

  return (
    <div>
      {/* Compact hero */}
      <div className="flex items-center gap-3 border-b bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 pr-12">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
          <CalendarClockIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">New Session</h2>
          <p className="text-xs text-muted-foreground">
            {enrollments.length} enrollments · {tutors.length} tutors
          </p>
        </div>
      </div>

      {/* Tabs + forms */}
      <div className="p-4">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "adhoc" | "recurring")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="adhoc" className="gap-1.5">
              <ZapIcon className="h-3.5 w-3.5" />
              One-time
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-1.5">
              <RepeatIcon className="h-3.5 w-3.5" />
              Recurring
            </TabsTrigger>
          </TabsList>

          {/* ── One-time session ── */}
          <TabsContent value="adhoc" className="mt-4">
            <Form {...adHocForm}>
              <form
                onSubmit={adHocForm.handleSubmit(onAdHocSubmit)}
                className="space-y-3"
              >
                {/* Enrollment */}
                <FormField
                  control={adHocForm.control}
                  name="enrollmentId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Enrollment</FormLabel>
                        <span className="text-xs text-muted-foreground">
                          auto-fills tutor & subject
                        </span>
                      </div>
                      <FormControl>
                        <SearchableSelect
                          options={[
                            { value: "none", label: "No enrollment" },
                            ...enrollments.map((e) => ({
                              value: e.id,
                              label: e.label,
                              sublabel: [
                                e.packageName,
                                e.sessionsPerWeek != null ? `${e.sessionsPerWeek}×/week` : null,
                              ]
                                .filter(Boolean)
                                .join(" · "),
                            })),
                          ]}
                          value={field.value || "none"}
                          onChange={(v) => {
                            const resolved = v === "none" ? "" : v;
                            field.onChange(resolved);
                            const e = enrollments.find(
                              (en) => en.id === resolved
                            );
                            if (e) {
                              adHocForm.setValue("tutorId", e.tutorId);
                              adHocForm.setValue("subjectId", e.subjectId);
                              adHocForm.setValue("studentIds", [e.studentId]);
                            }
                          }}
                          placeholder="Search enrollments..."
                          emptyText="No enrollments found."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tutor + Subject */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={adHocForm.control}
                    name="tutorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tutor</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={tutors.map((t) => ({
                              value: t.id,
                              label: t.name,
                            }))}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Select tutor"
                            emptyText="No tutors found."
                          />
                        </FormControl>
                        {autoFilled && (
                          <p className="text-xs text-teal-600">
                            From enrollment
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={adHocForm.control}
                    name="subjectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select subject" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subjects.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {autoFilled && (
                          <p className="text-xs text-teal-600">
                            From enrollment
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Date + Time + Duration */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <FormField
                      control={adHocForm.control}
                      name="scheduledFor"
                      render={() => (
                        <FormItem>
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <DatePickerButton
                              date={adHocDate}
                              onSelect={setAdHocDate}
                              placeholder="Pick a date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium leading-none">
                      Time
                    </label>
                    <Input
                      type="time"
                      value={adHocTime}
                      onChange={(e) => setAdHocTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Sessions remaining indicator */}
                {monthSummary && monthSummary.sessionsPerWeek !== null && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                      monthSummary.isOverLimit
                        ? "border-red-200 bg-red-50 text-red-700"
                        : monthSummary.remaining === 1
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-teal-200 bg-teal-50 text-teal-700"
                    )}
                  >
                    <span className="font-medium">{monthSummary.periodLabel}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      {monthSummary.totalPlanned}/{monthSummary.sessionsPerWeek} sessions planned
                    </span>
                    <span className="ml-auto font-semibold">
                      {monthSummary.isOverLimit
                        ? "Package limit reached"
                        : `${monthSummary.remaining} remaining`}
                    </span>
                  </div>
                )}

                {/* Duration + Room */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={adHocForm.control}
                    name="durationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          Duration (min)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="15"
                            step="15"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={adHocForm.control}
                    name="room"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <DoorOpenIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          Room
                          <span className="text-xs font-normal text-muted-foreground">
                            (opt.)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Room 1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Notes */}
                <FormField
                  control={adHocForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <StickyNoteIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        Notes
                        <span className="text-xs font-normal text-muted-foreground">
                          (opt.)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={2}
                          className="resize-none"
                          placeholder="Any notes for this session..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={
                    adHocForm.formState.isSubmitting ||
                    monthSummary?.isOverLimit === true
                  }
                  className="w-full"
                >
                  {adHocForm.formState.isSubmitting
                    ? "Creating..."
                    : "Create Session"}
                </Button>
              </form>
            </Form>
          </TabsContent>

          {/* ── Recurring schedule ── */}
          <TabsContent value="recurring" className="mt-4">
            <Form {...recurringForm}>
              <form
                onSubmit={recurringForm.handleSubmit(onRecurringSubmit)}
                className="space-y-3"
              >
                {/* Enrollment */}
                <FormField
                  control={recurringForm.control}
                  name="enrollmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enrollment</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={enrollments.map((e) => ({
                            value: e.id,
                            label: e.label,
                            sublabel: [
                              e.packageName,
                              e.sessionsPerWeek != null ? `${e.sessionsPerWeek}×/week` : null,
                            ]
                              .filter(Boolean)
                              .join(" · "),
                          }))}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Search enrollments..."
                          emptyText="No enrollments found."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Package limit badge */}
                {recurringEnrollment && packageLimit !== null && (
                  <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                    <InfoIcon className="h-3.5 w-3.5 shrink-0" />
                    This package allows{" "}
                    <span className="font-semibold">{packageLimit} session{packageLimit !== 1 ? "s" : ""}/week</span>
                  </div>
                )}

                {/* Existing recurring schedule conflict warning */}
                {hasExistingRecurring && (
                  <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <p className="font-medium">Recurring schedule already exists</p>
                        <p className="mt-0.5 text-orange-800">
                          {activeRules.map((r, i) => (
                            <span key={r.id}>
                              {i > 0 && ", "}
                              <span className="font-semibold">
                                {DAY_NAMES[r.dayOfWeek]} at {r.startTime}
                              </span>
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-orange-300 bg-white/70 px-2 text-[11px] text-orange-900 hover:bg-white"
                      onClick={() => setEditingGroupOpen(true)}
                    >
                      Edit Schedule
                    </Button>
                  </div>
                )}

                {/* Days of week multi-select */}
                <FormField
                  control={recurringForm.control}
                  name="daysOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Days</FormLabel>
                      <FormControl>
                        <div className="flex gap-1.5">
                          {DAYS.map((letter, i) => {
                            const val = DAY_VALUES[i];
                            const isSelected = field.value.includes(val);
                            return (
                              <button
                                key={i}
                                type="button"
                                title={DAY_LABELS[i]}
                                onClick={() => {
                                  const next = isSelected
                                    ? field.value.filter((d) => d !== val)
                                    : [...field.value, val];
                                  field.onChange(next);
                                }}
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                )}
                              >
                                {letter}
                              </button>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Time + Duration + Interval */}
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={recurringForm.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {recurringDaysOfWeek.length > 1 ? "Default time" : "Time"}
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={recurringForm.control}
                    name="durationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min</FormLabel>
                        <FormControl>
                          <Input type="number" min="15" step="15" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={recurringForm.control}
                    name="intervalWeeks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Every</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "1"}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 week</SelectItem>
                            <SelectItem value="2">2 weeks</SelectItem>
                            <SelectItem value="3">3 weeks</SelectItem>
                            <SelectItem value="4">4 weeks</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Per-day start times — compact 2-col grid, sorted by day */}
                {recurringDaysOfWeek.length > 1 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Per-day start times</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {[...recurringDaysOfWeek]
                        .sort((a, b) => DAY_VALUES.indexOf(a) - DAY_VALUES.indexOf(b))
                        .map((dayVal) => {
                          const idx = DAY_VALUES.indexOf(dayVal);
                          const isLinked = !touchedDays.has(dayVal);
                          return (
                            <div key={dayVal} className="flex items-center gap-1.5">
                              <span className="w-7 shrink-0 text-xs font-medium text-muted-foreground">
                                {idx >= 0 ? DAY_LABELS[idx] : dayVal}
                              </span>
                              <Input
                                type="time"
                                className={cn("h-7 text-xs", isLinked && "text-muted-foreground")}
                                value={perDayTimes[dayVal] ?? recurringStartTime}
                                onChange={(e) => {
                                  setTouchedDays((prev) => new Set([...prev, dayVal]));
                                  setPerDayTimes((prev) => ({ ...prev, [dayVal]: e.target.value }));
                                }}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Start + End dates */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={recurringForm.control}
                    name="startsOn"
                    render={() => (
                      <FormItem>
                        <FormLabel>Starts On</FormLabel>
                        <FormControl>
                          <DatePickerButton
                            date={recurStartDate}
                            onSelect={setRecurStartDate}
                            placeholder="Start date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={recurringForm.control}
                    name="endsOn"
                    render={() => (
                      <FormItem>
                        <div className="flex min-h-5 items-center justify-between gap-2">
                          <FormLabel>
                            Ends On
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (opt.)
                            </span>
                          </FormLabel>
                          {recurEndDate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto px-1 py-0 text-xs text-muted-foreground"
                              onClick={() => setRecurEndDate(undefined)}
                            >
                              <XIcon className="mr-1 h-3 w-3" />
                              Clear
                            </Button>
                          )}
                        </div>
                        <FormControl>
                          <DatePickerButton
                            date={recurEndDate}
                            onSelect={setRecurEndDate}
                            placeholder="End date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Over-limit warning */}
                {daysOverLimit && (
                  <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>
                        You selected <span className="font-semibold">{recurringDaysOfWeek.length} days/week</span> but
                        the package only allows <span className="font-semibold">{packageLimit}</span>.
                        {recurEndDate
                          ? " End date is set — this will be created as a one-time exception."
                          : " Choose how to fix this:"}
                      </p>
                    </div>
                    {!recurEndDate && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-amber-300 bg-white/70 px-2 text-[11px] text-amber-900 hover:bg-white"
                          onClick={() => {
                            const current = recurringForm.getValues("daysOfWeek");
                            recurringForm.setValue("daysOfWeek", current.slice(0, packageLimit!));
                          }}
                        >
                          Trim to {packageLimit} day{packageLimit !== 1 ? "s" : ""}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-amber-300 bg-white/70 px-2 text-[11px] text-amber-900 hover:bg-white"
                          onClick={() => {
                            const base = recurStartDate ?? new Date();
                            setRecurEndDate(endOfMonth(base));
                          }}
                        >
                          End of {format(recurStartDate ?? new Date(), "MMMM")} only
                        </Button>
                        <span className="flex items-center text-[11px] text-amber-700">
                          or select a different enrollment
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Room + Color */}
                <div className="flex items-end gap-3">
                  <FormField
                    control={recurringForm.control}
                    name="room"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel className="flex items-center gap-1.5">
                          <DoorOpenIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          Room
                          <span className="text-xs font-normal text-muted-foreground">(opt.)</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Room 1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-1.5 pb-0.5">
                    <label className="text-sm font-medium leading-none">Color</label>
                    <div className="flex h-9 items-center">
                      <ColorPicker value={recurringColor} onChange={setRecurringColor} />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={
                    recurringForm.formState.isSubmitting ||
                    recurringExceedsLimit ||
                    hasExistingRecurring
                  }
                  className="w-full"
                >
                  {recurringForm.formState.isSubmitting
                    ? "Creating..."
                    : "Create Recurring Schedule"}
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit existing recurring schedule dialog */}
      {editingGroupOpen && activeRules.length > 0 && (
        <EditRecurringGroupDialog
          rules={activeRules}
          subjectName={activeRules[0].enrollment.subject.name}
          enrollmentId={recurringEnrollmentId || undefined}
          open={editingGroupOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditingGroupOpen(false);
              if (recurringEnrollmentId) {
                getActiveRecurrenceRulesAction(recurringEnrollmentId)
                  .then(setActiveRules)
                  .catch(() => {});
              }
            }
          }}
        />
      )}
    </div>
  );
}
