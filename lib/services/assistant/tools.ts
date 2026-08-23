import type OpenAI from "openai";
import { z } from "zod";
import {
  idSchema,
  isoDateTimeSchema,
  monthSchema,
} from "@/lib/validators/common";
import {
  createStudentSchema,
  guardianPatchSchema,
  guardianSchema,
  studentDirectoryQuerySchema,
  updateStudentSchema,
} from "@/lib/validators/students";
import { createTutorSchema, updateTutorSchema } from "@/lib/validators/tutors";
import { createPackageSchema } from "@/lib/validators/packages";
import { createSubjectSchema } from "@/lib/validators/subjects";
import {
  createDiscountSchema,
  createEnrollmentSchema,
  updateEnrollmentSchema,
} from "@/lib/validators/enrollments";
import {
  createAdHocSessionSchema,
  createRecurrenceSchema,
  markAttendanceSchema,
  rescheduleOccurrenceSchema,
  splitRecurrenceSchema,
  updateSessionSchema,
} from "@/lib/validators/sessions";
import {
  createPaymentSchema,
  markPaymentPaidSchema,
} from "@/lib/validators/payments";
import { emailTemplateSchema, sendEmailSchema } from "@/lib/validators/emails";
import { updateGroupSchema } from "@/lib/validators/groups";

export type AssistantToolSpec = {
  namespace: string;
  name: string;
  description: string;
  schema: z.ZodType;
  ownerOnly?: boolean;
  requiresConfirmation:
    | boolean
    | ((argumentsValue: Record<string, unknown>) => boolean);
};

const assistantGuardianSchema = guardianSchema.omit({
  avatarUrl: true,
  avatarPublicId: true,
});
const assistantGuardianPatchSchema = guardianPatchSchema.omit({
  avatarUrl: true,
  avatarPublicId: true,
});
const assistantCreateStudentSchema = createStudentSchema
  .omit({ avatarUrl: true, avatarPublicId: true, guardian: true })
  .extend({ guardian: assistantGuardianSchema.optional() });
const studentPatchSchema = updateStudentSchema
  .omit({ avatarUrl: true, avatarPublicId: true })
  .partial()
  .extend({ id: idSchema });
const assistantCreateTutorSchema = createTutorSchema.omit({
  avatarUrl: true,
  avatarPublicId: true,
});
const tutorPatchSchema = updateTutorSchema
  .omit({ avatarUrl: true, avatarPublicId: true })
  .partial()
  .extend({ id: idSchema });
const packagePatchSchema = z
  .object(createPackageSchema.shape)
  .partial()
  .extend({ id: idSchema });
const subjectPatchSchema = createSubjectSchema
  .partial()
  .extend({ id: idSchema });

const searchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "INACTIVE"]).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

