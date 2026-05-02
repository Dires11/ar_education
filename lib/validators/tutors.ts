import { z } from "zod";

export const createTutorSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
  avatarPublicId: z.string().optional(),
  email: z.string().email("Invalid email"),
  phone: z.string().min(1, "Phone is required"),
  hourlyRate: z.string().min(1, "Hourly rate is required"),
  subjectIds: z.array(z.string()).min(1, "Select at least one subject"),
  notes: z.string().optional(),
});

export const updateTutorSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
  avatarPublicId: z.string().optional(),
  email: z.string().email("Invalid email"),
  phone: z.string().min(1, "Phone is required"),
  hourlyRate: z.string().min(1, "Hourly rate is required"),
  notes: z.string().optional(),
});

export type CreateTutorInput = z.infer<typeof createTutorSchema>;
export type UpdateTutorInput = z.infer<typeof updateTutorSchema>;
