import { z } from "zod";
import {
  idSchema,
  isoDateTimeSchema,
  optionalIdSchema,
  positiveIntegerStringSchema,
  timeSchema,
} from "@/lib/validators/common";

export const createAdHocSessionSchema = z
  .object({
    enrollmentId: optionalIdSchema,
    groupId: optionalIdSchema,
    tutorId: idSchema,
    subjectId: idSchema,
    scheduledFor: isoDateTimeSchema,
    durationMinutes: positiveIntegerStringSchema.refine(
      (value) => Number(value) <= 480,
      "Duration cannot exceed 8 hours",
    ),
    room: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2_000).optional(),
    studentIds: z.array(idSchema).max(100),
  })
  .refine((data) => !(data.enrollmentId && data.groupId), {
    message: "Choose either an enrollment or a group",
    path: ["groupId"],
  });

export const createRecurrenceSchema = z
  .object({
    enrollmentId: optionalIdSchema,
    groupId: optionalIdSchema,
    daysOfWeek: z
      .array(z.enum(["0", "1", "2", "3", "4", "5", "6"]))
      .min(1, "Select at least one day")
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Duplicate weekday"),
    startTime: timeSchema,
    startTimes: z
      .partialRecord(
        z.enum(["0", "1", "2", "3", "4", "5", "6"]),
        timeSchema,
      )
      .optional(),
    durationMinutes: positiveIntegerStringSchema.refine(
      (value) => Number(value) <= 480,
      "Duration cannot exceed 8 hours",
    ),
    intervalWeeks: positiveIntegerStringSchema
      .refine((value) => Number(value) <= 52, "Interval cannot exceed 52 weeks")
      .optional(),
    room: z.string().trim().max(100).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    startsOn: z.iso.date(),
    endsOn: z.union([z.iso.date(), z.literal("")]).optional(),
  })
  .refine((data) => Boolean(data.enrollmentId) !== Boolean(data.groupId), {
    message: "Enrollment or group is required",
    path: ["enrollmentId"],
  })
  .refine((data) => !data.endsOn || data.endsOn >= data.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export const markAttendanceSchema = z.object({
  attendances: z.array(
    z.object({
      studentId: idSchema,
      status: z.enum([
        "SCHEDULED",
        "COMPLETED",
        "NO_SHOW",
        "CANCELLED_BY_TUTOR",
        "CANCELLED_BY_STUDENT",
      ]),
      billable: z.boolean(),
    })
  ).min(1, "At least one attendance record is required"),
});

export const updateSessionSchema = z
  .object({
    scheduledFor: isoDateTimeSchema.optional(),
    durationMinutes: z.number().int().positive().max(480).optional(),
    room: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "No changes provided",
  });

export const splitRecurrenceSchema = z.object({
  ruleId: idSchema,
  splitDate: isoDateTimeSchema,
  params: z.object({
    startTime: timeSchema.optional(),
    durationMinutes: z.number().int().positive().max(480).optional(),
    room: z.string().trim().max(100).nullable().optional(),
    intervalWeeks: z.number().int().positive().max(52).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
  }),
});

export const recurrenceOccurrenceSchema = z.object({
  ruleId: idSchema,
  occurrenceFor: isoDateTimeSchema,
});

export const rescheduleOccurrenceSchema = recurrenceOccurrenceSchema.extend({
  newScheduledFor: isoDateTimeSchema,
  overrides: z.object({
    durationMinutes: z.number().int().positive().max(480).optional(),
    room: z.string().trim().max(100).nullable().optional(),
  }),
});

export type CreateAdHocSessionInput = z.infer<typeof createAdHocSessionSchema>;
export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
