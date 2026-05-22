export type EnrollmentStudentOption = { id: string; name: string };

export type EnrollmentTutorOption = {
  id: string;
  name: string;
  subjectIds: string[];
};

export type EnrollmentSubjectOption = { id: string; name: string };

export type EnrollmentPackageOption = {
  id: string;
  name: string;
  type: string;
  billingPeriod: string;
  lessonType: string;
  basePrice: string;
  sessionsPerWeek: number | null;
  durationMinutes: number;
  subjectId: string | null;
  subjectName?: string | null;
};

export type EnrollmentGroupOption = {
  id: string;
  name: string;
  tutorId: string;
  tutorName?: string;
  subjectId: string;
  subjectName?: string;
  memberCount: number;
};
