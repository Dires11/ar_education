import { v2 as cloudinary } from "cloudinary";
import { NextRequest } from "next/server";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { paramsToSign } = body;

  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiSecret) {
    return Response.json(
      { error: "Missing CLOUDINARY_API_SECRET" },
      { status: 500 },
    );
  }

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return Response.json({ signature });
}
