import { useEffect, useRef } from "react";

/**
 * Tracks Cloudinary public IDs uploaded during a form session.
 * On unmount, deletes any tracked uploads that were never committed
 * (i.e. form was closed / cancelled without saving).
 *
 * Usage:
 *   const { trackUpload, commit } = useCloudinaryCleanup();
 *   // call trackUpload(publicId) inside each onChange handler
 *   // call commit() inside the successful submit handler
 */
export function useCloudinaryCleanup() {
  const pendingRef = useRef<Set<string>>(new Set());
  const committedRef = useRef(false);

  useEffect(() => {
    const pendingUploads = pendingRef.current;

    return () => {
      if (committedRef.current) return;
      pendingUploads.forEach((publicId) => {
        fetch("/api/delete-cloudinary-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId }),
        }).catch(() => {});
      });
    };
  }, []);

  function trackUpload(publicId: string) {
    pendingRef.current.add(publicId);
  }

  function commit() {
    committedRef.current = true;
  }

  return { trackUpload, commit };
}
