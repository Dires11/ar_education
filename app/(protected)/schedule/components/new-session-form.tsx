"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format, setHours, setMinutes } from "date-fns";
import {
  CalendarClockIcon,
  RepeatIcon,
  ZapIcon,
} from "lucide-react";
import {
  createAdHocSessionAction,
  createRecurringScheduleAction,
  getEnrollmentMonthSummaryAction,
  getActiveRecurrenceRulesAction,
  getActiveRecurrenceRulesForGroupAction,
} from "@/app/actions/sessions";
import { localTimeToUTC } from "@/lib/utils/time";
import type { EnrollmentMonthSummary } from "@/lib/services/sessions";
import { EditRecurringGroupDialog } from "./edit-recurring-group-dialog";
import {
  createAdHocSessionSchema,
  createRecurrenceSchema,
  type CreateAdHocSessionInput,
  type CreateRecurrenceInput,
} from "@/lib/validators/sessions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OneTimeSessionFields } from "./one-time-session-fields";
import { RecurringSessionFields } from "./recurring-session-fields";
import type {
  ActiveEnrollmentRule,
  ActiveGroupRule,
  SessionEnrollment,
  SessionGroup,
  Subject,
  Tutor,
} from "./session-form-types";

const ENROLLMENT_PALETTE_FORM = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
];

function hashToColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h = h & h;
  }
  return ENROLLMENT_PALETTE_FORM[Math.abs(h) % ENROLLMENT_PALETTE_FORM.length];
}

