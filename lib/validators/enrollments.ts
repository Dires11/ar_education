import { z } from "zod";

export const createEnrollmentSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  packageId: z.string().min(1, "Package is required"),
  tutorId: z.string().min(1, "Tutor is required"),
  subjectId: z.string().min(1, "Subject is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  customPriceOverride: z.string().optional(),
});

export const updateEnrollmentSchema = z.object({
  endDate: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
  customPriceOverride: z.string().optional(),
});

export const createDiscountSchema = z.object({
  kind: z.enum([
    "PERCENT_OFF",
    "FIXED_OFF",
    "FREE_SESSIONS",
    "FREE_MONTH",
    "REDUCED_RATE",
  ]),
  value: z.string().min(1, "Value is required"),
  temporary: z.boolean(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  usesRemaining: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
