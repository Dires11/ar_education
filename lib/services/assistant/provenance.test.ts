import { describe, expect, it } from "vitest";
import { collectAssistantIdentifierReferences } from "@/lib/services/assistant/provenance";

describe("assistant typed identifier provenance", () => {
  it("keeps equal IDs from different entity types distinct", () => {
    expect(
      collectAssistantIdentifierReferences("students", "update_student", {
        id: "shared-id",
      }),
    ).toEqual([{ kind: "student", id: "shared-id" }]);
    expect(
      collectAssistantIdentifierReferences("tutors", "update_tutor", {
        id: "shared-id",
      }),
    ).toEqual([{ kind: "tutor", id: "shared-id" }]);
  });

  it("types every nested mutation reference and ignores presentation IDs", () => {
    expect(
      collectAssistantIdentifierReferences("enrollments", "create_enrollment", {
        studentId: "student-1",
        tutorId: "tutor-1",
        subjectId: "subject-1",
        packageId: "package-1",
        avatarPublicId: "storage-1",
      }),
    ).toEqual([
      { kind: "student", id: "student-1" },
      { kind: "tutor", id: "tutor-1" },
      { kind: "subject", id: "subject-1" },
      { kind: "package", id: "package-1" },
    ]);
  });
});
