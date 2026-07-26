import { z } from "zod";
import { dateSchema } from "@/lib/validators/common";

export const guardianRelationshipValues = [
  "PARENT",
  "GUARDIAN",
  "OTHER",
] as const;

const guardianRelationshipSchema = z.enum(guardianRelationshipValues);

export const guardianSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  avatarUrl: z.string().url("Invalid image URL").max(2_000).optional().or(z.literal("")),
  avatarPublicId: z.string().trim().max(255).optional(),
  email: z.string().trim().email("Invalid email").max(320).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Phone is required").max(50),
  relationship: guardianRelationshipSchema.default("PARENT"),
  notes: z.string().trim().max(2_000).optional(),
  isPrimary: z.boolean().default(true),
});

export const createStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  avatarUrl: z.string().url("Invalid image URL").max(2_000).optional().or(z.literal("")),
  avatarPublicId: z.string().trim().max(255).optional(),
  dob: dateSchema,
  email: z.string().trim().email("Invalid email").max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  school: z.string().trim().max(200).optional(),
  gradeLevel: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2_000).optional(),
  guardian: guardianSchema.optional(),
});

export const updateStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  avatarUrl: z.string().url("Invalid image URL").max(2_000).optional().or(z.literal("")),
  avatarPublicId: z.string().trim().max(255).optional(),
  dob: dateSchema,
  email: z.string().trim().email("Invalid email").max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  school: z.string().trim().max(200).optional(),
  gradeLevel: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export type CreateStudentFormValues = z.input<typeof createStudentSchema>;
export type CreateStudentInput = z.output<typeof createStudentSchema>;
export type UpdateStudentFormValues = z.input<typeof updateStudentSchema>;
export type UpdateStudentInput = z.output<typeof updateStudentSchema>;
export type GuardianFormValues = z.input<typeof guardianSchema>;
export type GuardianInput = z.output<typeof guardianSchema>;
