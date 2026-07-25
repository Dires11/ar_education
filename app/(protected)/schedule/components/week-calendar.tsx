"use client";

import React, { useState, useEffect } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addMonths,
  subMonths,
  addMinutes,
} from "date-fns";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  BanIcon,
  UserXIcon,
  UserIcon,
  UsersIcon,
  RepeatIcon,
  GraduationCapIcon,
  BookOpenIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteSessionAction,
  setSessionStatusAction,
  getActiveRecurrenceRulesAction,
  getActiveRecurrenceRulesForGroupAction,
} from "@/app/actions/sessions";
import { toast } from "sonner";
import { EditSessionDialog } from "./edit-session-dialog";
import {
  EditRecurringGroupDialog,
  type GroupRule,
} from "./edit-recurring-group-dialog";
import type { CalendarSession } from "./calendar-session";
import { SessionDetailsDialog } from "./session-details-dialog";

export type { CalendarSession } from "./calendar-session";

const ENROLLMENT_PALETTE = [
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
  return ENROLLMENT_PALETTE[Math.abs(h) % ENROLLMENT_PALETTE.length];
}

function resolveSessionColor(session: CalendarSession): string {
  return session.color ?? hashToColor(session.enrollmentId ?? session.id);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darkenHex(hex: string, amount = 0.35): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(b * (1 - amount))})`;
}

function pillTextColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  // Relative luminance per WCAG
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.179 ? "#000000" : "#ffffff";
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-sky-50 border-sky-200 text-sky-900",
  RESCHEDULED: "bg-violet-50 border-violet-200 text-violet-900",
  COMPLETED: "bg-emerald-50 border-emerald-200 text-emerald-900",
  NO_SHOW: "bg-rose-50 border-rose-200 text-rose-900",
  CANCELLED_BY_TUTOR: "bg-orange-50 border-orange-200 text-orange-900",
  CANCELLED_BY_STUDENT: "bg-orange-50 border-orange-200 text-orange-900",
  // Virtual
  VIRTUAL_UPCOMING: "border-dashed bg-sky-50/70 border-sky-200 text-sky-700",
  VIRTUAL_DEPLETED: "border-dashed bg-amber-50 border-amber-200 text-amber-700",
};

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Left border color per status — signals outcome without overriding the enrollment color
const STATUS_BORDER_HEX: Record<string, string> = {
  COMPLETED: "#10b981", // emerald
  NO_SHOW: "#f59e0b", // amber
  VIRTUAL_DEPLETED: "#f59e0b",
  CANCELLED_BY_TUTOR: "#ef4444", // red
  CANCELLED_BY_STUDENT: "#ef4444",
};

function getSessionPillStyle(session: CalendarSession): {
  className: string;
  style: React.CSSProperties;
} {
  const enrollmentColor = resolveSessionColor(session);
  const statusBorder = STATUS_BORDER_HEX[session.status];
  const isVirtual = !!session.virtual;
  const isUnpaid = session.isPaid === false;
  const leftColor = isUnpaid ? "#f59e0b" : (statusBorder ?? darkenHex(enrollmentColor));
  // Blend enrollment color at ~8% on white to get the actual rendered background
  const [r, g, b] = hexToRgb(enrollmentColor);
  const alpha = 0x15 / 0xff;
  const blended = `#${[r, g, b]
    .map((c) => Math.round(255 * (1 - alpha) + c * alpha).toString(16).padStart(2, "0"))
    .join("")}`;
  const textColor = pillTextColor(blended);

  return {
    className: isVirtual || isUnpaid ? "border-dashed" : "",
    style: {
      backgroundColor: enrollmentColor + "15",
      color: textColor,
      borderColor: enrollmentColor + "50",
      borderLeftColor: leftColor,
      borderLeftWidth: "3px",
    },
  };
}

function statusLabel(session: CalendarSession) {
  if (session.status === "VIRTUAL_UPCOMING") return "Upcoming";
  if (session.status === "VIRTUAL_DEPLETED") return "Limit reached";
  return session.status.replace(/_/g, " ").toLowerCase();
}

function getStudentNames(session: CalendarSession) {
  const attendanceNames = session.attendance
    .map((a) => `${a.student.firstName} ${a.student.lastName}`)
    .filter(Boolean);

  if (attendanceNames.length > 0) return attendanceNames.join(", ");
  if (session.enrollmentStudent) {
    return `${session.enrollmentStudent.firstName} ${session.enrollmentStudent.lastName}`;
  }

  return "No students";
}

export function MonthCalendar({
  monthStart,
  sessions,
  selectedDay,
  onDaySelect,
  onNavigate,
  onRefresh,
  isPending,
}: {
  monthStart: Date;
  sessions: CalendarSession[];
  selectedDay?: Date | null;
  onDaySelect?: (day: Date | null) => void;
  onNavigate: (month: Date) => void;
  onRefresh: () => void;
  isPending?: boolean;
}) {
  const [editingSession, setEditingSession] = useState<CalendarSession | null>(
    null,
  );
  const [editingRecurring, setEditingRecurring] =
    useState<CalendarSession | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  const [editingRecurringRules, setEditingRecurringRules] = useState<
    GroupRule[]
  >([]);
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingStatusId, setSettingStatusId] = useState<string | null>(null);

  useEffect(() => {
    const enrollmentId = editingRecurring?.enrollmentId;
    const groupId = editingRecurring?.groupId;
    if (!enrollmentId && !groupId) {
      setEditingRecurringRules([]);
      return;
    }
    // Start with the primary rule from the session so dialog opens immediately
    if (editingRecurring.ruleId) {
      setEditingRecurringRules([
        {
          id: editingRecurring.ruleId,
          dayOfWeek: editingRecurring.dayOfWeek ?? 1,
          startTime: editingRecurring.startTime ?? "09:00",
          durationMinutes: editingRecurring.durationMinutes,
          intervalWeeks: editingRecurring.intervalWeeks ?? 1,
          room: editingRecurring.room,
          color: editingRecurring.color ?? null,
        },
      ]);
    }
    const loadRules = enrollmentId
      ? getActiveRecurrenceRulesAction(enrollmentId)
      : getActiveRecurrenceRulesForGroupAction(groupId!);

    // Then fetch all siblings and update
    loadRules
      .then((rules) =>
        setEditingRecurringRules(
          rules.map((r) => ({
            id: r.id,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            durationMinutes: r.durationMinutes,
            intervalWeeks: r.intervalWeeks,
            room: r.room,
            color: r.color ?? null,
          })),
        ),
      )
      .catch(() => {});
  }, [
    editingRecurring?.color,
    editingRecurring?.dayOfWeek,
    editingRecurring?.durationMinutes,
    editingRecurring?.enrollmentId,
    editingRecurring?.groupId,
    editingRecurring?.intervalWeeks,
    editingRecurring?.room,
    editingRecurring?.ruleId,
    editingRecurring?.startTime,
  ]);

  function handleDaySelect(day: Date | null) {
    onDaySelect?.(day);
  }

  async function handleDeleteSession(id: string) {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteSessionAction(id);
      toast.success("Session deleted");
      onRefresh();
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetStatus(
    id: string,
    status:
      | "SCHEDULED"
      | "COMPLETED"
      | "NO_SHOW"
      | "CANCELLED_BY_TUTOR"
      | "CANCELLED_BY_STUDENT",
  ) {
    setSettingStatusId(id);
    try {
      await setSessionStatusAction(id, status);
      toast.success("Status updated");
      onRefresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSettingStatusId(null);
    }
  }

  const calStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const selectedDaySessions = selectedDay
    ? sessions
        .filter((s) => isSameDay(new Date(s.scheduledFor), selectedDay))
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    : [];

  return (
    <>
      {editingSession && !editingSession.virtual && (
        <EditSessionDialog
          session={{
            id: editingSession.id,
            scheduledFor: editingSession.scheduledFor,
            durationMinutes: editingSession.durationMinutes,
            room: editingSession.room,
            notes: editingSession.notes,
          }}
          open={!!editingSession}
          onOpenChange={(open) => {
            if (!open) {
              setEditingSession(null);
              onRefresh();
            }
          }}
        />
      )}

      {editingRecurring?.ruleId && editingRecurringRules.length > 0 && (
        <EditRecurringGroupDialog
          rules={editingRecurringRules}
          subjectName={editingRecurring.subject.name}
          referenceDate={editingRecurring.scheduledFor}
          focusedRuleId={editingRecurring.ruleId}
          enrollmentId={editingRecurring.enrollmentId ?? undefined}
          open={!!editingRecurring}
          onChanged={onRefresh}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRecurring(null);
              setEditingRecurringRules([]);
            }
          }}
        />
      )}

      <SessionDetailsDialog
        session={detailSession}
        open={!!detailSession}
        onRefresh={onRefresh}
        onOpenChange={(open) => {
          if (!open) setDetailSession(null);
        }}
      />

      <div className="grid gap-4 min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Calendar grid */}
        <div className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {/* Month navigation */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div>
              <h2
                className={cn(
                  "text-sm font-medium transition-opacity",
                  isPending && "opacity-50",
                )}
              >
                {format(monthStart, "MMMM yyyy")}
              </h2>
              <p className="text-xs text-muted-foreground">
                Click a day to review sessions.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onNavigate(subMonths(monthStart, 1))}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(startOfMonth(new Date()))}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onNavigate(addMonths(monthStart, 1))}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b bg-background">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div
            className={cn(
              "grid grid-cols-7 transition-opacity",
              isPending && "opacity-50",
            )}
          >
            {days.map((day, i) => {
              const daySessions = sessions
                .filter((s) => isSameDay(new Date(s.scheduledFor), day))
                .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isSelected = selectedDay
                ? isSameDay(day, selectedDay)
                : false;
              const isTodayDate = isToday(day);
              const visible = daySessions.slice(0, 3);
              const overflow = daySessions.length - visible.length;

              return (
                <div
                  key={i}
                  onClick={() => handleDaySelect(isSelected ? null : day)}
                  className={cn(
                    "min-h-[112px] cursor-pointer border-b border-r p-2 transition-colors",
                    "hover:bg-muted/35",
                    isSelected &&
                      "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    !isCurrentMonth && "opacity-35",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 select-none",
                      isTodayDate
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((session) => (
                      <div
                        key={session.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDaySelect(day);
                        }}
                        className={cn(
                          "block truncate  rounded-sm border px-2 py-0.5 text-[11px] cursor-pointer hover:opacity-80",
                          getSessionPillStyle(session).className,
                        )}
                        style={getSessionPillStyle(session).style}
                      >
                        {format(new Date(session.scheduledFor), "h:mm")}{" "}
                        {session.groupId
                          ? (session.groupName ?? "Group")
                          : (session.attendance[0]?.student.lastName ??
                            session.enrollmentStudent?.lastName ??
                            session.subject.name)}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[11px] text-muted-foreground px-1.5">
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        <div className="min-w-0">
          <div className="sticky top-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {selectedDay ? (
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {format(selectedDay, "EEEE")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(selectedDay, "MMMM d, yyyy")}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 -mt-1 -mr-1"
                    onClick={() => handleDaySelect(null)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>

                {selectedDaySessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No sessions scheduled
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDaySessions.map((session) =>
                      session.virtual ? (
                        /* ── Virtual session card ── */
                        <div
                          key={session.id}
                          className={cn(
                            "rounded-xl border bg-background p-3 text-sm space-y-2 shadow-sm",
                            STATUS_COLORS[session.status] ??
                              "bg-gray-100 border-gray-300",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium">
                              {format(new Date(session.scheduledFor), "h:mm")}
                              {" – "}
                              {format(addMinutes(new Date(session.scheduledFor), session.durationMinutes), "h:mm a")}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {session.isPaid === false && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                                  Unpaid
                                </span>
                              )}
                              <span className="text-[10px] uppercase opacity-60">
                                {statusLabel(session)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <BookOpenIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                            <span className="font-medium">{session.subject.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] opacity-70">
                            <GraduationCapIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>{session.tutor.firstName} {session.tutor.lastName}</span>
                          </div>
                          {session.groupId ? (
                            <div>
                              <button
                                className="flex w-full items-center gap-1.5 text-[12px] opacity-70 text-left"
                                onClick={(e) => { e.stopPropagation(); toggleExpanded(session.id); }}
                              >
                                <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium">{session.groupName ?? "Group"}</span>
                                <span className="ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                                  {session.attendance.length}
                                </span>
                                {expandedCards.has(session.id)
                                  ? <ChevronUpIcon className="h-3 w-3 shrink-0" />
                                  : <ChevronDownIcon className="h-3 w-3 shrink-0" />}
                              </button>
                              {expandedCards.has(session.id) && (
                                <div className="mt-1 pl-5 space-y-0.5">
                                  {session.attendance.map((a, i) => (
                                    <div key={i} className="text-[11px] opacity-60">
                                      {a.student.firstName} {a.student.lastName}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[12px] opacity-70">
                              <UserIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>{getStudentNames(session)}</span>
                            </div>
                          )}
                          <div className="pt-1 flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setDetailSession(session)}
                            >
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setEditingRecurring(session)}
                            >
                              <PencilIcon className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── Real session card ── */
                        <div
                          key={session.id}
                          className="rounded-xl border p-3 text-sm space-y-2 shadow-sm"
                          style={{
                            backgroundColor:
                              resolveSessionColor(session) + "15",
                            borderColor: resolveSessionColor(session) + "50",
                            color: "#111827",
                            borderLeftColor:
                              STATUS_BORDER_HEX[session.status] ??
                              resolveSessionColor(session),
                            borderLeftWidth: 4,
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium">
                              {format(new Date(session.scheduledFor), "h:mm")}
                              {" – "}
                              {format(addMinutes(new Date(session.scheduledFor), session.durationMinutes), "h:mm a")}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {session.isPaid === false && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                                  Unpaid
                                </span>
                              )}
                              <span className="text-[10px] uppercase opacity-60">
                                {statusLabel(session)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <BookOpenIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
                            <span className="font-medium">{session.subject.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] opacity-70">
                            <GraduationCapIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>{session.tutor.firstName} {session.tutor.lastName}</span>
                          </div>
                          {session.groupId ? (
                            <div>
                              <button
                                className="flex w-full items-center gap-1.5 text-[12px] opacity-70 text-left"
                                onClick={(e) => { e.stopPropagation(); toggleExpanded(session.id); }}
                              >
                                <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium">{session.groupName ?? "Group"}</span>
                                <span className="ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                                  {session.attendance.length}
                                </span>
                                {expandedCards.has(session.id)
                                  ? <ChevronUpIcon className="h-3 w-3 shrink-0" />
                                  : <ChevronDownIcon className="h-3 w-3 shrink-0" />}
                              </button>
                              {expandedCards.has(session.id) && (
                                <div className="mt-1 pl-5 space-y-0.5">
                                  {session.attendance.map((a, i) => (
                                    <div key={i} className="text-[11px] opacity-60">
                                      {a.student.firstName} {a.student.lastName}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[12px] opacity-70">
                              <UserIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>{getStudentNames(session)}</span>
                            </div>
                          )}

                          {/* Status action buttons — only for SCHEDULED */}
                          {session.status === "SCHEDULED" && (
                            <div className="grid grid-cols-2 gap-1 pt-1 min-w-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 justify-start px-2 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
                                disabled={settingStatusId === session.id}
                                onClick={() =>
                                  handleSetStatus(session.id, "COMPLETED")
                                }
                              >
                                <CheckIcon className="h-3 w-3 mr-1" />
                                Done
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 justify-start px-2 text-[11px] text-red-700 border-red-200 hover:bg-red-50"
                                disabled={settingStatusId === session.id}
                                onClick={() =>
                                  handleSetStatus(session.id, "NO_SHOW")
                                }
                              >
                                <UserXIcon className="h-3 w-3 mr-1" />
                                No-show
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 justify-start px-2 text-[11px] text-orange-700 border-orange-200 hover:bg-orange-50"
                                disabled={settingStatusId === session.id}
                                onClick={() =>
                                  handleSetStatus(
                                    session.id,
                                    "CANCELLED_BY_TUTOR",
                                  )
                                }
                              >
                                <BanIcon className="h-3 w-3 mr-1" />
                                Tutor cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 justify-start px-2 text-[11px] text-orange-700 border-orange-200 hover:bg-orange-50"
                                disabled={settingStatusId === session.id}
                                onClick={() =>
                                  handleSetStatus(
                                    session.id,
                                    "CANCELLED_BY_STUDENT",
                                  )
                                }
                              >
                                <BanIcon className="h-3 w-3 mr-1" />
                                Student cancel
                              </Button>
                            </div>
                          )}

                          {/* Cancelled session recovery buttons */}
                          {(session.status === "CANCELLED_BY_TUTOR" ||
                            session.status === "CANCELLED_BY_STUDENT") && (
                            <div className="flex gap-1.5 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 justify-start px-2 text-[11px] text-sky-700 border-sky-200 hover:bg-sky-50"
                                disabled={settingStatusId === session.id}
                                onClick={() =>
                                  handleSetStatus(session.id, "SCHEDULED")
                                }
                              >
                                <CheckIcon className="h-3 w-3 mr-1" />
                                Restore
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 justify-start px-2 text-[11px]"
                                onClick={() => setEditingSession(session)}
                              >
                                <PencilIcon className="h-3 w-3 mr-1" />
                                Reschedule
                              </Button>
                            </div>
                          )}

                          {/* Navigation / edit / delete */}
                          <div className="pt-1 flex gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 flex-1 px-2 text-[11px]"
                              onClick={() => setDetailSession(session)}
                            >
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => setEditingSession(session)}
                            >
                              <PencilIcon className="h-3 w-3" />
                            </Button>
                            {session.ruleId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setEditingRecurring(session)}
                              >
                                <RepeatIcon className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px] text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
                              disabled={deletingId === session.id}
                              onClick={() => handleDeleteSession(session.id)}
                            >
                              <Trash2Icon className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm font-medium">Select a day</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Session details and actions will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
