import { v2 as cloudinary } from "cloudinary";

type CloudinaryUploadParams = {
  folder: string;
};

export function createCloudinaryUploadSignature({
  folder,
}: CloudinaryUploadParams) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables are not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    apiSecret
  );

  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
  };
}
