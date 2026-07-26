import "server-only";

import {
  createPackage,
  updatePackage,
} from "@/lib/data/packages";
import {
  createPackageSchema,
  type CreatePackageInput,
} from "@/lib/validators/packages";

function toPackageData(input: CreatePackageInput) {
  const parsed = createPackageSchema.parse(input);
  return {
    name: parsed.name,
    type: parsed.type,
    billingPeriod:
      parsed.type === "MONTHLY"
        ? parsed.billingPeriod ?? "MONTHLY"
        : ("MONTHLY" as const),
    lessonType: parsed.lessonType,
    subjectId: parsed.subjectId || undefined,
    basePrice: parsed.basePrice,
    sessionsPerWeek:
      parsed.type === "MONTHLY" && parsed.sessionsPerWeek
        ? Number(parsed.sessionsPerWeek)
        : null,
    durationMinutes: Number(parsed.durationMinutes),
  };
}

export function createPackageOffering(input: CreatePackageInput) {
  return createPackage(toPackageData(input));
}

export function updatePackageOffering(
  id: string,
  input: CreatePackageInput,
) {
  const data = toPackageData(input);
  return updatePackage(id, {
    ...data,
    subjectId: data.subjectId ?? null,
  });
}

export function setPackageActive(id: string, isActive: boolean) {
  return updatePackage(id, { isActive });
}
