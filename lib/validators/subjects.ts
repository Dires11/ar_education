import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2_000).optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
