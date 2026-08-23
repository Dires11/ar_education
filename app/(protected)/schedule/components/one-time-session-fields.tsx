"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  ClockIcon,
  DoorOpenIcon,
  StickyNoteIcon,
} from "lucide-react";
import type { EnrollmentMonthSummary } from "@/lib/services/sessions";
import type { CreateAdHocSessionInput } from "@/lib/validators/sessions";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/searchable-select";
import { cn } from "@/lib/utils";
import { ScheduleDatePickerButton } from "./schedule-date-picker-button";
import { SessionEnrollmentPicker } from "./session-enrollment-picker";
import type {
  SessionEnrollment,
  SessionGroup,
  Subject,
  Tutor,
} from "./session-form-types";

export function OneTimeSessionFields({
  form,
  tutors,
  subjects,
  enrollments,
  groups,
  adHocDate,
  setAdHocDate,
  adHocTime,
  setAdHocTime,
  monthSummary,
  adHocEnrollOpen,
  setAdHocEnrollOpen,
  adHocGroupId,
  hasAutoFilledScheduleContext,
  onSubmit,
}: {
  form: UseFormReturn<CreateAdHocSessionInput>;
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: SessionEnrollment[];
  groups: SessionGroup[];
  adHocDate: Date | undefined;
  setAdHocDate: (date: Date | undefined) => void;
  adHocTime: string;
  setAdHocTime: (time: string) => void;
  monthSummary: EnrollmentMonthSummary | null;
  adHocEnrollOpen: boolean;
  setAdHocEnrollOpen: (open: boolean) => void;
  adHocGroupId: string | undefined;
  hasAutoFilledScheduleContext: boolean;
  onSubmit: (values: CreateAdHocSessionInput) => void | Promise<void>;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <FormField
          control={form.control}
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
                <SessionEnrollmentPicker
                  open={adHocEnrollOpen}
                  onOpenChange={setAdHocEnrollOpen}
                  enrollmentId={field.value ?? ""}
                  groupId={adHocGroupId ?? ""}
                  enrollments={enrollments}
                  groups={groups}
                  emptyEnrollmentLabel="No enrollment"
                  emptyEnrollmentValue="none"
                  onClear={() => {
                    field.onChange("");
                    form.setValue("groupId", "");
                    setAdHocEnrollOpen(false);
                  }}
                  onSelectEnrollment={(enrollment) => {
                    field.onChange(enrollment.id);
                    form.setValue("groupId", "");
                    form.setValue("tutorId", enrollment.tutorId);
                    form.setValue("subjectId", enrollment.subjectId);
                    form.setValue("studentIds", [enrollment.studentId]);
                    setAdHocEnrollOpen(false);
                  }}
                  onSelectGroup={(group) => {
                    form.setValue("groupId", group.id);
                    field.onChange("");
                    form.setValue("tutorId", group.tutorId);
                    form.setValue("subjectId", group.subjectId);
                    form.setValue("studentIds", []);
                    setAdHocEnrollOpen(false);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!hasAutoFilledScheduleContext && (
          <div className="grid grid-cols-2 gap-2.5">
            <FormField
              control={form.control}
              name="tutorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tutor</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={tutors.map((tutor) => ({
                        value: tutor.id,
                        label: tutor.name,
                      }))}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Select tutor"
                      emptyText="No tutors found."
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
                  <FormLabel>Subject</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="scheduledFor"
          render={() => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <ScheduleDatePickerButton
                  date={adHocDate}
                  onSelect={setAdHocDate}
                  placeholder="Pick a date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium leading-none">Time</label>
            <Input
              type="time"
              value={adHocTime}
              onChange={(event) => setAdHocTime(event.target.value)}
            />
          </div>
          <FormField
            control={form.control}
            name="durationMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Duration
                </FormLabel>
                <FormControl>
                  <Input type="number" min="15" step="15" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {monthSummary && monthSummary.sessionsPerWeek !== null && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              monthSummary.isOverLimit
                ? "border-red-200 bg-red-50 text-red-700"
                : monthSummary.remaining === 1
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-teal-200 bg-teal-50 text-teal-700",
            )}
          >
            <span className="font-medium">{monthSummary.periodLabel}</span>
            <span className="text-muted-foreground">·</span>
            <span>
              {monthSummary.totalPlanned}/{monthSummary.sessionsPerWeek}{" "}
              sessions planned
            </span>
            <span className="ml-auto font-semibold">
              {monthSummary.isOverLimit
                ? "Package limit reached"
                : `${monthSummary.remaining} remaining`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          <FormField
            control={form.control}
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

        <FormField
          control={form.control}
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
            form.formState.isSubmitting || monthSummary?.isOverLimit === true
          }
          className="w-full"
        >
          {form.formState.isSubmitting ? "Creating..." : "Create Session"}
        </Button>
      </form>
    </Form>
  );
}
