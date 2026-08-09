export type AssistantRoutingEvalCase = {
  name: string;
  prompt: string;
  expectedNamespace: string;
  expectedTool: string;
};

export const ASSISTANT_ROUTING_EVAL_CASES: AssistantRoutingEvalCase[] = [
  {
    name: "resolve student before guardian inspection",
    prompt: "Find the student named Maya so I can inspect her guardians.",
    expectedNamespace: "students",
    expectedTool: "search_students",
  },
  {
    name: "rank youngest student",
    prompt: "Who is the youngest student in the directory?",
    expectedNamespace: "students",
    expectedTool: "query_student_directory",
  },
  {
    name: "create student",
    prompt:
      "Create student Maya Thompson, born 2012-04-08. I do not want to add a guardian yet.",
    expectedNamespace: "students",
    expectedTool: "create_student",
  },
  {
    name: "create enrollment",
    prompt:
      "Enroll student ID student_123 into package package_123 with tutor tutor_123 and subject subject_123 starting 2026-08-10.",
    expectedNamespace: "enrollments",
    expectedTool: "create_enrollment",
  },
  {
    name: "student balance",
    prompt: "What is the current balance for student ID student_123?",
    expectedNamespace: "billing",
    expectedTool: "get_student_balance",
  },
  {
    name: "overdue dues",
    prompt: "Show all overdue package payments.",
    expectedNamespace: "billing",
    expectedTool: "get_upcoming_dues",
  },
  {
    name: "resolve recurrence rule",
    prompt:
      "List the active recurring schedules for enrollment ID enrollment_123 so I can choose one to change.",
    expectedNamespace: "recurrence",
    expectedTool: "list_recurring_schedules",
  },
  {
    name: "create recurring schedule",
    prompt:
      "Create a weekly recurring schedule for enrollment ID enrollment_123 every Monday at 15:30 for 60 minutes, starting 2026-08-10.",
    expectedNamespace: "recurrence",
    expectedTool: "create_recurring_schedule",
  },
  {
    name: "inspect enrollment schedule capacity",
    prompt:
      "For enrollment ID enrollment_123, how many sessions are still available in the week containing 2026-08-10T12:00:00.000Z?",
    expectedNamespace: "schedule",
    expectedTool: "get_enrollment_capacity",
  },
  {
    name: "preview recurring schedule",
    prompt:
      "Before creating anything, preview a weekly schedule for enrollment ID enrollment_123 every Monday at 15:30 for 60 minutes starting 2026-08-10.",
    expectedNamespace: "schedule",
    expectedTool: "preview_recurring_schedule",
  },
  {
    name: "mark attendance",
    prompt:
      "For session ID session_123, mark student ID student_123 completed and billable.",
    expectedNamespace: "schedule",
    expectedTool: "mark_attendance",
  },
  {
    name: "record payment",
    prompt:
      "Record a $120 card payment on 2026-08-08 for student ID student_123.",
    expectedNamespace: "billing",
    expectedTool: "record_payment",
  },
  {
    name: "send payment reminder",
    prompt:
      "Send the payment reminder for enrollment ID enrollment_123 for 2026-08.",
    expectedNamespace: "billing",
    expectedTool: "send_payment_reminder",
  },
  {
    name: "invite staff",
    prompt: "Invite new staff member alex@example.com to the CRM team.",
    expectedNamespace: "team",
    expectedTool: "invite_team_member",
  },
];
