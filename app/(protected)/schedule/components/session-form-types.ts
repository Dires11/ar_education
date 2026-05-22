export type Tutor = { id: string; name: string; subjectIds: string[] };

export type Subject = { id: string; name: string };

export type SessionEnrollment = {
  id: string;
  label: string;
  studentName: string;
  studentId: string;
  tutorId: string;
  tutorName: string;
  subjectId: string;
  subjectName: string;
  sessionsPerWeek?: number | null;
  packageName?: string | null;
  packageType: "MONTHLY" | "PER_SESSION";
  lessonType: "PRIVATE" | "GROUP";
};

export type SessionGroup = {
  id: string;
  label: string;
  tutorId: string;
  tutorName: string;
  subjectId: string;
  subjectName: string;
  memberCount: number;
  packageName?: string | null;
  packageType?: "MONTHLY" | "PER_SESSION" | null;
  sessionsPerWeek?: number | null;
};

export type ScheduleRule = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  intervalWeeks: number;
  room: string | null;
  color: string | null;
};

export type ActiveEnrollmentRule = ScheduleRule & {
  enrollment: { subject: { name: string } } | null;
};

export type ActiveGroupRule = ScheduleRule & {
  group: { subject: { name: string } } | null;
};
