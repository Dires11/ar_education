import { z } from "zod";
import { dateSchema } from "@/lib/validators/common";

export const guardianRelationshipValues = [
  "PARENT",
  "GUARDIAN",
  "OTHER",
] as const;

export const studentDirectorySortValues = [
  "DATE_OF_BIRTH",
  "CREATED_AT",
  "UPDATED_AT",
  "LAST_NAME",
  "FIRST_NAME",
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

export const studentDirectoryQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Optional student, guardian, school, email, or phone search text."),
  status: z
    .enum(["ACTIVE", "PAUSED", "INACTIVE"])
    .optional()
    .describe("Optional exact student status filter."),
  school: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Optional case-insensitive school-name filter."),
  gradeLevel: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe("Optional case-insensitive grade-level filter."),
  sortBy: z
    .enum(studentDirectorySortValues)
    .default("LAST_NAME")
    .describe(
      "Ranking field. For the youngest student use DATE_OF_BIRTH with DESC; for the oldest use DATE_OF_BIRTH with ASC; for the newest record use CREATED_AT with DESC.",
    ),
  sortOrder: z
    .enum(["ASC", "DESC"])
    .default("ASC")
    .describe("Ascending or descending order for sortBy."),
  page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(1)
    .describe("One-based result page."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Results per page. Use 1 for a single youngest, oldest, or newest record."),
});

export type CreateStudentFormValues = z.input<typeof createStudentSchema>;
export type CreateStudentInput = z.output<typeof createStudentSchema>;
export type UpdateStudentFormValues = z.input<typeof updateStudentSchema>;
export type UpdateStudentInput = z.output<typeof updateStudentSchema>;
export type GuardianFormValues = z.input<typeof guardianSchema>;
export type GuardianInput = z.output<typeof guardianSchema>;
export type StudentDirectoryQueryInput = z.output<
  typeof studentDirectoryQuerySchema
>;
