import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { isCloudinaryImageReferenced } from "@/lib/data/media";

export const AVATAR_FOLDER = "ar_education/avatars";

export function createCloudinaryUploadSignature() {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey =
    process.env.CLOUDINARY_API_KEY ??
    process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables are not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { folder: AVATAR_FOLDER, timestamp },
    apiSecret
  );

  return {
    cloudName,
    apiKey,
    timestamp,
    folder: AVATAR_FOLDER,
    signature,
  };
}

export async function deleteCloudinaryImage(publicId: string) {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey =
    process.env.CLOUDINARY_API_KEY ??
    process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  await cloudinary.uploader.destroy(publicId, {
    invalidate: true,
    resource_type: "image",
  });
}

export async function deleteCloudinaryImageIfUnreferenced(publicId: string) {
  if (await isCloudinaryImageReferenced(publicId)) return false;
  await deleteCloudinaryImage(publicId);
  return true;
}
