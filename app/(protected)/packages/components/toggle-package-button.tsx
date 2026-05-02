"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { togglePackageActiveAction } from "@/app/actions/packages";
import { Button } from "@/components/ui/button";

export function TogglePackageButton({
  packageId,
  isActive,
}: {
  packageId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      await togglePackageActiveAction(packageId, !isActive);
      toast.success(isActive ? "Package deactivated" : "Package activated");
      router.refresh();
    } catch {
      toast.error("Failed to update package");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="text-xs"
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
