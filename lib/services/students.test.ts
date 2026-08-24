import { beforeEach, describe, expect, it, vi } from "vitest";

const studentDataMocks = vi.hoisted(() => ({
  getStudent: vi.fn(),
  updateStudent: vi.fn(),
}));

vi.mock("@/lib/data/students", () => ({
  getStudent: studentDataMocks.getStudent,
  updateStudent: studentDataMocks.updateStudent,
}));
vi.mock("@/lib/services/media", () => ({
  deleteCloudinaryImageIfUnreferenced: vi.fn(),
}));

import { updateStudentProfile } from "@/lib/services/students";

describe("student profile updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studentDataMocks.getStudent.mockResolvedValue({
      id: "student-1",
      avatarPublicId: null,
    });
    studentDataMocks.updateStudent.mockResolvedValue({
      id: "student-1",
      avatarPublicId: null,
    });
  });

  it("preserves a nullable date of birth while updating other fields", async () => {
    await updateStudentProfile("student-1", {
      firstName: "Legacy",
      lastName: "Student",
      avatarUrl: "",
      dob: "",
      email: "",
      phone: "555-0100",
      school: "North High",
      gradeLevel: "10",
      notes: "Updated without requiring a DOB",
    });

    expect(studentDataMocks.updateStudent).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({
        dob: null,
        phone: "555-0100",
        school: "North High",
      }),
    );
  });
});
