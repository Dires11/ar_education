import { z } from "zod";

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required"),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
