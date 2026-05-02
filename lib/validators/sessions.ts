import { z } from "zod";

export const createAdHocSessionSchema = z.object({
  enrollmentId: z.string().optional(),
  tutorId: z.string().min(1, "Tutor is required"),
  subjectId: z.string().min(1, "Subject is required"),
  scheduledFor: z.string().min(1, "Date & time is required"),
  durationMinutes: z.string().min(1, "Duration is required"),
  room: z.string().optional(),
  notes: z.string().optional(),
  studentIds: z.array(z.string()).min(1, "At least one student is required"),
});

export const createRecurrenceSchema = z.object({
  enrollmentId: z.string().min(1, "Enrollment is required"),
  daysOfWeek: z.array(z.string()).min(1, "Select at least one day"),
  startTime: z.string().min(1, "Time is required"),
  startTimes: z.record(z.string(), z.string()).optional(), // per-day overrides
  durationMinutes: z.string().min(1, "Duration is required"),
  intervalWeeks: z.string().optional(),
  room: z.string().optional(),
  color: z.string().optional(),
  startsOn: z.string().min(1, "Start date is required"),
  endsOn: z.string().optional(),
});

export const markAttendanceSchema = z.object({
  attendances: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum([
        "COMPLETED",
        "NO_SHOW",
        "CANCELLED_BY_TUTOR",
        "CANCELLED_BY_STUDENT",
      ]),
      billable: z.boolean(),
    })
  ),
});

export type CreateAdHocSessionInput = z.infer<typeof createAdHocSessionSchema>;
export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
