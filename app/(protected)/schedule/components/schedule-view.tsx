"use client";

import { useState, useTransition, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, isSameMonth } from "date-fns";
import { MonthCalendar, type CalendarSession } from "./week-calendar";
import { NewSessionDialog } from "./new-session-dialog";
import { PageHero } from "@/components/page-hero";
import { fetchScheduleForMonth } from "@/app/actions/sessions";
import type { VirtualSession } from "@/lib/services/sessions";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  UsersIcon,
} from "lucide-react";
import type { SessionEnrollment, SessionGroup, Subject, Tutor } from "./session-form-types";
import { getPickerDateInTimeZone } from "@/lib/utils/time-zone";

function mergeAll(
  sessions: CalendarSession[],
  virtualSessions: VirtualSession[]
): CalendarSession[] {
  return [
    ...sessions,
    ...virtualSessions.map((v) => ({
      ...v,
      notes: null as string | null,
      recurrenceRuleId: null as string | null,
      virtual: true as const,
    })),
  ];
}

function getLocalMonthStart(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function ScheduleView({
  monthKey,
  initialSessionId,
  initialRecurrenceId,
  centerTimeZone,
  sessions: initialSessions,
  virtualSessions: initialVirtual,
  tutors,
  subjects,
  enrollments,
  groups,
}: {
  monthKey: string;
  initialSessionId: string | null;
  initialRecurrenceId: string | null;
  centerTimeZone: string;
  sessions: CalendarSession[];
  virtualSessions: VirtualSession[];
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: SessionEnrollment[];
  groups: SessionGroup[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialMonthStart = getLocalMonthStart(monthKey);
  const [isPending, startTransition] = useTransition();
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [allSessions, setAllSessions] = useState<CalendarSession[]>(
    mergeAll(initialSessions, initialVirtual)
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => {
    const initialTarget = mergeAll(initialSessions, initialVirtual).find(
      (session) =>
        session.id === initialSessionId ||
        session.ruleId === initialRecurrenceId,
    );
    if (initialTarget) {
      return getPickerDateInTimeZone(
        new Date(initialTarget.scheduledFor),
        centerTimeZone,
      );
    }
    const today = getPickerDateInTimeZone(new Date(), centerTimeZone);
    return isSameMonth(today, initialMonthStart) ? today : null;
  });
  const navVersion = useRef(0);

  function updateScheduleUrl(input: {
    month: string;
    sessionId?: string;
    recurrenceId?: string;
  }) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("month", input.month);
    if (input.sessionId) next.set("session", input.sessionId);
    else next.delete("session");
    if (input.recurrenceId) next.set("recurrence", input.recurrenceId);
    else next.delete("recurrence");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function navigate(newMonth: Date) {
    setSelectedDay(null);
    const param = format(newMonth, "yyyy-MM");
    updateScheduleUrl({ month: param });
    const version = ++navVersion.current;
    startTransition(async () => {
      const data = await fetchScheduleForMonth(param);
      if (navVersion.current !== version) return;
      setMonthStart(newMonth);
      setAllSessions(mergeAll(data.sessions as CalendarSession[], data.virtual as VirtualSession[]));
    });
  }

  function refresh() {
    const param = format(monthStart, "yyyy-MM");
    startTransition(async () => {
      const data = await fetchScheduleForMonth(param);
      setAllSessions(mergeAll(data.sessions as CalendarSession[], data.virtual as VirtualSession[]));
    });
  }

  const completedCount = allSessions.filter((s) => s.status === "COMPLETED").length;
  const upcomingCount = allSessions.filter((s) =>
    ["SCHEDULED", "VIRTUAL_UPCOMING"].includes(s.status)
  ).length;
  const missedOrCanceledCount = allSessions.filter((s) =>
    [
      "NO_SHOW",
      "CANCELLED_BY_TUTOR",
      "CANCELLED_BY_STUDENT",
    ].includes(s.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHero
        label="Session Calendar"
        title="Schedule"
        description="Plan one-time and recurring sessions, track package limits, and manage attendance from the monthly calendar."
        gradient="from-cyan-50 via-background to-teal-50"
        stats={[
          { icon: CalendarDaysIcon, label: "This Month", value: format(monthStart, "MMM yyyy") },
          { icon: CheckCircle2Icon, label: "Completed", value: completedCount },
          { icon: UsersIcon, label: "Upcoming", value: upcomingCount },
          { icon: AlertCircleIcon, label: "Missed/Cancelled", value: missedOrCanceledCount },
        ]}
        action={
          <NewSessionDialog
            centerTimeZone={centerTimeZone}
            tutors={tutors}
            subjects={subjects}
            enrollments={enrollments}
            groups={groups}
            defaultDate={selectedDay ?? undefined}
            onSuccess={refresh}
          />
        }
      />

      <MonthCalendar
        centerTimeZone={centerTimeZone}
        monthStart={monthStart}
        sessions={allSessions}
        selectedDay={selectedDay}
        initialSessionId={initialSessionId}
        initialRecurrenceId={initialRecurrenceId}
        onDaySelect={setSelectedDay}
        onNavigate={navigate}
        onRefresh={refresh}
        onSessionOpen={(session) =>
          updateScheduleUrl({
            month: format(monthStart, "yyyy-MM"),
            sessionId: session.id,
          })
        }
        onRecurrenceOpen={(session) =>
          updateScheduleUrl({
            month: format(monthStart, "yyyy-MM"),
            recurrenceId: session.ruleId ?? undefined,
          })
        }
        onTargetClose={() =>
          updateScheduleUrl({ month: format(monthStart, "yyyy-MM") })
        }
        isPending={isPending}
      />
    </div>
  );
}
