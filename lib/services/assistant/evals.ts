export type AssistantRoutingEvalCase = {
  name: string;
  prompt: string;
  expectedNamespace: string;
  expectedTool: string;
  acceptableAlternativeTools?: string[];
  requiredLookups?: Array<{
    alternatives: string[];
    arguments: Record<string, unknown>;
  }>;
  expectedArgumentsByTool: Record<string, Record<string, unknown>>;
  expectedConfirmation?: boolean;
  trials?: number;
};

export const ASSISTANT_ROUTING_EVAL_CASES: AssistantRoutingEvalCase[] = [
  {
    name: "resolve student before guardian inspection",
    prompt: "Find the student named Maya so I can inspect her guardians.",
    expectedNamespace: "students",
    expectedTool: "search_students",
    acceptableAlternativeTools: ["students.query_student_directory"],
    expectedArgumentsByTool: {
      "students.search_students": { query: "Maya" },
      "students.query_student_directory": { query: "Maya" },
    },
  },
  {
    name: "rank youngest student",
    prompt: "Who is the youngest student in the directory?",
    expectedNamespace: "students",
    expectedTool: "query_student_directory",
    expectedArgumentsByTool: {
      "students.query_student_directory": {
        sortBy: "DATE_OF_BIRTH",
        sortOrder: "DESC",
        limit: 1,
      },
    },
  },
  {
    name: "create student",
    prompt:
      "Create student Maya Thompson, born 2012-04-08. I do not want to add a guardian yet.",
    expectedNamespace: "students",
    expectedTool: "create_student",
    expectedArgumentsByTool: {
      "students.create_student": {
        firstName: "Maya",
        lastName: "Thompson",
        dob: "2012-04-08",
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "create enrollment",
    prompt:
      "Enroll student ID student_123 into package package_123 with tutor tutor_123 and subject subject_123 starting 2026-08-10.",
    expectedNamespace: "enrollments",
    expectedTool: "create_enrollment",
    requiredLookups: [
      {
        alternatives: ["students.get_student"],
        arguments: { id: "student_123" },
      },
      {
        alternatives: ["tutors.get_tutor"],
        arguments: { id: "tutor_123" },
      },
      {
        alternatives: ["catalog.get_package"],
        arguments: { id: "package_123" },
      },
      {
        alternatives: ["catalog.list_subjects"],
        arguments: { id: "subject_123" },
      },
    ],
    expectedArgumentsByTool: {
      "enrollments.create_enrollment": {
        studentId: "student_123",
        packageId: "package_123",
        tutorId: "tutor_123",
        subjectId: "subject_123",
        startDate: "2026-08-10",
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "student balance",
    prompt: "What is the current balance for student ID student_123?",
    expectedNamespace: "billing",
    expectedTool: "get_student_balance",
    requiredLookups: [
      {
        alternatives: ["students.get_student"],
        arguments: { id: "student_123" },
      },
    ],
    expectedArgumentsByTool: {
      "billing.get_student_balance": { studentId: "student_123" },
    },
  },
  {
    name: "overdue dues",
    prompt:
      "Show overdue package payments from September 2024 through August 2026.",
    expectedNamespace: "billing",
    expectedTool: "get_upcoming_dues",
    expectedArgumentsByTool: {
      "billing.get_upcoming_dues": {
        status: "OVERDUE",
        fromMonth: "2024-09",
        toMonth: "2026-08",
      },
    },
  },
  {
    name: "resolve recurrence rule",
    prompt:
      "List the active recurring schedules for enrollment ID enrollment_123 so I can choose one to change.",
    expectedNamespace: "recurrence",
    expectedTool: "list_recurring_schedules",
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "recurrence.list_recurring_schedules": {
        enrollmentId: "enrollment_123",
        includeEnded: false,
      },
    },
  },
  {
    name: "create recurring schedule",
    prompt:
      "Create a weekly recurring schedule for enrollment ID enrollment_123 every Monday at 15:30 for 60 minutes, starting 2026-08-10.",
    expectedNamespace: "recurrence",
    expectedTool: "create_recurring_schedule",
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "recurrence.create_recurring_schedule": {
        enrollmentId: "enrollment_123",
        daysOfWeek: ["1"],
        startTime: "15:30",
        durationMinutes: "60",
        startsOn: "2026-08-10",
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "inspect enrollment schedule capacity",
    prompt:
      "For enrollment ID enrollment_123, how many sessions are still available in the week containing 2026-08-10T12:00:00.000Z?",
    expectedNamespace: "schedule",
    expectedTool: "get_enrollment_capacity",
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "schedule.get_enrollment_capacity": {
        enrollmentId: "enrollment_123",
        date: "2026-08-10T12:00:00.000Z",
      },
    },
  },
  {
    name: "preview recurring schedule",
    prompt:
      "Before creating anything, preview a weekly schedule for enrollment ID enrollment_123 every Monday at 15:30 for 60 minutes starting 2026-08-10.",
    expectedNamespace: "schedule",
    expectedTool: "preview_recurring_schedule",
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "schedule.preview_recurring_schedule": {
        enrollmentId: "enrollment_123",
        daysOfWeek: ["1"],
        startTime: "15:30",
        durationMinutes: "60",
        startsOn: "2026-08-10",
      },
    },
    trials: 3,
  },
  {
    name: "mark attendance",
    prompt:
      "For session ID session_123, mark student ID student_123 completed and billable.",
    expectedNamespace: "schedule",
    expectedTool: "mark_attendance",
    requiredLookups: [
      {
        alternatives: [
          "schedule.get_schedule",
          "attendance.get_session_participants",
        ],
        arguments: { sessionId: "session_123" },
      },
    ],
    expectedArgumentsByTool: {
      "schedule.mark_attendance": {
        sessionId: "session_123",
        attendances: [
          { studentId: "student_123", status: "COMPLETED", billable: true },
        ],
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "update linked guardian",
    prompt:
      "Update guardian ID guardian_123 linked to student ID student_123 to phone 555-0100.",
    expectedNamespace: "guardians",
    expectedTool: "update_guardian",
    requiredLookups: [
      {
        alternatives: ["guardians.get_guardian"],
        arguments: {
          studentId: "student_123",
          guardianId: "guardian_123",
        },
      },
    ],
    expectedArgumentsByTool: {
      "guardians.update_guardian": {
        studentId: "student_123",
        guardianId: "guardian_123",
        phone: "555-0100",
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "create one-time enrollment session",
    prompt:
      "Create a one-time 60 minute session for enrollment ID enrollment_123 at 2026-08-24T17:00:00.000Z.",
    expectedNamespace: "schedule",
    expectedTool: "create_one_time_session",
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "schedule.create_one_time_session": {
        enrollmentId: "enrollment_123",
        scheduledFor: "2026-08-24T17:00:00.000Z",
        durationMinutes: "60",
        studentIds: [],
      },
    },
    expectedConfirmation: false,
  },
  {
    name: "record payment",
    prompt:
      "Record a $120 card payment on 2026-08-08 for student ID student_123.",
    expectedNamespace: "billing",
    expectedTool: "record_payment",
    requiredLookups: [
      {
        alternatives: ["students.get_student"],
        arguments: { id: "student_123" },
      },
    ],
    expectedArgumentsByTool: {
      "billing.record_payment": {
        studentId: "student_123",
        amount: "120",
        method: "CARD",
        paidAt: "2026-08-08",
      },
    },
    expectedConfirmation: true,
  },
  {
    name: "send payment reminder",
    prompt:
      "Send the payment reminder for enrollment ID enrollment_123 for 2026-08.",
    expectedNamespace: "billing",
    expectedTool: "send_payment_reminder",
    acceptableAlternativeTools: ["billing.send_payment_reminders"],
    requiredLookups: [
      {
        alternatives: ["enrollments.get_enrollment"],
        arguments: { id: "enrollment_123" },
      },
    ],
    expectedArgumentsByTool: {
      "billing.send_payment_reminder": {
        enrollmentId: "enrollment_123",
        month: "2026-08",
      },
      "billing.send_payment_reminders": {
        reminders: [{ enrollmentId: "enrollment_123", month: "2026-08" }],
      },
    },
    expectedConfirmation: true,
  },
  {
    name: "send a cohort email",
    prompt:
      "Send all active students an email with subject 'Center update' and body 'Hello @name, classes are open tomorrow.'",
    expectedNamespace: "communications",
    expectedTool: "send_email",
    requiredLookups: [
      {
        alternatives: ["communications.resolve_recipients"],
        arguments: { status: "ACTIVE" },
      },
    ],
    expectedArgumentsByTool: {
      "communications.send_email": {
        studentIds: Array.from(
          { length: 20 },
          (_, index) => `student_${index + 1}`,
        ),
        subject: "Center update",
        body: "Hello @name, classes are open tomorrow.",
      },
    },
    expectedConfirmation: true,
  },
  {
    name: "send bulk overdue reminders",
    prompt:
      "Find every overdue billing period from September 2025 through August 2026 and send all of those payment reminders.",
    expectedNamespace: "billing",
    expectedTool: "send_payment_reminders",
    requiredLookups: [
      {
        alternatives: ["billing.get_upcoming_dues"],
        arguments: {
          status: "OVERDUE",
          fromMonth: "2025-09",
          toMonth: "2026-08",
        },
      },
    ],
    expectedArgumentsByTool: {
      "billing.send_payment_reminders": {
        reminders: Array.from({ length: 20 }, (_, index) => ({
          enrollmentId: `enrollment_${index + 1}`,
          month: "2026-08",
        })),
      },
    },
    expectedConfirmation: true,
  },
  {
    name: "invite staff",
    prompt: "Invite new staff member alex@example.com to the CRM team.",
    expectedNamespace: "team",
    expectedTool: "invite_team_member",
    expectedArgumentsByTool: {
      "team.invite_team_member": { email: "alex@example.com" },
    },
    expectedConfirmation: true,
  },
];