export function NewSessionForm({
  tutors,
  subjects,
  enrollments,
  groups,
  defaultDate,
  onSuccess,
}: {
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: SessionEnrollment[];
  groups: SessionGroup[];
  defaultDate?: Date;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"adhoc" | "recurring">("adhoc");

  // ── Ad-hoc date/time state ────────────────────────────────────────
  const [adHocDate, setAdHocDate] = useState<Date | undefined>(defaultDate);
  const [adHocTime, setAdHocTime] = useState("09:00");
  const [monthSummary, setMonthSummary] =
    useState<EnrollmentMonthSummary | null>(null);

  // ── Recurring date state ──────────────────────────────────────────
  const [recurStartDate, setRecurStartDate] = useState<Date | undefined>(
    defaultDate ?? new Date(),
  );
  const [recurEndDate, setRecurEndDate] = useState<Date | undefined>();
  const [perDayTimes, setPerDayTimes] = useState<Record<string, string>>({});
  const [touchedDays, setTouchedDays] = useState<Set<string>>(new Set());
  const [recurringColor, setRecurringColor] = useState<string>("#6366f1");
  const [activeRules, setActiveRules] = useState<ActiveEnrollmentRule[]>([]);
  const [editingGroupOpen, setEditingGroupOpen] = useState(false);
  const [activeGroupRules, setActiveGroupRules] = useState<ActiveGroupRule[]>(
    [],
  );
  const [recurEnrollOpen, setRecurEnrollOpen] = useState(false);
  const [adHocEnrollOpen, setAdHocEnrollOpen] = useState(false);

  // ── Forms ─────────────────────────────────────────────────────────
  const adHocForm = useForm<CreateAdHocSessionInput>({
    resolver: zodResolver(createAdHocSessionSchema),
    defaultValues: {
      enrollmentId: "",
      groupId: "",
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
      groupId: "",
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
  }, [adHocDate, adHocForm, adHocTime]);

  // ── Sync recurring start/end dates ────────────────────────────────
  useEffect(() => {
    recurringForm.setValue(
      "startsOn",
      recurStartDate ? format(recurStartDate, "yyyy-MM-dd") : "",
    );
  }, [recurringForm, recurStartDate]);

  useEffect(() => {
    recurringForm.setValue(
      "endsOn",
      recurEndDate ? format(recurEndDate, "yyyy-MM-dd") : "",
    );
  }, [recurringForm, recurEndDate]);

  // ── Enrollment auto-fill ──────────────────────────────────────────
  const selectedEnrollmentId = useWatch({
    control: adHocForm.control,
    name: "enrollmentId",
  });
  const selectedEnrollment = enrollments.find(
    (e) => e.id === selectedEnrollmentId,
  );
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

  const recurringGroupId = useWatch({
    control: recurringForm.control,
    name: "groupId",
  });
  const adHocGroupId = useWatch({
    control: adHocForm.control,
    name: "groupId",
  });

  const recurringEnrollment = enrollments.find(
    (e) => e.id === recurringEnrollmentId,
  );
  const recurringGroup = groups.find((g) => g.id === recurringGroupId);
  const selectedAdHocGroup = groups.find((g) => g.id === adHocGroupId);
  const hasAutoFilledScheduleContext =
    !!selectedEnrollment || !!selectedAdHocGroup;
  const packageLimit = recurringEnrollment?.sessionsPerWeek ?? null;
  const groupPackageLimit = recurringGroup?.sessionsPerWeek ?? null;
  const daysOverLimit = recurringGroupId
    ? groupPackageLimit !== null &&
      activeGroupRules.length + recurringDaysOfWeek.length > groupPackageLimit
    : packageLimit !== null &&
      activeRules.length + recurringDaysOfWeek.length > packageLimit;
  const recurringExceedsLimit = daysOverLimit && !recurEndDate;

  // ── Sessions remaining for selected enrollment + date ─────────────
  useEffect(() => {
    if (!selectedEnrollmentId || !adHocDate) {
      Promise.resolve().then(() => setMonthSummary(null));
      return;
    }
    const [h, m] = adHocTime.split(":").map(Number);
    const combined = setMinutes(setHours(new Date(adHocDate), h), m);
    getEnrollmentMonthSummaryAction(
      selectedEnrollmentId,
      combined.toISOString(),
    )
      .then(setMonthSummary)
      .catch(() => setMonthSummary(null));
  }, [selectedEnrollmentId, adHocDate, adHocTime]);

  // ── Active recurrence rules for recurring enrollment ─────────────
  useEffect(() => {
    if (!recurringEnrollmentId) {
      setActiveRules([]);
      return;
    }
    let cancelled = false;
    getActiveRecurrenceRulesAction(recurringEnrollmentId)
      .then((rules) => {
        if (!cancelled) setActiveRules(rules);
      })
      .catch(() => {
        if (!cancelled) setActiveRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [recurringEnrollmentId]);

  // ── Active recurrence rules for recurring group ──────────────────
  useEffect(() => {
    if (!recurringGroupId) {
      setActiveGroupRules([]);
      return;
    }
    let cancelled = false;
    getActiveRecurrenceRulesForGroupAction(recurringGroupId)
      .then((rules) => {
        if (!cancelled) setActiveGroupRules(rules);
      })
      .catch(() => {
        if (!cancelled) setActiveGroupRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [recurringGroupId]);

  // ── Seed color from enrollment hash ──────────────────────────────
  useEffect(() => {
    if (recurringEnrollmentId) {
      setRecurringColor(hashToColor(recurringEnrollmentId));
    }
  }, [recurringEnrollmentId]);

  useEffect(() => {
    if (recurringGroupId) {
      setRecurringColor(hashToColor(recurringGroupId));
    }
  }, [recurringGroupId]);

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
      const utcPerDayTimes =
        values.daysOfWeek.length > 1
          ? Object.fromEntries(
              Object.entries(perDayTimes).map(([day, t]) => [day, localTimeToUTC(t)])
            )
          : undefined;
      const submitValues: CreateRecurrenceInput = {
        ...values,
        startTime: localTimeToUTC(values.startTime),
        startTimes: utcPerDayTimes,
        color: recurringColor,
      };
      const result = await createRecurringScheduleAction(submitValues);
      toast.success(
        `Recurring schedule created (${result.rulesCreated} day${result.rulesCreated !== 1 ? "s" : ""})`,
      );
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/schedule");
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create recurring schedule",
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
            {enrollments.length} enrollments ·{" "}
            {groups.length > 0 ? `${groups.length} groups · ` : ""}
            {tutors.length} tutors
          </p>
        </div>
      </div>

      {/* Tabs + forms */}
      <div className="p-4 sm:p-5">
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

          <TabsContent value="adhoc" className="mt-3 sm:mt-4">
            <OneTimeSessionFields
              form={adHocForm}
              tutors={tutors}
              subjects={subjects}
              enrollments={enrollments}
              groups={groups}
              adHocDate={adHocDate}
              setAdHocDate={setAdHocDate}
              adHocTime={adHocTime}
              setAdHocTime={setAdHocTime}
              monthSummary={monthSummary}
              adHocEnrollOpen={adHocEnrollOpen}
              setAdHocEnrollOpen={setAdHocEnrollOpen}
              adHocGroupId={adHocGroupId}
              hasAutoFilledScheduleContext={hasAutoFilledScheduleContext}
              onSubmit={onAdHocSubmit}
            />
          </TabsContent>

          <TabsContent value="recurring" className="mt-3 sm:mt-4">
            <RecurringSessionFields
              form={recurringForm}
              enrollments={enrollments}
              groups={groups}
              recurEnrollOpen={recurEnrollOpen}
              setRecurEnrollOpen={setRecurEnrollOpen}
              recurringGroupId={recurringGroupId}
              recurringDaysOfWeek={recurringDaysOfWeek}
              recurringStartTime={recurringStartTime}
              recurStartDate={recurStartDate}
              setRecurStartDate={setRecurStartDate}
              recurEndDate={recurEndDate}
              setRecurEndDate={setRecurEndDate}
              perDayTimes={perDayTimes}
              setPerDayTimes={setPerDayTimes}
              touchedDays={touchedDays}
              setTouchedDays={setTouchedDays}
              recurringColor={recurringColor}
              setRecurringColor={setRecurringColor}
              packageLimit={packageLimit}
              groupPackageLimit={groupPackageLimit}
              daysOverLimit={daysOverLimit}
              recurringExceedsLimit={recurringExceedsLimit}
              activeRules={activeRules}
              activeGroupRules={activeGroupRules}
              setEditingGroupOpen={setEditingGroupOpen}
              onSubmit={onRecurringSubmit}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit existing recurring schedule dialog */}
      {editingGroupOpen &&
        activeRules.length > 0 &&
        activeRules[0].enrollment && (
          <EditRecurringGroupDialog
            rules={
              activeRules.filter(
                (r) => r.enrollment,
              ) as ((typeof activeRules)[0] & {
                enrollment: NonNullable<(typeof activeRules)[0]["enrollment"]>;
              })[]
            }
            subjectName={activeRules[0].enrollment.subject.name}
            enrollmentId={recurringEnrollmentId || undefined}
            open={editingGroupOpen}
            onChanged={() => {
              if (recurringEnrollmentId) {
                getActiveRecurrenceRulesAction(recurringEnrollmentId)
                  .then(setActiveRules)
                  .catch(() => {});
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                setEditingGroupOpen(false);
              }
            }}
          />
        )}
    </div>
  );
}
