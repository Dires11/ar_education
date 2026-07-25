import { z } from "zod";
import {
  optionalIdSchema,
  positiveIntegerStringSchema,
  positiveMoneySchema,
} from "@/lib/validators/common";

export const createPackageSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(["MONTHLY", "PER_SESSION"]),
  billingPeriod: z.enum(["MONTHLY", "THREE_MONTHS", "YEARLY"]).optional(),
  lessonType: z.enum(["PRIVATE", "GROUP"]),
  subjectId: optionalIdSchema,
  basePrice: positiveMoneySchema,
  sessionsPerWeek: z
    .union([
      positiveIntegerStringSchema.refine(
        (value) => Number(value) <= 14,
        "Cannot exceed 14 sessions per week",
      ),
      z.literal(""),
    ])
    .optional(),
  durationMinutes: positiveIntegerStringSchema.refine(
    (value) => Number(value) <= 480,
    "Duration cannot exceed 8 hours",
  ),
}).refine(
  (data) => data.type !== "MONTHLY" || Boolean(data.sessionsPerWeek),
  {
    message: "Sessions per week is required for monthly packages",
    path: ["sessionsPerWeek"],
  },
);

export const updatePackageSchema = createPackageSchema;

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
