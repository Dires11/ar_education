import { requireAdmin } from "@/lib/utils/auth";
import { createCloudinaryUploadSignature } from "@/lib/services/media";

export async function POST() {
  try {
    await requireAdmin();
    return Response.json(createCloudinaryUploadSignature());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to sign upload";
    const status = message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
