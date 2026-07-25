import { z } from "zod";
import {
  idSchema,
  positiveMoneySchema,
} from "@/lib/validators/common";

export const createTutorSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  avatarUrl: z.string().url("Invalid image URL").max(2_000).optional().or(z.literal("")),
  avatarPublicId: z.string().trim().max(255).optional(),
  email: z.string().trim().email("Invalid email").max(320),
  phone: z.string().trim().min(1, "Phone is required").max(50),
  hourlyRate: positiveMoneySchema,
  subjectIds: z.array(idSchema).min(1, "Select at least one subject").max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate subjects"),
  notes: z.string().trim().max(2_000).optional(),
});

export const updateTutorSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  avatarUrl: z.string().url("Invalid image URL").max(2_000).optional().or(z.literal("")),
  avatarPublicId: z.string().trim().max(255).optional(),
  email: z.string().trim().email("Invalid email").max(320),
  phone: z.string().trim().min(1, "Phone is required").max(50),
  hourlyRate: positiveMoneySchema,
  notes: z.string().trim().max(2_000).optional(),
});

export type CreateTutorInput = z.infer<typeof createTutorSchema>;
export type UpdateTutorInput = z.infer<typeof updateTutorSchema>;
