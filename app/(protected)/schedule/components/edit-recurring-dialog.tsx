"use client";

import { useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { toast } from "sonner";
import { RepeatIcon, AlertTriangleIcon, CalendarIcon } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  splitRecurrenceRuleAction,
  endRecurrenceRuleAction,
  cancelOccurrenceAction,
  deleteRecurrenceRuleAction,
  rescheduleOccurrenceAction,
  updateSessionAction,
} from "@/app/actions/sessions";

type VirtualSessionInfo = {
  ruleId: string;
  scheduledFor: string; // ISO
  durationMinutes: number;
  startTime: string;
  dayOfWeek: number;
  intervalWeeks: number;
  room: string | null;
  subject: { name: string };
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EditRecurringDialog({
  session,
  sessionId,
  open,
  onOpenChange,
}: {
  session: VirtualSessionInfo;
  sessionId?: string; // present when editing a real (materialized) session
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"series" | "once">("series");

  // Series edit state
  const [time, setTime] = useState(session.startTime);
  const [duration, setDuration] = useState(String(session.durationMinutes));
  const [room, setRoom] = useState(session.room ?? "");
  const [intervalWeeks, setIntervalWeeks] = useState(String(session.intervalWeeks));

  // Reschedule-once state
  const [reschedDate, setReschedDate] = useState<Date | undefined>(
    new Date(session.scheduledFor)
  );
  const [reschedTime, setReschedTime] = useState(
    format(new Date(session.scheduledFor), "HH:mm"),
  );
  const [reschedDuration, setReschedDuration] = useState(String(session.durationMinutes));
  const [reschedRoom, setReschedRoom] = useState(session.room ?? "");
  const [calOpen, setCalOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"skip" | "end" | "deleteAll" | null>(null);

  const date = new Date(session.scheduledFor);
  const dateLabel = format(date, "EEEE, MMMM d, yyyy");

  async function handleSplit() {
    setSaving(true);
    try {
      await splitRecurrenceRuleAction(session.ruleId, date.toISOString(), {
        startTime: time,
        durationMinutes: Number(duration),
        room: room || null,
        intervalWeeks: Number(intervalWeeks),
      });
      toast.success("Recurring schedule updated from this date");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleRescheduleOnce() {
    if (!reschedDate) {
      toast.error("Please pick a date");
      return;
    }
    setSaving(true);
    try {
      const [h, m] = reschedTime.split(":").map(Number);
      const newDate = setMinutes(setHours(new Date(reschedDate), h), m);
      if (sessionId) {
        // Real session — update it in place
        await updateSessionAction(sessionId, {
          scheduledFor: newDate.toISOString(),
          durationMinutes: Number(reschedDuration),
          room: reschedRoom || null,
        });
      } else {
        // Virtual session — materialize a rescheduled real session
        await rescheduleOccurrenceAction(
          session.ruleId,
          session.scheduledFor,
          newDate.toISOString(),
          {
            durationMinutes: Number(reschedDuration),
            room: reschedRoom || null,
          },
        );
      }
      toast.success("Session updated");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to reschedule");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await cancelOccurrenceAction(session.ruleId, date.toISOString());
      toast.success("Occurrence cancelled");
      setConfirm(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel occurrence");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd() {
    setSaving(true);
    try {
      await endRecurrenceRuleAction(session.ruleId, date.toISOString());
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
      await deleteRecurrenceRuleAction(session.ruleId);
      toast.success("Entire recurring schedule deleted");
      setConfirm(null);
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
            Edit Recurring Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{session.subject.name}</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              Every {DAY_LABELS[session.dayOfWeek]}
              {session.intervalWeeks > 1
                ? ` · every ${session.intervalWeeks} weeks`
                : ""}
              {" · "}{dateLabel}
            </div>
          </div>

          {/* Confirm destructive actions inline */}
          {confirm && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                {confirm === "skip" && "Cancel this occurrence?"}
                {confirm === "end" && `End recurring before ${dateLabel}?`}
                {confirm === "deleteAll" && "Delete the entire recurring schedule?"}
              </div>
              <p className="text-xs text-muted-foreground">
                {confirm === "skip" &&
                  "This creates a cancelled session for this specific day only. Other occurrences stay."}
                {confirm === "end" &&
                  "All sessions from this date forward will no longer be scheduled. Past sessions remain."}
                {confirm === "deleteAll" &&
                  "All upcoming virtual sessions for this rule will be removed. Past sessions remain."}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirm(null)}
                  disabled={saving}
                >
                  Go back
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={
                    confirm === "skip"
                      ? handleSkip
                      : confirm === "end"
                      ? handleEnd
                      : handleDeleteAll
                  }
                >
                  {saving ? "..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}

          {!confirm && (
            <>
              <Tabs value={tab} onValueChange={(v) => setTab(v as "series" | "once")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="series">Edit Series</TabsTrigger>
                  <TabsTrigger value="once">This Day Only</TabsTrigger>
                </TabsList>

                {/* ── Edit series from this date ── */}
                <TabsContent value="series" className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Changes apply from {format(date, "MMM d")} onward.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duration (min)</Label>
                      <Input
                        type="number"
                        min="15"
                        step="15"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Every</Label>
                      <Select value={intervalWeeks} onValueChange={setIntervalWeeks}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                      <Input
                        value={room}
                        onChange={(e) => setRoom(e.target.value)}
                        placeholder="e.g. Room 1"
                      />
                    </div>
                  </div>

                  <Button className="w-full" disabled={saving} onClick={handleSplit}>
                    {saving ? "Saving..." : `Apply from ${format(date, "MMM d")} onward`}
                  </Button>
                </TabsContent>

                {/* ── Reschedule just this occurrence ── */}
                <TabsContent value="once" className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Move only this occurrence to a different date/time. Other occurrences are unchanged.
                  </p>

                  <div className="space-y-1.5">
                    <Label>New Date</Label>
                    <Popover open={calOpen} onOpenChange={setCalOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start font-normal",
                            !reschedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {reschedDate
                            ? format(reschedDate, "MMM d, yyyy")
                            : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={reschedDate}
                          onSelect={(d) => {
                            setReschedDate(d);
                            setCalOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={reschedTime}
                        onChange={(e) => setReschedTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duration (min)</Label>
                      <Input
                        type="number"
                        min="15"
                        step="15"
                        value={reschedDuration}
                        onChange={(e) => setReschedDuration(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Room</Label>
                    <Input
                      value={reschedRoom}
                      onChange={(e) => setReschedRoom(e.target.value)}
                      placeholder="e.g. Room 1"
                    />
                  </div>

                  <Button
                    className="w-full"
                    disabled={saving || !reschedDate}
                    onClick={handleRescheduleOnce}
                  >
                    {saving ? "Saving..." : "Reschedule This Occurrence"}
                  </Button>
                </TabsContent>
              </Tabs>

              <Separator />

              {/* Destructive actions */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Other options
                </p>
                <div className="flex flex-col gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                    onClick={() => setConfirm("skip")}
                  >
                    Skip this occurrence only
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50"
                    onClick={() => setConfirm("end")}
                  >
                    End recurring from this date
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
