import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
