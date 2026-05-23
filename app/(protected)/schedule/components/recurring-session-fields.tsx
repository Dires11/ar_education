"use client";

import type { Dispatch, SetStateAction } from "react";
import { format, endOfMonth } from "date-fns";
import type { UseFormReturn } from "react-hook-form";
import {
  AlertTriangleIcon,
  ClockIcon,
  DoorOpenIcon,
  XIcon,
} from "lucide-react";
import type { CreateRecurrenceInput } from "@/lib/validators/sessions";
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
import { cn } from "@/lib/utils";
import { ColorPicker } from "./color-picker";
import { ScheduleDatePickerButton } from "./schedule-date-picker-button";
import { SessionEnrollmentPicker } from "./session-enrollment-picker";
import type {
  ActiveEnrollmentRule,
  ActiveGroupRule,
  SessionEnrollment,
  SessionGroup,
} from "./session-form-types";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VALUES = ["1", "2", "3", "4", "5", "6", "0"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurringSessionFields({
  form,
  enrollments,
  groups,
  recurEnrollOpen,
  setRecurEnrollOpen,
  recurringGroupId,
  recurringDaysOfWeek,
  recurringStartTime,
  recurStartDate,
  setRecurStartDate,
  recurEndDate,
  setRecurEndDate,
  perDayTimes,
  setPerDayTimes,
  touchedDays,
  setTouchedDays,
  recurringColor,
  setRecurringColor,
  packageLimit,
  groupPackageLimit,
  daysOverLimit,
  recurringExceedsLimit,
  activeRules,
  activeGroupRules,
  setEditingGroupOpen,
  onSubmit,
}: {
  form: UseFormReturn<CreateRecurrenceInput>;
  enrollments: SessionEnrollment[];
  groups: SessionGroup[];
  recurEnrollOpen: boolean;
  setRecurEnrollOpen: (open: boolean) => void;
  recurringGroupId: string | undefined;
  recurringDaysOfWeek: string[];
  recurringStartTime: string;
  recurStartDate: Date | undefined;
  setRecurStartDate: (date: Date | undefined) => void;
  recurEndDate: Date | undefined;
  setRecurEndDate: (date: Date | undefined) => void;
  perDayTimes: Record<string, string>;
  setPerDayTimes: Dispatch<SetStateAction<Record<string, string>>>;
  touchedDays: Set<string>;
  setTouchedDays: Dispatch<SetStateAction<Set<string>>>;
  recurringColor: string;
  setRecurringColor: (color: string) => void;
  packageLimit: number | null | undefined;
  groupPackageLimit: number | null | undefined;
  daysOverLimit: boolean;
  recurringExceedsLimit: boolean;
  activeRules: ActiveEnrollmentRule[];
  activeGroupRules: ActiveGroupRule[];
  setEditingGroupOpen: (open: boolean) => void;
  onSubmit: (values: CreateRecurrenceInput) => void | Promise<void>;
}) {
  const hasExistingRecurring = activeRules.length > 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <FormField
          control={form.control}
          name="enrollmentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enrollment</FormLabel>
              <FormControl>
                <SessionEnrollmentPicker
                  open={recurEnrollOpen}
                  onOpenChange={setRecurEnrollOpen}
                  enrollmentId={field.value ?? ""}
                  groupId={recurringGroupId ?? ""}
                  enrollments={enrollments}
                  groups={groups}
                  emptyEnrollmentLabel="No selection"
                  emptyEnrollmentValue="clear"
                  emptyEnrollmentMuted
                  onClear={() => {
                    field.onChange("");
                    form.setValue("groupId", "");
                    setRecurEnrollOpen(false);
                  }}
                  onSelectEnrollment={(enrollment) => {
                    field.onChange(enrollment.id);
                    form.setValue("groupId", "");
                    setRecurEnrollOpen(false);
                  }}
                  onSelectGroup={(group) => {
                    form.setValue("groupId", group.id);
                    field.onChange("");
                    setRecurEnrollOpen(false);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {hasExistingRecurring && (
          <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
            <div className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {packageLimit !== null && activeRules.length >= packageLimit
                    ? "Package limit reached"
                    : "Existing recurring schedule"}
                </p>
                <p className="mt-0.5 text-orange-800">
                  {activeRules.map((rule, index) => (
                    <span key={rule.id}>
                      {index > 0 && ", "}
                      <span className="font-semibold">
                        {DAY_NAMES[rule.dayOfWeek]} at {rule.startTime}
                      </span>
                    </span>
                  ))}
                  {packageLimit !== null && (
                    <span className="ml-1">
                      ({activeRules.length}/{packageLimit} days/week used)
                    </span>
                  )}
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

        <FormField
          control={form.control}
          name="daysOfWeek"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Days</FormLabel>
              <FormControl>
                <div className="flex gap-1.5">
                  {DAYS.map((letter, index) => {
                    const value = DAY_VALUES[index];
                    const isSelected = field.value.includes(value);
                    return (
                      <button
                        key={index}
                        type="button"
                        title={DAY_LABELS[index]}
                        onClick={() => {
                          const next = isSelected
                            ? field.value.filter((day) => day !== value)
                            : [...field.value, value];
                          field.onChange(next);
                        }}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
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

        <div
          className={cn(
            recurringDaysOfWeek.length > 1
              ? "space-y-1.5 rounded-xl border bg-muted/20 p-2.5"
              : "space-y-0",
          )}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <FormField
              control={form.control}
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
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <FormControl>
                    <Input type="number" min="15" step="15" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="intervalWeeks"
              render={({ field }) => (
                <FormItem className="col-span-2 sm:col-span-1">
                  <FormLabel>Every</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? "1"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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

          {recurringDaysOfWeek.length > 1 && (
            <div className="border-t pt-1.5">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Adjust per-day start times
              </p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
                {[...recurringDaysOfWeek]
                  .sort((a, b) => DAY_VALUES.indexOf(a) - DAY_VALUES.indexOf(b))
                  .map((dayValue) => {
                    const index = DAY_VALUES.indexOf(dayValue);
                    const isLinked = !touchedDays.has(dayValue);
                    return (
                      <div key={dayValue} className="flex items-center gap-1.5">
                        <span className="w-7 shrink-0 text-xs font-medium text-muted-foreground">
                          {index >= 0 ? DAY_LABELS[index] : dayValue}
                        </span>
                        <Input
                          type="time"
                          className={cn(
                            "h-8 text-xs",
                            isLinked && "text-muted-foreground",
                          )}
                          value={perDayTimes[dayValue] ?? recurringStartTime}
                          onChange={(event) => {
                            setTouchedDays(
                              (prev) => new Set([...prev, dayValue]),
                            );
                            setPerDayTimes((prev) => ({
                              ...prev,
                              [dayValue]: event.target.value,
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <FormField
            control={form.control}
            name="startsOn"
            render={() => (
              <FormItem>
                <div className="flex min-h-5 items-center">
                  <FormLabel>Starts On</FormLabel>
                </div>
                <FormControl>
                  <ScheduleDatePickerButton
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
            control={form.control}
            name="endsOn"
            render={() => (
              <FormItem>
                <div className="flex min-h-5 items-center justify-between gap-2">
                  <FormLabel className="whitespace-nowrap">
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
                  <ScheduleDatePickerButton
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

        {daysOverLimit && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                You selected{" "}
                <span className="font-semibold">
                  {recurringDaysOfWeek.length} days/week
                </span>{" "}
                but the package only allows{" "}
                <span className="font-semibold">
                  {packageLimit} day{packageLimit !== 1 ? "s" : ""}/week
                </span>.
                {recurEndDate
                  ? " This schedule will stop on the selected end date, so it stays temporary."
                  : " Keep the weekly schedule within the package limit, or make this extra schedule temporary."}
              </p>
            </div>
            {!recurEndDate && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-300 bg-white/70 px-2 text-[11px] text-amber-900 hover:bg-white"
                  onClick={() => {
                    const current = form.getValues("daysOfWeek");
                    form.setValue("daysOfWeek", current.slice(0, packageLimit!));
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
                  Make temporary through {format(endOfMonth(recurStartDate ?? new Date()), "MMM d")}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 items-start gap-2.5">
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

          <div className="space-y-1.5">
            <span className="block text-sm font-medium leading-none">Color</span>
            <ColorPicker value={recurringColor} onChange={setRecurringColor} />
          </div>
        </div>

        <Button
          type="submit"
          disabled={
            form.formState.isSubmitting ||
            (!recurringGroupId && recurringExceedsLimit) ||
            (!recurringGroupId && packageLimit !== null && activeRules.length >= packageLimit) ||
            (!!recurringGroupId && groupPackageLimit !== null && activeGroupRules.length >= groupPackageLimit)
          }
          className="w-full"
        >
          {form.formState.isSubmitting
            ? "Creating..."
            : "Create Recurring Schedule"}
        </Button>
      </form>
    </Form>
  );
}
