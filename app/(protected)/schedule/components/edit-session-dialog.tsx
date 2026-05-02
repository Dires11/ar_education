"use client";

import { useState, useEffect } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { toast } from "sonner";
import { PencilIcon, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateSessionAction } from "@/app/actions/sessions";

type Session = {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  room: string | null;
  notes?: string | null;
};

export function EditSessionDialog({
  session,
  open,
  onOpenChange,
}: {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const scheduledDate = new Date(session.scheduledFor);

  const [date, setDate] = useState<Date | undefined>(scheduledDate);
  const [time, setTime] = useState(format(scheduledDate, "HH:mm"));
  const [duration, setDuration] = useState(String(session.durationMinutes));
  const [room, setRoom] = useState(session.room ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens with new session
  useEffect(() => {
    if (open) {
      const d = new Date(session.scheduledFor);
      setDate(d);
      setTime(format(d, "HH:mm"));
      setDuration(String(session.durationMinutes));
      setRoom(session.room ?? "");
      setNotes(session.notes ?? "");
    }
  }, [open, session]);

  async function handleSave() {
    if (!date) {
      toast.error("Select a date");
      return;
    }
    const [h, m] = time.split(":").map(Number);
    const combined = setMinutes(setHours(new Date(date), h), m);

    setSaving(true);
    try {
      await updateSessionAction(session.id, {
        scheduledFor: combined.toISOString(),
        durationMinutes: Number(duration),
        room: room || undefined,
        notes: notes || undefined,
      });
      toast.success("Session updated");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilIcon className="h-4 w-4" />
            Edit Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal text-sm",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                    {date ? format(date, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setCalOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration + Room */}
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Room 1"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
              placeholder="Session notes..."
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
