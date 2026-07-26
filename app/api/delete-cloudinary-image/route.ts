import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/utils/auth";
import {
  AVATAR_FOLDER,
  deleteCloudinaryImageIfUnreferenced,
} from "@/lib/services/media";

const deleteImageSchema = z.object({
  publicId: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9/_-]+$/)
    .refine(
      (publicId) => publicId.startsWith(`${AVATAR_FOLDER}/`),
      "Image is outside the managed avatar folder",
    ),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const { publicId } = deleteImageSchema.parse(await request.json());
    if (!(await deleteCloudinaryImageIfUnreferenced(publicId))) {
      return Response.json(
        { error: "Image is still attached to a profile" },
        { status: 409 },
      );
    }
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid publicId" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Unable to delete image";
    const status = message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
