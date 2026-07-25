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
import {
  splitRecurrenceRuleAction,
  endRecurrenceRuleAction,
  deleteRecurrenceRuleAction,
  updateEnrollmentRecurrenceColorAction,
} from "@/app/actions/sessions";
import { ColorPicker } from "./color-picker";

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

type ConfirmKind = "end" | "deleteAll" | null;

export function EditRecurringGroupDialog({
  rules,
  subjectName,
  referenceDate,
  focusedRuleId,
  enrollmentId,
  open,
  onOpenChange,
  onChanged,
}: {
  rules: GroupRule[];
  subjectName: string;
  referenceDate?: string;
  focusedRuleId?: string;
  enrollmentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  // Sort rules Mon→Sun
  const sortedRules = [...rules].sort((a, b) => {
    const idxA = DAY_OPTIONS.indexOf(a.dayOfWeek);
    const idxB = DAY_OPTIONS.indexOf(b.dayOfWeek);
    return (idxA < 0 ? 99 : idxA) - (idxB < 0 ? 99 : idxB);
  });

  const firstRule = sortedRules[0];

  // ── Per-rule editable params ───────────────────────────────────────
  const [perRuleDays, setPerRuleDays] = useState<Record<string, string>>(
    Object.fromEntries(rules.map((r) => [r.id, String(r.dayOfWeek)]))
  );
  const [perRuleTimes, setPerRuleTimes] = useState<Record<string, string>>(
    Object.fromEntries(rules.map((r) => [r.id, r.startTime]))
  );

  // ── Shared params ──────────────────────────────────────────────────
  const [seriesDuration, setSeriesDuration] = useState(String(firstRule?.durationMinutes ?? 60));
  const [seriesInterval, setSeriesInterval] = useState(String(firstRule?.intervalWeeks ?? 1));
  const [seriesRoom, setSeriesRoom] = useState(firstRule?.room ?? "");
  const [color, setColor] = useState(firstRule?.color ?? "");

  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const splitDate = referenceDate ? new Date(referenceDate) : new Date();
  const splitDateLabel = format(splitDate, "MMM d");

  const daysSummary = sortedRules.map((r) => DAY_LABELS[r.dayOfWeek]).join(", ");

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        rules.map((r) =>
          splitRecurrenceRuleAction(r.id, splitDate.toISOString(), {
            startTime: perRuleTimes[r.id] ?? r.startTime,
            durationMinutes: Number(seriesDuration),
            room: seriesRoom || null,
            intervalWeeks: Number(seriesInterval),
            dayOfWeek: Number(perRuleDays[r.id] ?? r.dayOfWeek),
          })
        )
      );
      if (color && enrollmentId) {
        await updateEnrollmentRecurrenceColorAction(enrollmentId, color);
      }
      toast.success(
        rules.length > 1 ? `Schedule updated for ${daysSummary}` : "Recurring schedule updated"
      );
      onChanged?.();
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
      onChanged?.();
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
      onChanged?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
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
              </div>
              <p className="text-xs text-muted-foreground">
                {confirm === "end" &&
                  `All sessions (${daysSummary}) from ${splitDateLabel} forward will stop.`}
                {confirm === "deleteAll" &&
                  `All upcoming sessions for ${daysSummary} will be removed. Past sessions remain.`}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirm(null)} disabled={saving}>
                  Go back
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={confirm === "end" ? handleEnd : handleDeleteAll}
                >
                  {saving ? "..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}

          {!confirm && (
            <>
              {/* Per-rule: day + time */}
              <div className="space-y-2">
                {rules.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Changes apply from <span className="font-medium">{splitDateLabel}</span> onward.
                  </p>
                )}
                <div className="space-y-2">
                  {sortedRules.map((r) => {
                    const isFocused = r.id === focusedRuleId;
                    return (
                      <div
                        key={r.id}
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md p-1.5 -mx-1.5 ${isFocused ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                      >
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Day</Label>
                          <Select
                            value={perRuleDays[r.id] ?? String(r.dayOfWeek)}
                            onValueChange={(v) =>
                              setPerRuleDays((prev) => ({ ...prev, [r.id]: v }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAY_OPTIONS.map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  {DAY_LABELS[d]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Start time</Label>
                          <Input
                            type="time"
                            className="h-8 text-xs"
                            value={perRuleTimes[r.id] ?? r.startTime}
                            onChange={(e) =>
                              setPerRuleTimes((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shared: duration + interval */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min="15"
                    step="15"
                    value={seriesDuration}
                    onChange={(e) => setSeriesDuration(e.target.value)}
                  />
                </div>
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
              </div>

              {/* Room */}
              <div className="space-y-1.5">
                <Label>Room</Label>
                <Input
                  value={seriesRoom}
                  onChange={(e) => setSeriesRoom(e.target.value)}
                  placeholder="e.g. Room 1"
                />
              </div>

              {/* Color */}
              {enrollmentId && (
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <ColorPicker value={color} onChange={setColor} />
                </div>
              )}

              <Button className="w-full" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : referenceDate ? `Apply from ${splitDateLabel} onward` : "Save changes"}
              </Button>

              <Separator />

              {/* Destructive options */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Other options
                </p>
                <div className="flex flex-col gap-1.5">
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
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
