export type CalendarSession = {
  id: string;
  scheduledFor: string;
  durationMinutes: number;
  status: string;
  room: string | null;
  notes?: string | null;
  tutor: { firstName: string; lastName: string };
  subject: { name: string };
  enrollmentStudent?: { firstName: string; lastName: string } | null;
  attendance: Array<{
    studentId?: string;
    status?: string;
    billable?: boolean;
    student: { firstName: string; lastName: string };
  }>;
  enrollmentId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  recurrenceRuleId?: string | null;
  virtual?: boolean;
  ruleId?: string | null;
  startTime?: string | null;
  dayOfWeek?: number | null;
  intervalWeeks?: number | null;
  isPaid?: boolean | null;
  color?: string | null;
};
