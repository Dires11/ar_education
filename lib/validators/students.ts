import { z } from "zod";

export const guardianRelationshipValues = [
  "PARENT",
  "GUARDIAN",
  "OTHER",
] as const;

const guardianRelationshipSchema = z.enum(guardianRelationshipValues);

export const guardianSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
  avatarPublicId: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().min(1, "Phone is required"),
  relationship: guardianRelationshipSchema.default("PARENT"),
  notes: z.string().optional(),
  isPrimary: z.boolean().default(true),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
  avatarPublicId: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  school: z.string().optional(),
  gradeLevel: z.string().optional(),
  notes: z.string().optional(),
  guardian: guardianSchema.optional(),
});

export const updateStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  avatarUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
  avatarPublicId: z.string().optional(),
  dob: z.string().min(1, "Date of birth is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  school: z.string().optional(),
  gradeLevel: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateStudentFormValues = z.input<typeof createStudentSchema>;
export type CreateStudentInput = z.output<typeof createStudentSchema>;
export type UpdateStudentFormValues = z.input<typeof updateStudentSchema>;
export type UpdateStudentInput = z.output<typeof updateStudentSchema>;
export type GuardianFormValues = z.input<typeof guardianSchema>;
export type GuardianInput = z.output<typeof guardianSchema>;
