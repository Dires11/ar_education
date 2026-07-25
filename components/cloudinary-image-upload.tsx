"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";

interface CloudinaryImageUploadProps {
  value: string;
  publicId?: string;
  onChange: (url: string, publicId: string) => void;
  label?: string;
  fallback?: React.ReactNode;
}

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_ATTR = ACCEPTED_MIME.join(",");

async function uploadToCloudinary(file: File) {
  const signatureResponse = await fetch("/api/sign-cloudinary-params", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!signatureResponse.ok) throw new Error("Unable to authorize upload");
  const { signature, timestamp, folder, apiKey, cloudName } =
    await signatureResponse.json() as {
      signature: string;
      timestamp: number;
      folder: string;
      apiKey: string;
      cloudName: string;
    };

  const body = new FormData();
  body.append("file", file);
  body.append("folder", folder);
  body.append("timestamp", String(timestamp));
  body.append("api_key", apiKey);
  body.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body },
  );

  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<{ secure_url: string; public_id: string }>;
}

export function CloudinaryImageUpload({
  value,
  onChange,
  label,
  fallback,
}: CloudinaryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected later.
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (!ACCEPTED_MIME.includes(file.type)) {
      setError("Please upload a JPG, PNG, WebP, or GIF image.");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const result = await uploadToCloudinary(file);
      onChange(result.secure_url, result.public_id);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium leading-none">{label}</p>}

      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
          {value ? (
            <Image
              src={value}
              alt={label ?? "photo"}
              fill
              sizes="64px"
              className="h-full w-full object-cover"
            />
          ) : (
            fallback
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : value ? "Change photo" : "Upload photo"}
          </button>
          <p className={`min-h-4 text-xs leading-4 text-destructive ${error ? "" : "invisible"}`}>
            {error || " "}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_ATTR}
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
