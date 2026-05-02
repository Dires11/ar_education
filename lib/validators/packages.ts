import { z } from "zod";

export const createPackageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["MONTHLY", "PER_SESSION"]),
  billingPeriod: z.enum(["MONTHLY", "THREE_MONTHS", "YEARLY"]).optional(),
  lessonType: z.enum(["PRIVATE", "GROUP"]),
  subjectId: z.string().optional(),
  basePrice: z.string().min(1, "Price is required"),
  sessionsPerWeek: z.string().optional(),
  durationMinutes: z.string().min(1, "Duration is required"),
});

export const updatePackageSchema = createPackageSchema;

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
