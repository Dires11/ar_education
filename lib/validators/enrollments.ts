import { z } from "zod";
import {
  dateSchema,
  idSchema,
  optionalDateSchema,
  optionalIdSchema,
  optionalPositiveMoneySchema,
  positiveIntegerStringSchema,
  positiveMoneySchema,
} from "@/lib/validators/common";

export const createEnrollmentSchema = z
  .object({
    studentId: idSchema,
    packageId: idSchema,
    tutorId: idSchema,
    subjectId: idSchema,
    startDate: dateSchema,
    endDate: optionalDateSchema,
    customPriceOverride: optionalPositiveMoneySchema,
    groupId: optionalIdSchema,
    newGroupName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((data) => !(data.groupId && data.newGroupName), {
    message: "Choose an existing group or create a new one",
    path: ["groupId"],
  });

export const updateEnrollmentSchema = z
  .object({
    endDate: optionalDateSchema,
    status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
    customPriceOverride: optionalPositiveMoneySchema,
  });

export const createDiscountSchema = z
  .object({
    kind: z.enum([
      "PERCENT_OFF",
      "FIXED_OFF",
      "FREE_SESSIONS",
      "FREE_MONTH",
      "REDUCED_RATE",
    ]),
    value: positiveMoneySchema,
    temporary: z.boolean(),
    validFrom: optionalDateSchema,
    validUntil: optionalDateSchema,
    usesRemaining: z
      .union([positiveIntegerStringSchema, z.literal("")])
      .optional(),
    notes: z.string().trim().max(1_000).optional(),
  })
  .refine(
    (data) => data.kind !== "PERCENT_OFF" || Number(data.value) <= 100,
    { message: "Percentage cannot exceed 100", path: ["value"] },
  )
  .refine(
    (data) => !data.validFrom || !data.validUntil || data.validUntil >= data.validFrom,
    { message: "Valid until must be on or after valid from", path: ["validUntil"] },
  );

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
