import { z } from "zod";
import {
  dateSchema,
  idSchema,
  monthSchema,
  optionalIdSchema,
  positiveMoneySchema,
} from "@/lib/validators/common";

export const createPaymentSchema = z.object({
  studentId: idSchema,
  amount: positiveMoneySchema,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  paidAt: dateSchema,
  enrollmentId: optionalIdSchema,
  coversMonth: z.union([monthSchema, z.literal("")]).optional(),
  notes: z.string().trim().max(2_000).optional(),
}).refine((data) => !data.coversMonth || Boolean(data.enrollmentId), {
  message: "An enrollment is required when assigning a billing month",
  path: ["enrollmentId"],
});

export const markPaymentPaidSchema = z.object({
  enrollmentId: idSchema,
  studentId: idSchema,
  amount: positiveMoneySchema,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
  month: monthSchema,
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
