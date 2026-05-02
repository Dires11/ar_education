"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { RepeatIcon, AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  splitRecurrenceRuleAction,
  endRecurrenceRuleAction,
  deleteRecurrenceRuleAction,
  updateEnrollmentRecurrenceColorAction,
} from "@/app/actions/sessions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun display order

export type GroupRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  intervalWeeks: number;
  room: string | null;
  color: string | null;
};

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

type ConfirmKind = "end" | "deleteAll" | "endDay" | "deleteDay" | null;

export function EditRecurringGroupDialog({
  rules,
  subjectName,
  referenceDate,
  focusedRuleId,
  enrollmentId,
  open,
  onOpenChange,
}: {
  rules: GroupRule[];
  subjectName: string;
  /** ISO date of the specific occurrence clicked (only when opened from calendar) */
  referenceDate?: string;
  /** Which rule was clicked (only when opened from calendar) */
  focusedRuleId?: string;
  enrollmentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const focusedRule = rules.find((r) => r.id === focusedRuleId) ?? rules[0];
  const isFromCalendar = !!referenceDate && !!focusedRuleId;
  const isGroup = rules.length > 1;
  const showDayTab = isFromCalendar && isGroup;

  // ── Edit Series state (all rules) ─────────────────────────────────
  const [seriesTime, setSeriesTime] = useState(focusedRule?.startTime ?? "09:00");
  const [seriesDuration, setSeriesDuration] = useState(String(focusedRule?.durationMinutes ?? 60));
  const [seriesInterval, setSeriesInterval] = useState(String(focusedRule?.intervalWeeks ?? 1));
  const [seriesRoom, setSeriesRoom] = useState(focusedRule?.room ?? "");

  // ── Edit This Day state (focused rule only) ────────────────────────
  const [dayTime, setDayTime] = useState(focusedRule?.startTime ?? "09:00");
  const [dayDuration, setDayDuration] = useState(String(focusedRule?.durationMinutes ?? 60));
  const [dayInterval, setDayInterval] = useState(String(focusedRule?.intervalWeeks ?? 1));
  const [dayRoom, setDayRoom] = useState(focusedRule?.room ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(String(focusedRule?.dayOfWeek ?? 1));

  // ── Color state ────────────────────────────────────────────────────
  const [color, setColor] = useState(focusedRule?.color ?? "");

  const [tab, setTab] = useState<"series" | "day">("series");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const splitDate = referenceDate ? new Date(referenceDate) : new Date();
  const splitDateLabel = format(splitDate, "MMM d");
  const daysSummary = [...rules]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((r) => DAY_LABELS[r.dayOfWeek])
    .join(", ");
  const focusedDayLabel = focusedRule ? DAY_LABELS[focusedRule.dayOfWeek] : "this day";

  async function handleSaveSeries() {
    setSaving(true);
    try {
      await Promise.all(
        rules.map((r) =>
          splitRecurrenceRuleAction(r.id, splitDate.toISOString(), {
            startTime: seriesTime,
            durationMinutes: Number(seriesDuration),
            room: seriesRoom || null,
            intervalWeeks: Number(seriesInterval),
          })
        )
      );
      if (color && enrollmentId) {
        await updateEnrollmentRecurrenceColorAction(enrollmentId, color);
      }
      toast.success(isGroup ? `Schedule updated for ${daysSummary}` : "Recurring schedule updated");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDay() {
    if (!focusedRule) return;
    setSaving(true);
    try {
      await splitRecurrenceRuleAction(focusedRule.id, splitDate.toISOString(), {
        startTime: dayTime,
        durationMinutes: Number(dayDuration),
        room: dayRoom || null,
        intervalWeeks: Number(dayInterval),
        dayOfWeek: Number(dayOfWeek),
      });
      if (color && enrollmentId) {
        await updateEnrollmentRecurrenceColorAction(enrollmentId, color);
      }
      toast.success(`${DAY_LABELS[focusedRule.dayOfWeek]} schedule updated`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd() {
    setSaving(true);
    try {
      await Promise.all(rules.map((r) => endRecurrenceRuleAction(r.id, splitDate.toISOString())));
      toast.success("Recurring schedule ended");
      setConfirm(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to end recurrence");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAll() {
    setSaving(true);
    try {
      await Promise.all(rules.map((r) => deleteRecurrenceRuleAction(r.id)));
      toast.success("Recurring schedule deleted");
      setConfirm(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  async function handleEndDay() {
    if (!focusedRule) return;
    setSaving(true);
    try {
      await endRecurrenceRuleAction(focusedRule.id, splitDate.toISOString());
      toast.success(`${focusedDayLabel} schedule ended`);
      setConfirm(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to end recurrence");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDay() {
    if (!focusedRule) return;
    setSaving(true);
    try {
      await deleteRecurrenceRuleAction(focusedRule.id);
      toast.success(`${focusedDayLabel} recurrence rule deleted`);
      setConfirm(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  const confirmHandlers: Record<NonNullable<ConfirmKind>, () => void> = {
    end: handleEnd,
    deleteAll: handleDeleteAll,
    endDay: handleEndDay,
    deleteDay: handleDeleteDay,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RepeatIcon className="h-4 w-4" />
            Edit Recurring Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Summary */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{subjectName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Every {daysSummary}
              {focusedRule && focusedRule.intervalWeeks > 1 ? ` · every ${focusedRule.intervalWeeks} weeks` : ""}
              {referenceDate && ` · ${format(new Date(referenceDate), "EEEE, MMMM d, yyyy")}`}
            </div>
          </div>

          {/* Confirm destructive */}
          {confirm && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                {confirm === "end" && `End schedule from ${splitDateLabel}?`}
                {confirm === "deleteAll" && "Delete the entire recurring schedule?"}
                {confirm === "endDay" && `End ${focusedDayLabel} schedule from ${splitDateLabel}?`}
                {confirm === "deleteDay" && `Delete ${focusedDayLabel} recurrence rule?`}
              </div>
              <p className="text-xs text-muted-foreground">
                {confirm === "end" &&
                  `All sessions (${daysSummary}) from ${splitDateLabel} forward will stop.`}
                {confirm === "deleteAll" &&
                  `All upcoming sessions for ${daysSummary} will be removed. Past sessions remain.`}
                {confirm === "endDay" &&
                  `${focusedDayLabel} sessions from ${splitDateLabel} forward will stop. Other days (${[...rules].filter((r) => r.id !== focusedRule?.id).map((r) => DAY_LABELS[r.dayOfWeek]).join(", ")}) continue unchanged.`}
                {confirm === "deleteDay" &&
                  `All upcoming ${focusedDayLabel} sessions will be removed. Other days (${[...rules].filter((r) => r.id !== focusedRule?.id).map((r) => DAY_LABELS[r.dayOfWeek]).join(", ")}) continue unchanged.`}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirm(null)} disabled={saving}>
                  Go back
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={confirmHandlers[confirm]}
                >
                  {saving ? "..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}

          {!confirm && (
            <>
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as "series" | "day")}
              >
                <TabsList className={cn("grid w-full", showDayTab ? "grid-cols-2" : "grid-cols-1")}>
                  <TabsTrigger value="series">
                    {isGroup ? "Edit All Days" : "Edit Series"}
                  </TabsTrigger>
                  {showDayTab && (
                    <TabsTrigger value="day">
                      Edit {focusedRule ? DAY_LABELS[focusedRule.dayOfWeek] : "This Day"} Only
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* ── Edit all rules ── */}
                <TabsContent value="series" className="space-y-3 pt-2">
                  {isGroup ? (
                    <p className="text-xs text-muted-foreground">
                      Changes apply to all days ({daysSummary}) from{" "}
                      <span className="font-medium">{splitDateLabel}</span> onward.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Changes apply from <span className="font-medium">{splitDateLabel}</span> onward.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Time</Label>
                      <Input type="time" value={seriesTime} onChange={(e) => setSeriesTime(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duration (min)</Label>
                      <Input type="number" min="15" step="15" value={seriesDuration} onChange={(e) => setSeriesDuration(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Every</Label>
                      <Select value={seriesInterval} onValueChange={setSeriesInterval}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 week</SelectItem>
                          <SelectItem value="2">2 weeks</SelectItem>
                          <SelectItem value="3">3 weeks</SelectItem>
                          <SelectItem value="4">4 weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Room</Label>
                      <Input value={seriesRoom} onChange={(e) => setSeriesRoom(e.target.value)} placeholder="e.g. Room 1" />
                    </div>
                  </div>
                  {enrollmentId && (
                    <div className="space-y-1.5">
                      <Label>Color</Label>
                      <ColorPicker value={color} onChange={setColor} />
                    </div>
                  )}
                  <Button className="w-full" disabled={saving} onClick={handleSaveSeries}>
                    {saving ? "Saving..." : referenceDate ? `Apply from ${splitDateLabel} onward` : "Save changes"}
                  </Button>
                </TabsContent>

                {/* ── Edit this day's pattern only ── */}
                {showDayTab && (
                  <TabsContent value="day" className="space-y-3 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Only the{" "}
                      <span className="font-medium">
                        {focusedRule ? DAY_LABELS[focusedRule.dayOfWeek] : ""}
                      </span>{" "}
                      recurrence rule changes. Other days are unchanged.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Day</Label>
                        <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DAY_OPTIONS.map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {DAY_LABELS[d]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Time</Label>
                        <Input type="time" value={dayTime} onChange={(e) => setDayTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Duration (min)</Label>
                        <Input type="number" min="15" step="15" value={dayDuration} onChange={(e) => setDayDuration(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Every</Label>
                        <Select value={dayInterval} onValueChange={setDayInterval}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 week</SelectItem>
                            <SelectItem value="2">2 weeks</SelectItem>
                            <SelectItem value="3">3 weeks</SelectItem>
                            <SelectItem value="4">4 weeks</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Room</Label>
                      <Input value={dayRoom} onChange={(e) => setDayRoom(e.target.value)} placeholder="e.g. Room 1" />
                    </div>
                    {enrollmentId && (
                      <div className="space-y-1.5">
                        <Label>Color</Label>
                        <ColorPicker value={color} onChange={setColor} />
                      </div>
                    )}
                    <Button className="w-full" disabled={saving} onClick={handleSaveDay}>
                      {saving ? "Saving..." : `Apply from ${splitDateLabel} onward`}
                    </Button>
                  </TabsContent>
                )}
              </Tabs>

              <Separator />

              {/* Destructive options — scope depends on active tab */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tab === "day" ? `${focusedDayLabel} only` : "Other options"}
                </p>
                <div className="flex flex-col gap-1.5">
                  {tab === "series" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                        onClick={() => setConfirm("end")}
                      >
                        End schedule{referenceDate ? ` from ${splitDateLabel}` : ""}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
                        onClick={() => setConfirm("deleteAll")}
                      >
                        Delete entire recurring schedule
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                        onClick={() => setConfirm("endDay")}
                      >
                        End {focusedDayLabel} schedule{referenceDate ? ` from ${splitDateLabel}` : ""}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
                        onClick={() => setConfirm("deleteDay")}
                      >
                        Delete {focusedDayLabel} recurrence rule
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