const recurringScheduleLookupSchema = z
  .object({
    enrollmentId: idSchema.optional(),
    groupId: idSchema.optional(),
    includeEnded: z.boolean().default(false),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .refine(
    (value) =>
      Number(Boolean(value.enrollmentId)) + Number(Boolean(value.groupId)) ===
      1,
    { message: "Provide exactly one enrollmentId or groupId" },
  );

// Fail closed: every registered tool is treated as a mutation unless it is
// explicitly listed here. This also makes newly added tools require approval
// when their arguments are derived from attachments or prior CRM output until
// they have been deliberately classified.
const ASSISTANT_READ_ONLY_TOOL_KEYS = new Set([
  "students.search_students",
  "students.query_student_directory",
  "students.get_student",
  "tutors.search_tutors",
  "tutors.get_tutor",
  "tutors.get_tutor_payroll",
  "catalog.list_subjects",
  "catalog.list_packages",
  "catalog.get_package",
  "enrollments.search_enrollments",
  "enrollments.get_enrollment",
  "enrollments.list_groups",
  "schedule.get_schedule",
  "schedule.get_enrollment_capacity",
  "schedule.preview_recurring_schedule",
  "recurrence.list_recurring_schedules",
  "recurrence.get_recurring_schedule",
  "billing.get_student_balance",
  "billing.list_payments",
  "billing.get_upcoming_dues",
  "billing.get_payment_stats",
  "communications.list_email_templates",
  "communications.get_email_template",
  "team.get_team",
  "reporting.get_dashboard_summary",
]);

const toolSpecs: AssistantToolSpec[] = [
  {
    namespace: "students",
    name: "search_students",
    description:
      "Search students and guardians by name, contact information, or school. Returns compact profile fields and IDs for resolving a person before a mutation. Never use this for a supplied student ID; use get_student instead. Do not use this tool for directory-wide rankings or superlatives.",
    schema: searchSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "students",
    name: "query_student_directory",
    description:
      "Query, filter, paginate, and rank the student directory in one call. Use for counts, lists, demographic comparisons, and superlatives such as youngest, oldest, newest, or most recently updated. Never use this to verify a supplied student ID; use get_student instead. For youngest use DATE_OF_BIRTH DESC with limit 1; for oldest use DATE_OF_BIRTH ASC with limit 1. Date-of-birth rankings exclude missing DOB values and report how many records were excluded. Do not fetch each student individually.",
    schema: studentDirectoryQuerySchema,
    requiresConfirmation: false,
  },
  {
    namespace: "students",
    name: "get_student",
    description:
      "Get and verify one exact student profile, guardians, and recent enrollments by student ID. Always use this when the administrator supplies a student ID.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "students",
    name: "create_student",
    description:
      "Create one student, optionally with a first guardian. A guardian is optional and must not block creating the student; if guardian details were requested, collect every required guardian field before calling, otherwise offer guardian setup as a next step after creation.",
    schema: assistantCreateStudentSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "students",
    name: "update_student",
    description:
      "Update selected student profile fields. Omitted fields remain unchanged.",
    schema: studentPatchSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "students",
    name: "set_student_status",
    description: "Set a student's status to ACTIVE, PAUSED, or INACTIVE.",
    schema: z.object({
      id: idSchema,
      status: z.enum(["ACTIVE", "PAUSED", "INACTIVE"]),
    }),
    requiresConfirmation: (args) => args.status === "INACTIVE",
  },
  {
    namespace: "students",
    name: "archive_student",
    description: "Archive a student by setting the profile inactive.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "students",
    name: "delete_student",
    description: "Permanently delete an unlinked student record.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "guardians",
    name: "add_guardian",
    description: "Create and link a guardian to a known student.",
    schema: assistantGuardianSchema.extend({ studentId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "guardians",
    name: "update_guardian",
    description: "Update selected guardian fields for a known student.",
    schema: assistantGuardianPatchSchema.extend({
      studentId: idSchema,
      guardianId: idSchema,
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "guardians",
    name: "remove_guardian",
    description: "Remove the link between a guardian and student.",
    schema: z.object({ studentId: idSchema, guardianId: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "tutors",
    name: "search_tutors",
    description:
      "Search tutors by name or email, optionally by status or subject ID.",
    schema: searchSchema.extend({ subjectId: idSchema.optional() }),
    requiresConfirmation: false,
  },
  {
    namespace: "tutors",
    name: "get_tutor",
    description: "Get a tutor profile, subjects, and active enrollments.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "tutors",
    name: "create_tutor",
    description: "Create a tutor and assign at least one subject ID.",
    schema: assistantCreateTutorSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "tutors",
    name: "update_tutor",
    description:
      "Update selected tutor profile fields. Omitted fields remain unchanged.",
    schema: tutorPatchSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "tutors",
    name: "set_tutor_subjects",
    description: "Replace the subjects assigned to a tutor.",
    schema: z.object({
      id: idSchema,
      subjectIds: z.array(idSchema).min(1).max(100),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "tutors",
    name: "archive_tutor",
    description: "Archive a tutor by setting the tutor inactive.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "tutors",
    name: "get_tutor_payroll",
    description:
      "Calculate completed-session hours and earnings for a tutor over an ISO date range.",
    schema: z.object({
      id: idSchema,
      from: z.iso.datetime(),
      to: z.iso.datetime(),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "list_subjects",
    description:
      "List a bounded summary of available subjects, optionally inspecting one exact subject ID.",
    schema: z.object({
      id: idSchema.optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "create_subject",
    description: "Create a subject.",
    schema: createSubjectSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "update_subject",
    description: "Update selected subject fields.",
    schema: subjectPatchSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "delete_subject",
    description: "Permanently delete an unused subject.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "catalog",
    name: "list_packages",
    description:
      "List a bounded summary of packages, optionally active packages only.",
    schema: z.object({
      activeOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "get_package",
    description: "Get a package by ID.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "create_package",
    description: "Create a package offering.",
    schema: createPackageSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "update_package",
    description:
      "Update selected package fields. Omitted fields remain unchanged.",
    schema: packagePatchSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "catalog",
    name: "set_package_active",
    description: "Activate or deactivate a package.",
    schema: z.object({ id: idSchema, isActive: z.boolean() }),
    requiresConfirmation: (args) => args.isActive === false,
  },
  {
    namespace: "enrollments",
    name: "search_enrollments",
    description: "List enrollments filtered by student, tutor, or status.",
    schema: z.object({
      studentId: idSchema.optional(),
      tutorId: idSchema.optional(),
      status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
      limit: z.number().int().min(1).max(30).default(20),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "enrollments",
    name: "get_enrollment",
    description:
      "Get an enrollment by enrollment ID, or resolve the owning enrollment by discount ID, including student, tutor, package, discounts, recent sessions, and payments.",
    schema: z
      .object({
        id: idSchema.optional(),
        discountId: idSchema.optional(),
      })
      .refine((value) => Boolean(value.id || value.discountId), {
        message: "Provide id or discountId",
      }),
    requiresConfirmation: false,
  },
  {
    namespace: "enrollments",
    name: "create_enrollment",
    description:
      "Enroll a known student with known package, tutor, and subject IDs.",
    schema: createEnrollmentSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "enrollments",
    name: "update_enrollment",
    description: "Update enrollment status, end date, or price override.",
    schema: updateEnrollmentSchema.extend({ id: idSchema }),
    requiresConfirmation: (args) =>
      (typeof args.endDate === "string" && args.endDate.length > 0) ||
      args.status === "COMPLETED" ||
      args.status === "CANCELLED",
  },
  {
    namespace: "enrollments",
    name: "add_discount",
    description: "Add a discount to an enrollment.",
    schema: createDiscountSchema.extend({ enrollmentId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "enrollments",
    name: "remove_discount",
    description: "Remove a discount.",
    schema: z.object({ discountId: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "enrollments",
    name: "list_groups",
    description:
      "List bounded group summaries, inspect one exact group ID, or narrow by tutor and subject.",
    schema: z.object({
      groupId: idSchema.optional(),
      tutorId: idSchema.optional(),
      subjectId: idSchema.optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "enrollments",
    name: "rename_group",
    description: "Rename an existing group.",
    schema: updateGroupSchema.extend({ groupId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "get_schedule",
    description:
      "Get one exact session by session ID, or real and virtual schedule entries for one yyyy-MM calendar month.",
    schema: z
      .object({
        month: monthSchema.optional(),
        sessionId: idSchema.optional(),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .refine((value) => Boolean(value.month || value.sessionId), {
        message: "Provide month or sessionId",
      }),
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "get_enrollment_capacity",
    description:
      "Get one enrollment's planned sessions, remaining package capacity, and limit status for the center-local week containing an ISO date-time.",
    schema: z.object({ enrollmentId: idSchema, date: isoDateTimeSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "preview_recurring_schedule",
    description:
      "Preview a complete recurring schedule proposal without writing it. Returns package limits, proposed and materializable sessions, and a suggested end date when applicable.",
    schema: createRecurrenceSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "create_one_time_session",
    description:
      "Create a one-time session using one exact enrollment or group ID and an empty studentIds array. For a standalone session, provide exact tutor, subject, and student IDs instead.",
    schema: createAdHocSessionSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "update_session",
    description: "Update a one-time or materialized session.",
    schema: updateSessionSchema.extend({ sessionId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "schedule",
    name: "mark_attendance",
    description: "Set student attendance and billable flags for a session.",
    schema: markAttendanceSchema.extend({ sessionId: idSchema }),
    requiresConfirmation: (args) =>
      Array.isArray(args.attendances) &&
      args.attendances.some(
        (attendance) =>
          attendance !== null &&
          typeof attendance === "object" &&
          "status" in attendance &&
          (attendance.status === "CANCELLED_BY_TUTOR" ||
            attendance.status === "CANCELLED_BY_STUDENT"),
      ),
  },
  {
    namespace: "schedule",
    name: "set_session_status",
    description: "Set a session status.",
    schema: z.object({
      sessionId: idSchema,
      status: z.enum([
        "SCHEDULED",
        "COMPLETED",
        "NO_SHOW",
        "CANCELLED_BY_TUTOR",
        "CANCELLED_BY_STUDENT",
      ]),
    }),
    requiresConfirmation: (args) =>
      args.status === "CANCELLED_BY_TUTOR" ||
      args.status === "CANCELLED_BY_STUDENT",
  },
  {
    namespace: "schedule",
    name: "cancel_session",
    description: "Cancel a session by tutor or student.",
    schema: z.object({
      sessionId: idSchema,
      cancelledBy: z.enum(["TUTOR", "STUDENT"]),
    }),
    requiresConfirmation: true,
  },
  {
    namespace: "schedule",
    name: "delete_session",
    description: "Permanently delete a one-time or materialized session.",
    schema: z.object({ sessionId: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "recurrence",
    name: "list_recurring_schedules",
    description:
      "List current and future recurring schedule rules for exactly one known enrollment or group. Optionally include ended rules. Returns rule IDs required for occurrence, series, and deletion changes.",
    schema: recurringScheduleLookupSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "recurrence",
    name: "get_recurring_schedule",
    description:
      "Inspect one recurring schedule rule and its student or group participants by rule ID.",
    schema: z.object({ ruleId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "recurrence",
    name: "create_recurring_schedule",
    description: "Create a recurring schedule for one enrollment or group.",
    schema: createRecurrenceSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "recurrence",
    name: "split_recurring_schedule",
    description: "Change a recurring schedule from a split date onward.",
    schema: splitRecurrenceSchema,
    requiresConfirmation: true,
  },
  {
    namespace: "recurrence",
    name: "end_recurring_schedule",
    description: "End a recurring schedule from a specific occurrence date.",
    schema: z.object({ ruleId: idSchema, occurrenceFor: isoDateTimeSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "recurrence",
    name: "cancel_occurrence",
    description: "Cancel one occurrence of a recurring schedule.",
    schema: z.object({ ruleId: idSchema, occurrenceFor: isoDateTimeSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "recurrence",
    name: "reschedule_occurrence",
    description:
      "Move one recurring occurrence, optionally changing duration or room.",
    schema: rescheduleOccurrenceSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "recurrence",
    name: "delete_recurring_schedule",
    description:
      "Delete an entire recurring schedule while preserving past materialized sessions.",
    schema: z.object({ ruleId: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "recurrence",
    name: "set_schedule_color",
    description:
      "Set the hex display color for all active recurrence rules on an enrollment.",
    schema: z.object({
      enrollmentId: idSchema,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "billing",
    name: "get_student_balance",
    description:
      "Get the current outstanding balance for one known student ID.",
    schema: z.object({ studentId: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "billing",
    name: "list_payments",
    description:
      "List payment history when the administrator asks to view, search, or audit existing payments.",
    schema: z.object({
      paymentId: idSchema.optional(),
      studentId: idSchema.optional(),
      enrollmentId: idSchema.optional(),
      method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
      limit: z.number().int().min(1).max(30).default(20),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "billing",
    name: "get_upcoming_dues",
    description:
      "List a bounded summary of overdue, current, future, or recently paid package dues.",
    schema: z.object({
      status: z
        .enum(["ALL", "OVERDUE", "DUE_THIS_MONTH", "UPCOMING", "PAID"])
        .default("ALL"),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    requiresConfirmation: false,
  },
  {
    namespace: "billing",
    name: "get_payment_stats",
    description:
      "Get this-month, last-month, and all-time payment counts and totals.",
    schema: z.object({}),
    requiresConfirmation: false,
  },
  {
    namespace: "billing",
    name: "record_payment",
    description:
      "Record a new payment after an unambiguous student lookup when the administrator explicitly provides the amount, method, and paid date. The application will request confirmation.",
    schema: createPaymentSchema,
    requiresConfirmation: true,
  },
  {
    namespace: "billing",
    name: "mark_due_paid",
    description:
      "Record the outstanding amount for a verified enrollment billing month as paid after unambiguous enrollment and student lookups. The application will request confirmation.",
    schema: markPaymentPaidSchema,
    requiresConfirmation: true,
  },
  {
    namespace: "billing",
    name: "delete_payment",
    description: "Permanently delete a payment record.",
    schema: z.object({ paymentId: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "billing",
    name: "send_payment_reminder",
    description:
      "Send a payment reminder email for one verified enrollment billing month after an unambiguous enrollment lookup. The application will request confirmation.",
    schema: z.object({ enrollmentId: idSchema, month: monthSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "communications",
    name: "list_email_templates",
    description:
      "List bounded email-template summaries without transmitting every saved body.",
    schema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
    requiresConfirmation: false,
  },
  {
    namespace: "communications",
    name: "get_email_template",
    description: "Inspect one exact saved email template by ID.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "communications",
    name: "create_email_template",
    description: "Create an email template without sending it.",
    schema: emailTemplateSchema,
    requiresConfirmation: false,
  },
  {
    namespace: "communications",
    name: "update_email_template",
    description: "Update an email template without sending it.",
    schema: emailTemplateSchema.extend({ id: idSchema }),
    requiresConfirmation: false,
  },
  {
    namespace: "communications",
    name: "delete_email_template",
    description: "Permanently delete an email template.",
    schema: z.object({ id: idSchema }),
    requiresConfirmation: true,
  },
  {
    namespace: "communications",
    name: "send_email",
    description: "Send a personalized email to selected student IDs.",
    schema: sendEmailSchema,
    requiresConfirmation: true,
  },
  {
    namespace: "team",
    name: "get_team",
    description:
      "List CRM administrators and pending invitations, or verify an exact administrator ID, invitation ID, or email. Owner only.",
    schema: z.object({
      adminId: idSchema.optional(),
      invitationId: idSchema.optional(),
      email: z.email().optional(),
    }),
    ownerOnly: true,
    requiresConfirmation: false,
  },
  {
    namespace: "team",
    name: "invite_team_member",
    description: "Invite a new CRM staff member by email. Owner only.",
    schema: z.object({ email: z.email() }),
    ownerOnly: true,
    requiresConfirmation: true,
  },
  {
    namespace: "team",
    name: "revoke_team_invitation",
    description: "Revoke a pending team invitation. Owner only.",
    schema: z.object({ invitationId: idSchema }),
    ownerOnly: true,
    requiresConfirmation: true,
  },
  {
    namespace: "team",
    name: "update_team_role",
    description: "Change another administrator's role. Owner only.",
    schema: z.object({
      adminId: idSchema,
      role: z.enum(["OWNER", "STAFF"]),
    }),
    ownerOnly: true,
    requiresConfirmation: true,
  },
  {
    namespace: "team",
    name: "remove_team_member",
    description: "Remove another administrator from the CRM. Owner only.",
    schema: z.object({ adminId: idSchema }),
    ownerOnly: true,
    requiresConfirmation: true,
  },
  {
    namespace: "reporting",
    name: "get_dashboard_summary",
    description:
      "Get current dashboard totals, today's sessions, unpaid students, package endings, and tutor workload.",
    schema: z.object({}),
    requiresConfirmation: false,
  },
];

function toJsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function getAssistantToolSpecs(role: "OWNER" | "STAFF") {
  return toolSpecs.filter((spec) => !spec.ownerOnly || role === "OWNER");
}

export function getAssistantToolSpec(
  namespace: string,
  name: string,
  role: "OWNER" | "STAFF",
) {
  return getAssistantToolSpecs(role).find(
    (spec) => spec.namespace === namespace && spec.name === name,
  );
}

export function getAssistantOpenAITools(
  role: "OWNER" | "STAFF",
): OpenAI.Responses.Tool[] {
  const specs = getAssistantToolSpecs(role);
  const grouped = new Map<string, AssistantToolSpec[]>();
  for (const spec of specs) {
    grouped.set(spec.namespace, [...(grouped.get(spec.namespace) ?? []), spec]);
  }

  const descriptions: Record<string, string> = {
    students:
      "Student directory search, demographic ranking, profile lookup, and lifecycle management.",
    guardians: "Guardian records linked to students.",
    tutors: "Tutor profiles, subject assignments, and payroll lookup.",
    catalog: "Subjects and educational package offerings.",
    enrollments: "Enrollments, discounts, and teaching groups.",
    schedule: "One-time/materialized sessions and attendance.",
    recurrence: "Recurring schedule creation and maintenance.",
    billing: "Payments, dues, balances, and payment reminders.",
    communications: "Email templates and outbound student email.",
    team: "CRM administrators, invitations, and access roles.",
    reporting: "Dashboard and operational reporting.",
  };

  const namespaces: OpenAI.Responses.NamespaceTool[] = [
    ...grouped.entries(),
  ].map(([name, namespaceSpecs]) => ({
    type: "namespace",
    name,
    description: descriptions[name] ?? `${name} tools`,
    tools: namespaceSpecs.map((spec) => ({
      type: "function",
      name: spec.name,
      description: spec.description,
      parameters: toJsonSchema(spec.schema),
      strict: false,
      defer_loading: true,
    })),
  }));

  return [...namespaces, { type: "tool_search" }];
}

export function assistantToolRequiresConfirmation(
  spec: AssistantToolSpec,
  argumentsValue: Record<string, unknown>,
) {
  return typeof spec.requiresConfirmation === "function"
    ? spec.requiresConfirmation(argumentsValue)
    : spec.requiresConfirmation;
}

export function assistantToolMutatesData(
  tool: Pick<AssistantToolSpec, "namespace" | "name">,
) {
  return !ASSISTANT_READ_ONLY_TOOL_KEYS.has(`${tool.namespace}.${tool.name}`);
}

export function getAssistantToolPreview(
  spec: AssistantToolSpec,
  argumentsValue: Record<string, unknown>,
) {
  return {
    title: spec.description.split(".")[0],
    namespace: spec.namespace,
    toolName: spec.name,
    arguments: argumentsValue,
    warning:
      "This action changes CRM data and will run immediately after approval.",
  };
}

export function getAssistantNamespaceCounts(role: "OWNER" | "STAFF") {
  return getAssistantToolSpecs(role).reduce<Record<string, number>>(
    (counts, spec) => {
      counts[spec.namespace] = (counts[spec.namespace] ?? 0) + 1;
      return counts;
    },
    {},
  );
}
