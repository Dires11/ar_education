import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Admin } from "@/generated/prisma";
import { isoDateTimeSchema } from "@/lib/validators/common";
import {
  getStudentIdentityForAssistant,
  getStudentProfileForAssistantMutation,
  getStudentForAssistant,
  getLinkedGuardianForAssistant,
  listStudents,
  resolveStudentCommunicationRecipientsData,
} from "@/lib/data/students";
import {
  getTutorProfileForAssistantMutation,
  getTutorForAssistant,
  listTutors,
} from "@/lib/data/tutors";
import {
  getSubject,
  listSubjectsForAssistant,
} from "@/lib/data/subjects";
import { getPackage, listPackagesForAssistant } from "@/lib/data/packages";
import {
  getDiscountForAssistant,
  getEnrollmentForAssistant,
  searchEnrollmentsForAssistant,
} from "@/lib/data/enrollments";
import { listGroupsForAssistant } from "@/lib/data/groups";
import {
  getPaymentForAssistantConfirmation,
  listPaymentsForAssistant,
} from "@/lib/data/payments";
import {
  getRecurrenceRuleForAssistant,
  getSessionForAssistant,
  getSessionParticipantsForAssistant,
} from "@/lib/data/sessions";
import {
  getEmailTemplate,
  listEmailTemplatesForAssistant,
} from "@/lib/data/emails";
import {
  createStudentWithGuardian,
  updateStudentProfile,
  updateStudentStatusById,
  archiveStudentById,
  deleteStudentById,
  addGuardianToStudent,
  updateGuardianDetails,
  removeGuardianFromStudent,
  queryStudentDirectory,
} from "@/lib/services/students";
import {
  createTutorWithSubjects,
  updateTutorProfile,
  updateTutorSubjectsList,
  archiveTutorById,
  getTutorPayrollForAssistant,
} from "@/lib/services/tutors";
import {
  createSubjectOffering,
  updateSubjectOffering,
  deleteSubjectOffering,
} from "@/lib/services/subjects";
import {
  createPackageOffering,
  updatePackageOffering,
  setPackageActive,
} from "@/lib/services/packages";
import {
  createEnrollmentForStudent,
  updateEnrollmentStatus,
  addDiscountToEnrollment,
  removeDiscount,
} from "@/lib/services/enrollments";
import { updateExistingGroup } from "@/lib/services/groups";
import {
  createAdHocSession,
  createRecurringSchedule,
  getMonthScheduleForAssistant,
  querySessionsForAssistant,
  markSessionAttendance,
  updateScheduledSession,
  updateSessionStatus,
  cancelSessionById,
  deleteSessionById,
  splitRecurrenceRule,
  endRecurrenceFromDate,
  cancelVirtualOccurrence,
  rescheduleVirtualOccurrence,
  deleteRecurringSchedule,
  updateEnrollmentRecurrenceColor,
  listRecurrenceRulesForAssistant,
  getEnrollmentMonthSummary,
  getRecurringSchedulePreview,
  getDashboardScheduleForAssistant,
} from "@/lib/services/sessions";
import {
  recordPayment,
  recordPaymentForDue,
  deletePaymentById,
  getPaymentDuesForAssistant,
  getPaymentStats,
  sendPaymentReminderEmail,
  getStudentBalanceForAssistant,
  getPaymentDueQuote,
  getPaymentReminderConfirmation,
} from "@/lib/services/payments";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmailToStudents,
  getEmailDeliveryConfirmation,
} from "@/lib/services/emails";
import {
  getAssistantAdminAuthorization,
  getTeamAdminForAssistant,
  getPendingTeamInvitation,
  getTeamPageForAssistant,
  inviteTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/lib/services/team";
import {
  getDashboardReportPageForAssistant,
  getDashboardStats,
} from "@/lib/services/dashboard";
import {
  assistantToolMutatesData,
  assistantToolRequiresConfirmation,
  getAssistantToolSpec,
  type AssistantToolSpec,
} from "@/lib/services/assistant/tools";
import { minimizeAssistantDto } from "@/lib/services/assistant/dto";
import { collectAssistantIdentifierReferences } from "@/lib/services/assistant/provenance";
import {
  addCalendarMonths,
  getCalendarMonthKey,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";
import { formatCalendarDate, formatDateTime } from "@/lib/utils/dates";
import { DeliveryOutcomeUnknownError } from "@/lib/utils/email-errors";
import { getInstantCalendarDateKey } from "@/lib/utils/time-zone";
import {
  normalizeAssistantResultCard,
  type AssistantResultCard,
} from "@/lib/validators/assistant";

type ToolArguments = Record<string, unknown>;

const assistantConfirmationSnapshotSchema = z.object({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  recipientSummary: z.string().max(2_000),
  subject: z.string().max(500),
  amount: z.string().optional(),
  monthLabel: z.string().optional(),
  bodyPreview: z.string().max(2_000).optional(),
  deliveries: z
    .array(
      z.object({
        enrollmentId: z.string(),
        month: z.string(),
        digest: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .max(100)
    .optional(),
});
const assistantRecurrenceVersionSchema = z.object({
  ruleId: z.string().min(1).max(128),
  updatedAt: isoDateTimeSchema,
});
const assistantSessionVersionSchema = z.object({
  sessionId: z.string().min(1).max(128),
  updatedAt: isoDateTimeSchema,
});
const VERSIONED_RECURRENCE_CONFIRMATION_TOOLS = new Set([
  "split_recurring_schedule",
  "end_recurring_schedule",
  "cancel_occurrence",
  "reschedule_occurrence",
  "delete_recurring_schedule",
]);
const VERSIONED_SESSION_CONFIRMATION_TOOLS = new Set([
  "update_session",
  "mark_attendance",
  "set_session_status",
  "cancel_session",
  "delete_session",
]);

export type AssistantToolExecutionContext = {
  admin: Pick<Admin, "id" | "role">;
  idempotencyKey?: string;
  provenanceValidated?: boolean;
  confirmationApproved?: boolean;
};

const ASSISTANT_BUSINESS_REFERENCE_KEYS = new Set([
  "id",
  "studentId",
  "studentIds",
  "guardianId",
  "tutorId",
  "subjectId",
  "subjectIds",
  "packageId",
  "enrollmentId",
  "groupId",
  "existingGroupId",
  "sessionId",
  "recurrenceRuleId",
  "recurrenceRuleIds",
  "ruleId",
  "paymentId",
  "discountId",
  "invitationId",
  "adminId",
]);

export function collectAssistantIdentifierValues(value: unknown): string[] {
  const identifiers = new Set<string>();
  const visit = (item: unknown, key?: string) => {
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, key));
      return;
    }
    if (!item || typeof item !== "object") {
      if (
        typeof item === "string" &&
        item.trim().length > 0 &&
        key &&
        ASSISTANT_BUSINESS_REFERENCE_KEYS.has(key)
      ) {
        identifiers.add(item);
      }
      return;
    }
    Object.entries(item as Record<string, unknown>).forEach(
      ([childKey, child]) => visit(child, childKey),
    );
  };
  visit(value);
  return [...identifiers];
}

export async function resolveAssistantConfirmationArguments(input: {
  namespace: string;
  name: string;
  argumentsValue: Record<string, unknown>;
}) {
  if (
    input.namespace === "schedule" &&
    VERSIONED_SESSION_CONFIRMATION_TOOLS.has(input.name)
  ) {
    const sessionId = z.string().parse(input.argumentsValue.sessionId);
    const session = await getSessionForAssistant(sessionId);
    if (!session) throw new Error("Session not found");
    input = {
      ...input,
      argumentsValue: {
        ...input.argumentsValue,
        __assistantSessionVersion: {
          sessionId,
          updatedAt: session.updatedAt.toISOString(),
        },
      },
    };
  }
  if (
    input.namespace === "recurrence" &&
    VERSIONED_RECURRENCE_CONFIRMATION_TOOLS.has(input.name)
  ) {
    const ruleId = z.string().parse(input.argumentsValue.ruleId);
    const rule = await getRecurrenceRuleForAssistant(ruleId);
    if (!rule) throw new Error("Recurring schedule not found");
    return {
      ...input.argumentsValue,
      __assistantRecurrenceVersion: {
        ruleId,
        updatedAt: rule.updatedAt.toISOString(),
      },
    };
  }
  if (input.namespace === "billing" && input.name === "mark_due_paid") {
    const quote = await getPaymentDueQuote(input.argumentsValue);
    return quote.confirmationArguments as Record<string, unknown>;
  }
  if (
    input.namespace === "billing" &&
    input.name === "send_payment_reminders"
  ) {
    const reminders = z
      .array(z.object({ enrollmentId: z.string(), month: z.string() }))
      .min(1)
      .max(100)
      .parse(input.argumentsValue.reminders);
    const confirmations: Awaited<
      ReturnType<typeof getPaymentReminderConfirmation>
    >[] = [];
    for (let offset = 0; offset < reminders.length; offset += 10) {
      confirmations.push(
        ...(await Promise.all(
          reminders
            .slice(offset, offset + 10)
            .map((reminder) =>
              getPaymentReminderConfirmation(
                reminder.enrollmentId,
                reminder.month,
              ),
            ),
        )),
      );
    }
    const deliveries = reminders.map((reminder, index) => ({
      ...reminder,
      digest: confirmations[index].digest,
    }));
    const recipientLabels = confirmations.map(
      (confirmation) =>
        `${confirmation.recipientName} — ${confirmation.recipientEmail}`,
    );
    const preview = confirmations
      .slice(0, 3)
      .map(
        (confirmation) =>
          `${confirmation.recipientName}: ${confirmation.amount} due for ${confirmation.monthLabel}`,
      )
      .join("\n");
    return {
      ...input.argumentsValue,
      __assistantConfirmation: {
        digest: createHash("sha256")
          .update(JSON.stringify(deliveries))
          .digest("hex"),
        recipientSummary:
          recipientLabels.length <= 3
            ? recipientLabels.join(", ")
            : `${recipientLabels.slice(0, 3).join(", ")} and ${recipientLabels.length - 3} more`,
        subject: `Payment reminders (${reminders.length})`,
        bodyPreview:
          confirmations.length <= 3
            ? preview
            : `${preview}\n…and ${confirmations.length - 3} more.`,
        deliveries,
      },
    };
  }
  if (input.namespace === "billing" && input.name === "send_payment_reminder") {
    const enrollmentId = z.string().parse(input.argumentsValue.enrollmentId);
    const month = z.string().parse(input.argumentsValue.month);
    const confirmation = await getPaymentReminderConfirmation(
      enrollmentId,
      month,
    );
    return {
      ...input.argumentsValue,
      __assistantConfirmation: {
        digest: confirmation.digest,
        recipientSummary: `${confirmation.recipientName} — ${confirmation.recipientEmail}`,
        subject: confirmation.subject,
        amount: confirmation.amount,
        monthLabel: confirmation.monthLabel,
        bodyPreview: confirmation.bodyPreview,
      },
      messagePreview: confirmation.bodyPreview,
    };
  }
  if (input.namespace === "communications" && input.name === "send_email") {
    const parsed = z
      .object({
        studentIds: z.array(z.string()),
        subject: z.string(),
        body: z.string(),
      })
      .parse(input.argumentsValue);
    const confirmation = await getEmailDeliveryConfirmation(parsed);
    const recipients = confirmation.recipients.map(
      (recipient) => `${recipient.name} — ${recipient.email}`,
    );
    return {
      ...input.argumentsValue,
      recipientPreview: confirmation.recipients.map(
        (recipient) => `${recipient.name} — ${recipient.email}`,
      ),
      __assistantConfirmation: {
        digest: confirmation.digest,
        recipientSummary:
          recipients.length <= 3
            ? recipients.join(", ")
            : `${recipients.slice(0, 3).join(", ")} and ${recipients.length - 3} more`,
        subject: parsed.subject,
        bodyPreview: confirmation.bodyPreview,
      },
      messagePreview: confirmation.bodyPreview,
    };
  }
  if (input.namespace === "schedule" && input.name === "mark_attendance") {
    const parsed = z
      .object({
        attendances: z.array(
          z.object({
            studentId: z.string(),
            status: z.string(),
            billable: z.boolean(),
          }),
        ),
      })
      .parse(input.argumentsValue);
    const attendancePreview = await Promise.all(
      parsed.attendances.map(async (attendance) => {
        const student = await getStudentIdentityForAssistant(
          attendance.studentId,
        );
        if (!student) {
          throw new Error(
            "Every attendance entry must reference an available student before approval.",
          );
        }
        return {
          student: `${student.firstName} ${student.lastName}`,
          status: titleCase(attendance.status),
          billable: attendance.billable,
        };
      }),
    );
    return { ...input.argumentsValue, attendancePreview };
  }
  return input.argumentsValue;
}

function safeJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function toolResult(data: unknown, href?: string, card?: AssistantResultCard) {
  const normalizedCard = card ? normalizeAssistantResultCard(card) : undefined;
  if (card && !normalizedCard) {
    throw new Error("Assistant result card could not be rendered safely");
  }
  return safeJson({
    ok: true,
    data: minimizeAssistantDto(safeJson(data)),
    href,
    card: normalizedCard,
  });
}

function mutationToolResult(
  data: unknown,
  href: string,
  card: AssistantResultCard,
) {
  try {
    return toolResult(data, href, card);
  } catch {
    // The write has already committed. Card serialization or normalization is
    // presentation-only and must not make a successful mutation retryable.
    return toolResult(data, href);
  }
}

async function resultAfterMutation(
  fallbackData: unknown,
  href: string,
  enrich: () => Promise<unknown>,
) {
  try {
    return await enrich();
  } catch {
    // The mutation is already committed. A secondary read used only to enrich
    // the chat card must never turn that successful write into a retryable
    // failure and risk executing it again under a new OpenAI call ID.
    return toolResult(fallbackData, href);
  }
}

function requireRecord(value: unknown): ToolArguments {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object");
  }
  return value as ToolArguments;
}

function parsedArguments(spec: AssistantToolSpec, value: unknown) {
  const original = requireRecord(value);
  const parsed = requireRecord(spec.schema.parse(value));
  if (original.__assistantConfirmation) {
    parsed.__assistantConfirmation = assistantConfirmationSnapshotSchema.parse(
      original.__assistantConfirmation,
    );
  }
  if (original.__assistantRecurrenceVersion) {
    parsed.__assistantRecurrenceVersion =
      assistantRecurrenceVersionSchema.parse(
        original.__assistantRecurrenceVersion,
      );
  }
  if (original.__assistantSessionVersion) {
    parsed.__assistantSessionVersion = assistantSessionVersionSchema.parse(
      original.__assistantSessionVersion,
    );
  }
  return parsed;
}

function confirmationSnapshot(args: ToolArguments) {
  return assistantConfirmationSnapshotSchema.parse(
    args.__assistantConfirmation,
  );
}

function confirmedRecurrenceUpdatedAt(
  args: ToolArguments,
  ruleId: string,
  confirmationApproved = true,
) {
  if (!confirmationApproved) return undefined;
  const version = assistantRecurrenceVersionSchema.safeParse(
    args.__assistantRecurrenceVersion,
  );
  if (!version.success || version.data.ruleId !== ruleId) {
    throw new Error(
      "This recurring schedule approval is missing its version. Review it and approve again.",
    );
  }
  return new Date(version.data.updatedAt);
}

function confirmedSessionUpdatedAt(
  args: ToolArguments,
  sessionId: string,
  confirmationApproved?: boolean,
) {
  if (!confirmationApproved) return undefined;
  const version = assistantSessionVersionSchema.safeParse(
    args.__assistantSessionVersion,
  );
  if (!version.success || version.data.sessionId !== sessionId) {
    throw new Error(
      "This session approval is missing its version. Review it and approve again.",
    );
  }
  return new Date(version.data.updatedAt);
}

function stringValue(args: ToolArguments, key: string) {
  return z.string().parse(args[key]);
}

function dateValue(value: unknown) {
  return new Date(isoDateTimeSchema.parse(value));
}

function ageInYears(dateOfBirth: Date, todayKey: string) {
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);
  const birthYear = dateOfBirth.getUTCFullYear();
  const birthMonth = dateOfBirth.getUTCMonth() + 1;
  const birthDay = dateOfBirth.getUTCDate();
  const birthdayHasPassed =
    todayMonth > birthMonth ||
    (todayMonth === birthMonth && todayDay >= birthDay);
  return todayYear - birthYear - (birthdayHasPassed ? 0 : 1);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMoney(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

type StudentCardSource = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  createdAt: Date;
  status: string;
  dob?: Date | null;
  school?: string | null;
  gradeLevel?: string | null;
  guardians?: Array<{
    isPrimary?: boolean;
    guardian: { firstName: string; lastName: string };
  }>;
  enrollments?: Array<{ status: string }>;
  activeEnrollmentCount?: number;
};

async function loadStudentCardSource(id: string) {
  const result = await getStudentForAssistant(id, { page: 1, limit: 20 });
  if (!result) return null;
  return result;
}

async function loadTutorCardSource(id: string) {
  const result = await getTutorForAssistant(id, { page: 1, limit: 20 });
  if (!result) return null;
  return result;
}

async function loadEnrollmentCardSource(id: string) {
  const result = await getEnrollmentForAssistant(id);
  if (!result) return null;
  return result;
}

async function loadGroupCardSource(id: string) {
  const result = await listGroupsForAssistant({
    groupId: id,
    page: 1,
    limit: 1,
  });
  return result.groups[0] ?? null;
}

function studentResultCard(
  student: StudentCardSource,
  subtitle: string,
): AssistantResultCard {
  const fullName = `${student.firstName} ${student.lastName}`;
  const todayKey = getInstantCalendarDateKey(
    new Date(),
    getConfiguredCenterTimeZone(),
  );
  const age = student.dob ? ageInYears(student.dob, todayKey) : null;
  const primaryGuardian =
    student.guardians?.find((item) => item.isPrimary)?.guardian ??
    student.guardians?.[0]?.guardian;
  const hasActiveEnrollment =
    student.activeEnrollmentCount !== undefined
      ? student.activeEnrollmentCount > 0
      : student.enrollments?.some(
          (enrollment) => enrollment.status === "ACTIVE",
        );
  const suggestedActions: AssistantResultCard["suggestedActions"] = [];

  if (!primaryGuardian) {
    suggestedActions.push({
      kind: "PROMPT",
      label: "Add guardian",
      prompt: "Add a guardian to this student.",
    });
  }
  if (!hasActiveEnrollment) {
    suggestedActions.push({
      kind: "PROMPT",
      label: "Enroll in a package",
      prompt: "Enroll this student in a package.",
    });
  }
  suggestedActions.push({ kind: "DISMISS", label: "Done for now" });

  return {
    kind: "STUDENT",
    entityKey: `student:${student.id}`,
    title: fullName,
    subtitle,
    avatar: {
      kind: "STUDENT",
      firstName: student.firstName,
      lastName: student.lastName,
      avatarUrl: student.avatarUrl ?? null,
    },
    badges: [
      {
        label: titleCase(student.status),
        tone:
          student.status === "ACTIVE"
            ? "SUCCESS"
            : student.status === "PAUSED"
              ? "WARNING"
              : "NEUTRAL",
      },
      ...(age === null
        ? []
        : [
            {
              label: `${age} years old`,
              tone: "NEUTRAL" as const,
            },
            {
              label: age < 18 ? "Minor student" : "Adult student",
              tone: "NEUTRAL" as const,
            },
          ]),
    ],
    fields: [
      ...(student.dob
        ? [
            {
              label: "Date of birth",
              value: formatCalendarDate(student.dob),
              icon: "CALENDAR" as const,
            },
          ]
        : []),
      {
        label: "Guardian",
        value: primaryGuardian
          ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}`
          : "No guardian added",
        icon: "GUARDIAN",
      },
      ...(student.school
        ? [
            {
              label: "School",
              value: student.school,
              icon: "GRADUATION" as const,
            },
          ]
        : []),
      ...(student.gradeLevel
        ? [
            {
              label: "Grade",
              value: student.gradeLevel,
              icon: "BOOK" as const,
            },
          ]
        : []),
    ],
    href: `/students?student=${student.id}`,
    actionLabel: `View ${student.firstName}'s record`,
    suggestedActions: suggestedActions.slice(0, 3),
  };
}

type TutorCardSource = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  status: string;
  email: string;
  phone: string;
  hourlyRate: { toString(): string } | string | number;
  subjects?: Array<{ subject: { name: string } }>;
};

function tutorResultCard(
  tutor: TutorCardSource,
  subtitle: string,
): AssistantResultCard {
  const fullName = `${tutor.firstName} ${tutor.lastName}`;
  const hasSubjects = Boolean(tutor.subjects?.length);
  const suggestedActions: AssistantResultCard["suggestedActions"] = [];
  if (!hasSubjects) {
    suggestedActions.push({
      kind: "PROMPT",
      label: "Assign subjects",
      prompt: "Assign subjects to this tutor.",
    });
  }
  suggestedActions.push(
    {
      kind: "PROMPT",
      label: "Create enrollment",
      prompt: "Create an enrollment with this tutor.",
    },
    { kind: "DISMISS", label: "Done for now" },
  );

  return {
    kind: "TUTOR",
    entityKey: `tutor:${tutor.id}`,
    title: fullName,
    subtitle,
    avatar: {
      kind: "TUTOR",
      firstName: tutor.firstName,
      lastName: tutor.lastName,
      avatarUrl: tutor.avatarUrl ?? null,
    },
    badges: [
      {
        label: titleCase(tutor.status),
        tone: tutor.status === "ACTIVE" ? "SUCCESS" : "NEUTRAL",
      },
      ...(hasSubjects
        ? [
            {
              label: `${tutor.subjects!.length} ${
                tutor.subjects!.length === 1 ? "subject" : "subjects"
              }`,
              tone: "NEUTRAL" as const,
            },
          ]
        : []),
    ],
    fields: [
      { label: "Email", value: tutor.email, icon: "MAIL" },
      { label: "Phone", value: tutor.phone, icon: "PHONE" },
      {
        label: "Hourly rate",
        value: `${formatMoney(tutor.hourlyRate.toString())}/hr`,
        icon: "MONEY",
      },
      ...(hasSubjects
        ? [
            {
              label: "Subjects",
              value: tutor
                .subjects!.map((item) => item.subject.name)
                .join(", "),
              icon: "BOOK" as const,
            },
          ]
        : []),
    ],
    href: `/tutors/${tutor.id}`,
    actionLabel: `View ${tutor.firstName}'s record`,
    suggestedActions: suggestedActions.slice(0, 3),
  };
}

type PackageCardSource = {
  id: string;
  name: string;
  type: string;
  lessonType: string;
  basePrice: { toString(): string } | string | number;
  durationMinutes: number;
  sessionsPerWeek?: number | null;
  isActive?: boolean;
  subject?: { name: string } | null;
};

function packageResultCard(
  pkg: PackageCardSource,
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "PACKAGE",
    entityKey: `package:${pkg.id}`,
    title: pkg.name,
    subtitle,
    badges: [
      {
        label: pkg.isActive === false ? "Inactive" : "Active",
        tone: pkg.isActive === false ? "NEUTRAL" : "SUCCESS",
      },
      { label: titleCase(pkg.lessonType), tone: "NEUTRAL" },
    ],
    fields: [
      {
        label: "Price",
        value: formatMoney(pkg.basePrice.toString()),
        icon: "MONEY",
      },
      {
        label: "Duration",
        value: `${pkg.durationMinutes} minutes`,
        icon: "CLOCK",
      },
      {
        label: "Billing",
        value: titleCase(pkg.type),
        icon: "PAYMENT",
      },
      ...(pkg.subject
        ? [
            {
              label: "Subject",
              value: pkg.subject.name,
              icon: "BOOK" as const,
            },
          ]
        : []),
    ],
    href: `/packages/${pkg.id}/edit`,
    actionLabel: "View package",
    suggestedActions: [
      {
        kind: "PROMPT",
        label: "Create enrollment",
        prompt: "Create a student enrollment using this package.",
      },
      { kind: "DISMISS", label: "Done for now" },
    ],
  };
}

type EnrollmentCardSource = {
  id: string;
  status: string;
  startDate: Date;
  priceAtEnrollment: { toString(): string } | string | number;
  customPriceOverride?: { toString(): string } | string | number | null;
  student: {
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  };
  tutor: { firstName: string; lastName: string };
  subject: { name: string };
  package: { name: string; lessonType: string };
};

function enrollmentResultCard(
  enrollment: EnrollmentCardSource,
  subtitle: string,
): AssistantResultCard {
  const studentName = `${enrollment.student.firstName} ${enrollment.student.lastName}`;
  return {
    kind: "ENROLLMENT",
    entityKey: `enrollment:${enrollment.id}`,
    title: `${studentName} · ${enrollment.subject.name}`,
    subtitle,
    avatar: {
      kind: "STUDENT",
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      avatarUrl: enrollment.student.avatarUrl ?? null,
    },
    badges: [
      {
        label: titleCase(enrollment.status),
        tone: enrollment.status === "ACTIVE" ? "SUCCESS" : "NEUTRAL",
      },
      { label: titleCase(enrollment.package.lessonType), tone: "NEUTRAL" },
    ],
    fields: [
      { label: "Package", value: enrollment.package.name, icon: "PACKAGE" },
      {
        label: "Tutor",
        value: `${enrollment.tutor.firstName} ${enrollment.tutor.lastName}`,
        icon: "USER",
      },
      {
        label: "Starts",
        value: formatCalendarDate(enrollment.startDate),
        icon: "CALENDAR",
      },
      {
        label: "Price",
        value: formatMoney(
          enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
        ),
        icon: "MONEY",
      },
    ],
    href: `/enrollments?enrollment=${enrollment.id}`,
    actionLabel: "View enrollment",
    suggestedActions: [
      {
        kind: "PROMPT",
        label: "Build schedule",
        prompt: "Create a schedule for this enrollment.",
      },
      {
        kind: "PROMPT",
        label: "Record payment",
        prompt: "Record a payment for this enrollment.",
      },
      { kind: "DISMISS", label: "Done for now" },
    ],
  };
}

function sessionResultCard(
  session: {
    id: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string | null;
    status?: string;
    tutor?: { firstName: string; lastName: string } | null;
    subject?: { name: string } | null;
    attendance?: Array<{
      student: { firstName: string; lastName: string };
    }>;
    _count?: { attendance: number };
  },
  subtitle: string,
): AssistantResultCard {
  const timeZone = getConfiguredCenterTimeZone();
  const monthKey = getCalendarMonthKey(session.scheduledFor, timeZone);
  const participantNames = [
    ...new Set(
      (session.attendance ?? []).map(
        (attendance) =>
          `${attendance.student.firstName} ${attendance.student.lastName}`,
      ),
    ),
  ];
  const participantSummary =
    (session._count?.attendance ?? participantNames.length) <= 3
      ? participantNames.join(", ")
      : `${participantNames.slice(0, 3).join(", ")} and ${(session._count?.attendance ?? participantNames.length) - 3} more`;
  return {
    kind: "SESSION",
    entityKey: `session:${session.id}`,
    title: session.subject ? `${session.subject.name} session` : "Session",
    subtitle,
    badges: [
      {
        label: titleCase(session.status ?? "SCHEDULED"),
        tone: (session.status ?? "SCHEDULED").startsWith("CANCELLED")
          ? "WARNING"
          : "SUCCESS",
      },
    ],
    fields: [
      {
        label: "Date & time",
        value: formatDateTime(session.scheduledFor, timeZone),
        icon: "CALENDAR",
      },
      {
        label: "Duration",
        value: `${session.durationMinutes} minutes`,
        icon: "CLOCK",
      },
      ...(session.subject
        ? [
            {
              label: "Subject",
              value: session.subject.name,
              icon: "BOOK" as const,
            },
          ]
        : []),
      ...(session.tutor
        ? [
            {
              label: "Tutor",
              value: `${session.tutor.firstName} ${session.tutor.lastName}`,
              icon: "USER" as const,
            },
          ]
        : []),
      ...(session.attendance
        ? [
            {
              label: "Students",
              value:
                participantNames.length > 0
                  ? participantSummary.slice(0, 240)
                  : "No participants recorded",
              icon: "USER" as const,
            },
          ]
        : []),
      ...(session.room
        ? [{ label: "Room", value: session.room, icon: "LOCATION" as const }]
        : []),
    ],
    href: `/schedule?month=${monthKey}&session=${encodeURIComponent(session.id)}`,
    actionLabel: "View schedule",
    suggestedActions: [
      {
        kind: "PROMPT",
        label: "Schedule another",
        prompt: "Schedule another session like this one.",
      },
      { kind: "DISMISS", label: "Done for now" },
    ],
  };
}

function sessionDraftResultCard(
  argumentsValue: Record<string, unknown>,
): AssistantResultCard | undefined {
  const scheduledFor =
    typeof argumentsValue.scheduledFor === "string"
      ? new Date(argumentsValue.scheduledFor)
      : null;
  const durationMinutes = Number(argumentsValue.durationMinutes);
  const studentIds = Array.isArray(argumentsValue.studentIds)
    ? argumentsValue.studentIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (
    !scheduledFor ||
    Number.isNaN(scheduledFor.getTime()) ||
    !Number.isFinite(durationMinutes)
  ) {
    return undefined;
  }
  const timeZone = getConfiguredCenterTimeZone();
  const monthKey = getCalendarMonthKey(scheduledFor, timeZone);
  return {
    kind: "SESSION",
    entityKey: `session-draft:${scheduledFor.toISOString()}:${studentIds
      .slice()
      .sort()
      .join(":")}`,
    title:
      studentIds.length <= 1
        ? "New one-time session"
        : `New session for ${studentIds.length} students`,
    subtitle: "Session extracted from an attachment",
    badges: [{ label: "New session", tone: "WARNING" }],
    fields: [
      {
        label: "Date & time",
        value: formatDateTime(scheduledFor, timeZone),
        icon: "CALENDAR",
      },
      {
        label: "Duration",
        value: `${durationMinutes} minutes`,
        icon: "CLOCK",
      },
      ...(typeof argumentsValue.room === "string" && argumentsValue.room
        ? [
            {
              label: "Room",
              value: argumentsValue.room,
              icon: "LOCATION" as const,
            },
          ]
        : []),
    ],
    href: `/schedule?month=${monthKey}`,
    actionLabel: "View schedule",
    suggestedActions: [],
  };
}

function paymentResultCard(
  payment: {
    id: string;
    amount: { toString(): string } | string | number;
    method: string;
    paidAt: Date;
    coversMonth?: string | null;
  },
  student: Pick<
    StudentCardSource,
    "id" | "firstName" | "lastName" | "avatarUrl"
  >,
  subtitle = "Payment recorded",
  destructive = false,
): AssistantResultCard {
  const fullName = `${student.firstName} ${student.lastName}`;
  return {
    kind: "PAYMENT",
    entityKey: `payment:${payment.id}`,
    title: `${fullName} payment`,
    subtitle,
    avatar: {
      kind: "STUDENT",
      firstName: student.firstName,
      lastName: student.lastName,
      avatarUrl: student.avatarUrl ?? null,
    },
    badges: [
      {
        label: destructive ? "Permanent action" : "Recorded",
        tone: destructive ? "DESTRUCTIVE" : "SUCCESS",
      },
    ],
    fields: [
      {
        label: "Amount",
        value: formatMoney(payment.amount.toString()),
        icon: "MONEY",
      },
      {
        label: "Method",
        value: titleCase(payment.method),
        icon: "PAYMENT",
      },
      {
        label: "Paid on",
        value: formatCalendarDate(payment.paidAt),
        icon: "CALENDAR",
      },
      ...(payment.coversMonth
        ? [
            {
              label: "Covers",
              value: payment.coversMonth,
              icon: "STATUS" as const,
            },
          ]
        : []),
    ],
    href: `/payments?tab=history&studentId=${encodeURIComponent(student.id)}`,
    actionLabel: `View ${student.firstName}'s payment history`,
    suggestedActions: [{ kind: "DISMISS", label: "Done for now" }],
  };
}

function guardianResultCard(
  guardian: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
    email?: string | null;
    phone: string;
    relationship: string;
  },
  studentId: string,
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "GUARDIAN",
    entityKey: `guardian:${guardian.id}`,
    title: `${guardian.firstName} ${guardian.lastName}`,
    subtitle,
    avatar: {
      kind: "GUARDIAN",
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      avatarUrl: guardian.avatarUrl ?? null,
    },
    badges: [{ label: titleCase(guardian.relationship), tone: "NEUTRAL" }],
    fields: [
      { label: "Phone", value: guardian.phone, icon: "PHONE" },
      ...(guardian.email
        ? [{ label: "Email", value: guardian.email, icon: "MAIL" as const }]
        : []),
    ],
    href: `/students?student=${studentId}`,
    actionLabel: "View guardian relationship",
    suggestedActions: [],
  };
}

function subjectResultCard(
  subject: { id: string; name: string; description?: string | null },
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "SUBJECT",
    entityKey: `subject:${subject.id}`,
    title: subject.name,
    subtitle,
    badges: [{ label: "Subject", tone: "NEUTRAL" }],
    fields: subject.description
      ? [{ label: "Description", value: subject.description, icon: "BOOK" }]
      : [],
    href: "/subjects",
    actionLabel: "View subjects",
    suggestedActions: [],
  };
}

function recurrenceResultCard(
  rule: {
    id: string;
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    startsOn: Date;
    endsOn?: Date | null;
    enrollment?: {
      student: { firstName: string; lastName: string };
      subject: { name: string };
    } | null;
    group?: { name: string; subject: { name: string } } | null;
  },
  subtitle: string,
  options?: { linkToRule?: boolean },
): AssistantResultCard {
  const monthKey = getCalendarMonthKey(
    rule.startsOn,
    getConfiguredCenterTimeZone(),
  );
  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 6, 26 + rule.dayOfWeek)));
  const participant = rule.enrollment
    ? `${rule.enrollment.student.firstName} ${rule.enrollment.student.lastName} · ${rule.enrollment.subject.name}`
    : rule.group
      ? `${rule.group.name} · ${rule.group.subject.name}`
      : "Recurring schedule";
  const hasEnded = Boolean(
    rule.endsOn &&
      rule.endsOn.toISOString().slice(0, 10) <
        getInstantCalendarDateKey(
          new Date(),
          getConfiguredCenterTimeZone(),
        ),
  );
  return {
    kind: "SESSION",
    entityKey: `recurrence:${rule.id}`,
    title: participant,
    subtitle,
    badges: [{ label: "Recurring", tone: "WARNING" }],
    fields: [
      { label: "Day", value: dayName, icon: "CALENDAR" },
      { label: "Start time", value: rule.startTime, icon: "CLOCK" },
      {
        label: "Duration",
        value: `${rule.durationMinutes} minutes`,
        icon: "CLOCK",
      },
      {
        label: "Starts",
        value: formatCalendarDate(rule.startsOn),
        icon: "CALENDAR",
      },
    ],
    href:
      options?.linkToRule === false || hasEnded
        ? `/schedule?month=${monthKey}`
        : `/schedule?month=${monthKey}&recurrence=${encodeURIComponent(rule.id)}`,
    actionLabel: "View schedule",
    suggestedActions: [],
  };
}

function emailResultCard(input: {
  entityKey: string;
  title: string;
  subtitle: string;
  subject?: string;
  recipientSummary?: string;
  href?: string;
  actionLabel?: string;
  messagePreview?: string;
}): AssistantResultCard {
  return {
    kind: "EMAIL",
    entityKey: input.entityKey,
    title: input.title,
    subtitle: input.subtitle,
    badges: [{ label: "Outbound email", tone: "WARNING" }],
    fields: [
      ...(input.recipientSummary
        ? [
            {
              label: "Recipients",
              value: input.recipientSummary,
              icon: "USER" as const,
            },
          ]
        : []),
      ...(input.subject
        ? [{ label: "Subject", value: input.subject, icon: "MAIL" as const }]
        : []),
      ...(input.messagePreview
        ? [
            {
              label: "Message",
              value:
                input.messagePreview.length <= 240
                  ? input.messagePreview
                  : `${input.messagePreview.slice(0, 239)}…`,
              icon: "MAIL" as const,
            },
          ]
        : []),
    ],
    href: input.href ?? "/emails",
    actionLabel: input.actionLabel ?? "View email center",
    suggestedActions: [],
  };
}

function emailTemplateResultCard(
  template: {
    id: string;
    name: string;
    subject: string;
    type: string;
  },
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "EMAIL",
    entityKey: `email-template:${template.id}`,
    title: template.name,
    subtitle,
    badges: [{ label: titleCase(template.type), tone: "NEUTRAL" }],
    fields: [{ label: "Subject", value: template.subject, icon: "MAIL" }],
    href: `/emails?tab=templates&template=${encodeURIComponent(template.id)}`,
    actionLabel: `Open ${template.name}`,
    suggestedActions: [],
  };
}

function teamResultCard(input: {
  entityKey: string;
  title: string;
  subtitle: string;
  email: string;
  role?: string;
}): AssistantResultCard {
  return {
    kind: "TEAM",
    entityKey: input.entityKey,
    title: input.title,
    subtitle: input.subtitle,
    badges: [
      {
        label: input.role ? titleCase(input.role) : "Invitation",
        tone: "WARNING",
      },
    ],
    fields: [{ label: "Email", value: input.email, icon: "MAIL" }],
    href: "/team",
    actionLabel: "View team access",
    suggestedActions: [],
  };
}

function groupResultCard(
  group: Awaited<ReturnType<typeof listGroupsForAssistant>>["groups"][number],
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "GROUP",
    entityKey: `group:${group.id}`,
    title: group.name,
    subtitle,
    badges: [
      {
        label: `${group.activeStudentCount} ${
          group.activeStudentCount === 1 ? "student" : "students"
        }`,
        tone: "NEUTRAL",
      },
    ],
    fields: [
      { label: "Subject", value: group.subject.name, icon: "BOOK" },
      {
        label: "Tutor",
        value: group.tutor.name,
        icon: "USER",
      },
    ],
    href: "/enrollments",
    actionLabel: "View groups",
    suggestedActions: [],
  };
}

const ASSISTANT_DRAFT_CARD_TOOLS = new Set([
  "students.create_student",
  "guardians.add_guardian",
  "tutors.create_tutor",
  "catalog.create_subject",
  "catalog.create_package",
  "enrollments.create_enrollment",
  "enrollments.rename_group",
  "schedule.create_one_time_session",
  "recurrence.create_recurring_schedule",
  "communications.create_email_template",
]);

type AssistantCardField = AssistantResultCard["fields"][number];

async function resolveAssistantReferenceFields(
  argumentsValue: Record<string, unknown>,
): Promise<AssistantCardField[]> {
  const fields: AssistantCardField[] = [];
  const stringId = (key: string) =>
    typeof argumentsValue[key] === "string" && argumentsValue[key]
      ? (argumentsValue[key] as string)
      : undefined;
  const stringIds = (key: string) =>
    Array.isArray(argumentsValue[key])
      ? (argumentsValue[key] as unknown[]).filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [];
  const attendanceStudentIds = Array.isArray(argumentsValue.attendances)
    ? argumentsValue.attendances.flatMap((attendance) =>
        attendance &&
        typeof attendance === "object" &&
        !Array.isArray(attendance)
          ? [(attendance as Record<string, unknown>).studentId].filter(
              (item): item is string => typeof item === "string",
            )
          : [],
      )
    : [];
  const studentIds = [
    ...new Set([
      ...(stringId("studentId") ? [stringId("studentId")!] : []),
      ...stringIds("studentIds"),
      ...attendanceStudentIds,
    ]),
  ];
  if (studentIds.length > 0) {
    const students = await Promise.all(
      studentIds.map(getStudentIdentityForAssistant),
    );
    if (students.some((student) => !student)) {
      throw new Error("A referenced student no longer exists");
    }
    fields.push({
      label: studentIds.length === 1 ? "Student" : "Students",
      value: students
        .map((student) => `${student!.firstName} ${student!.lastName}`)
        .join(", "),
      icon: "USER",
    });
  }

  const tutorId = stringId("tutorId");
  if (tutorId) {
    const tutor = await loadTutorCardSource(tutorId);
    if (!tutor) throw new Error("The referenced tutor no longer exists");
    fields.push({
      label: "Tutor",
      value: `${tutor.firstName} ${tutor.lastName}`,
      icon: "USER",
    });
  }

  const subjectIds = [
    ...new Set([
      ...(stringId("subjectId") ? [stringId("subjectId")!] : []),
      ...stringIds("subjectIds"),
    ]),
  ];
  if (subjectIds.length > 0) {
    const subjects = await Promise.all(subjectIds.map(getSubject));
    if (subjects.some((subject) => !subject)) {
      throw new Error("A referenced subject no longer exists");
    }
    fields.push({
      label: subjectIds.length === 1 ? "Subject" : "Subjects",
      value: subjects.map((subject) => subject!.name).join(", "),
      icon: "BOOK",
    });
  }

  const packageId = stringId("packageId");
  if (packageId) {
    const pkg = await getPackage(packageId);
    if (!pkg) throw new Error("The referenced package no longer exists");
    fields.push({ label: "Package", value: pkg.name, icon: "PACKAGE" });
  }

  const enrollmentId = stringId("enrollmentId");
  if (enrollmentId) {
    const enrollment = await loadEnrollmentCardSource(enrollmentId);
    if (!enrollment) {
      throw new Error("The referenced enrollment no longer exists");
    }
    fields.push({
      label: "Enrollment",
      value: `${enrollment.student.firstName} ${enrollment.student.lastName} — ${enrollment.subject.name}`,
      icon: "BOOK",
    });
  }

  const groupId = stringId("groupId");
  if (groupId) {
    const group = await loadGroupCardSource(groupId);
    if (!group) throw new Error("The referenced group no longer exists");
    fields.push({ label: "Group", value: group.name, icon: "USER" });
  }
  return fields;
}

export async function enrichAssistantConfirmationCard(
  card: AssistantResultCard,
  argumentsValue: Record<string, unknown>,
): Promise<AssistantResultCard> {
  const resolvedFields = await resolveAssistantReferenceFields(argumentsValue);
  const proposedFields = resolvedFields.flatMap((field) => {
    const comparableLabel = (label: string) =>
      label.toLocaleLowerCase().replace(/s$/, "");
    const current = card.fields.find(
      (existing) =>
        comparableLabel(existing.label) === comparableLabel(field.label),
    );
    if (!current) return [field];
    if (current.value === field.value) return [];
    return [
      {
        ...field,
        label: `Selected ${field.label.toLocaleLowerCase()}`,
      },
    ];
  });
  return {
    ...card,
    // Referenced targets are approval-critical. Put them before presentation
    // details so the six-field card bound can never trim away an enrollment,
    // student, tutor, subject, package, or group being changed.
    fields: [...proposedFields, ...card.fields].slice(0, 6),
  };
}

export async function getAssistantMutationDraftCard(
  spec: Pick<AssistantToolSpec, "namespace" | "name" | "description">,
  argumentsValue: Record<string, unknown>,
): Promise<AssistantResultCard | undefined> {
  if (!ASSISTANT_DRAFT_CARD_TOOLS.has(`${spec.namespace}.${spec.name}`)) {
    return undefined;
  }
  const text = (key: string) =>
    typeof argumentsValue[key] === "string"
      ? (argumentsValue[key] as string)
      : undefined;
  const fullName = [text("firstName"), text("lastName")]
    .filter(Boolean)
    .join(" ");
  const kindAndPath: Record<
    string,
    { kind: AssistantResultCard["kind"]; href: string }
  > = {
    students: { kind: "STUDENT", href: "/students" },
    guardians: { kind: "GUARDIAN", href: "/students" },
    tutors: { kind: "TUTOR", href: "/tutors" },
    catalog: {
      kind: spec.name.includes("package") ? "PACKAGE" : "SUBJECT",
      href: spec.name.includes("package") ? "/packages" : "/subjects",
    },
    enrollments: { kind: "ENROLLMENT", href: "/enrollments" },
    schedule: { kind: "SESSION", href: "/schedule" },
    recurrence: { kind: "SESSION", href: "/schedule" },
    billing: { kind: "PAYMENT", href: "/payments" },
    communications: { kind: "EMAIL", href: "/emails" },
    team: { kind: "TEAM", href: "/team" },
  };
  const presentation = kindAndPath[spec.namespace] ?? {
    kind: "ENROLLMENT" as const,
    href: "/dashboard",
  };
  const candidateFields: Array<AssistantResultCard["fields"][number] | null> = [
    text("name")
      ? { label: "Name", value: text("name")!, icon: "STATUS" }
      : null,
    text("subject")
      ? { label: "Subject", value: text("subject")!, icon: "MAIL" }
      : null,
    text("dob")
      ? { label: "Date of birth", value: text("dob")!, icon: "CALENDAR" }
      : null,
    text("startDate")
      ? { label: "Start date", value: text("startDate")!, icon: "CALENDAR" }
      : null,
    text("amount")
      ? { label: "Amount", value: formatMoney(text("amount")), icon: "MONEY" }
      : null,
    text("status")
      ? { label: "Status", value: titleCase(text("status")!), icon: "STATUS" }
      : null,
  ];

  return enrichAssistantConfirmationCard(
    {
      kind: presentation.kind,
      entityKey: `draft:${spec.namespace}:${spec.name}`,
      title:
        fullName ||
        text("name") ||
        spec.description.split(".")[0] ||
        "Proposed CRM change",
      subtitle: "Proposed change derived from untrusted evidence",
      badges: [{ label: "Review required", tone: "WARNING" }],
      fields: candidateFields.filter(
        (field): field is AssistantResultCard["fields"][number] =>
          Boolean(field),
      ),
      href: presentation.href,
      actionLabel: "Open manual workspace",
      suggestedActions: [],
    },
    argumentsValue,
  );
}

export async function getAssistantConfirmationCard(input: {
  namespace: string;
  name: string;
  argumentsValue: Record<string, unknown>;
}): Promise<AssistantResultCard | undefined> {
  const { namespace, name, argumentsValue } = input;
  const value = (key: string) =>
    typeof argumentsValue[key] === "string"
      ? (argumentsValue[key] as string)
      : undefined;

  if (namespace === "students") {
    const studentId = value("id");
    if (!studentId) return undefined;
    const student = await loadStudentCardSource(studentId);
    if (!student) return undefined;
    const subtitle =
      name === "delete_student"
        ? "Student selected for permanent deletion"
        : name === "archive_student"
          ? "Student selected for archiving"
          : "Student affected by this change";
    return studentResultCard(student, subtitle);
  }

  if (namespace === "guardians") {
    const studentId = value("studentId");
    const guardianId = value("guardianId");
    if (!studentId || !guardianId) return undefined;
    const link = await getLinkedGuardianForAssistant(studentId, guardianId);
    const guardian = link?.guardian;
    const subtitle =
      name === "remove_guardian"
        ? "Guardian relationship selected for removal"
        : "Guardian affected by this change";
    return guardian
      ? guardianResultCard(guardian, studentId, subtitle)
      : undefined;
  }

  if (namespace === "tutors") {
    const tutorId = value("id");
    if (!tutorId) return undefined;
    const tutor = await loadTutorCardSource(tutorId);
    const subtitle =
      name === "archive_tutor"
        ? "Tutor selected for archiving"
        : name === "set_tutor_subjects"
          ? "Tutor subject assignment affected by this change"
          : "Tutor affected by this change";
    return tutor ? tutorResultCard(tutor, subtitle) : undefined;
  }

  if (namespace === "catalog") {
    const id = value("id");
    if (!id) return undefined;
    if (name === "delete_subject" || name === "update_subject") {
      const subject = await getSubject(id);
      return subject
        ? subjectResultCard(
            subject,
            name === "delete_subject"
              ? "Subject selected for permanent deletion"
              : "Subject affected by this change",
          )
        : undefined;
    }
    const pkg = await getPackage(id);
    const subtitle =
      name === "set_package_active"
        ? argumentsValue.isActive === false
          ? "Package selected for deactivation"
          : "Package selected for activation"
        : "Package affected by this change";
    return pkg ? packageResultCard(pkg, subtitle) : undefined;
  }

  if (namespace === "enrollments") {
    if (name === "remove_discount") {
      const discountId = value("discountId");
      if (!discountId) return undefined;
      const discount = await getDiscountForAssistant(discountId);
      const enrollment = discount?.enrollmentId
        ? await loadEnrollmentCardSource(discount.enrollmentId)
        : null;
      return discount && enrollment
        ? enrollmentResultCard(
            enrollment,
            `${titleCase(discount.kind)} discount selected for removal`,
          )
        : undefined;
    }
    const enrollmentId = value("id") ?? value("enrollmentId");
    if (!enrollmentId) return undefined;
    const enrollment = await loadEnrollmentCardSource(enrollmentId);
    return enrollment
      ? enrollmentResultCard(enrollment, "Enrollment affected by this change")
      : undefined;
  }

  if (namespace === "schedule") {
    const sessionId = value("sessionId");
    if (sessionId) {
      const session = await getSessionForAssistant(sessionId);
      return session
        ? sessionResultCard(session, "Session affected by this change")
        : undefined;
    }
    const enrollmentId = value("enrollmentId");
    if (enrollmentId) {
      const enrollment = await loadEnrollmentCardSource(enrollmentId);
      return enrollment
        ? enrollmentResultCard(enrollment, "New session from attached schedule")
        : undefined;
    }
    const groupId = value("groupId");
    if (groupId) {
      const group = await loadGroupCardSource(groupId);
      return group
        ? groupResultCard(group, "New group session from attached schedule")
        : undefined;
    }
    const studentIds = Array.isArray(argumentsValue.studentIds)
      ? argumentsValue.studentIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    if (studentIds.length === 1) {
      const student = await loadStudentCardSource(studentIds[0]);
      return student
        ? studentResultCard(student, "New session from attached schedule")
        : undefined;
    }
    return sessionDraftResultCard(argumentsValue);
  }

  if (namespace === "billing") {
    if (name === "delete_payment") {
      const paymentId = value("paymentId");
      if (!paymentId) return undefined;
      const payment = await getPaymentForAssistantConfirmation(paymentId);
      return payment
        ? paymentResultCard(
            payment,
            payment.student,
            "Payment selected for permanent deletion",
            true,
          )
        : undefined;
    }
    if (name === "send_payment_reminder") {
      const enrollmentId = value("enrollmentId");
      if (!enrollmentId) return undefined;
      const confirmation = assistantConfirmationSnapshotSchema.safeParse(
        argumentsValue.__assistantConfirmation,
      );
      if (!confirmation.success) return undefined;
      return emailResultCard({
        entityKey: `payment-reminder:${enrollmentId}:${value("month") ?? "period"}`,
        title: `Payment reminder for ${confirmation.data.monthLabel ?? value("month") ?? "billing period"}`,
        subtitle: confirmation.data.amount
          ? `$${confirmation.data.amount} due — awaiting approval`
          : "Outbound reminder awaiting approval",
        recipientSummary: confirmation.data.recipientSummary,
        subject: confirmation.data.subject,
        messagePreview: confirmation.data.bodyPreview,
        href: "/payments",
        actionLabel: "View payments",
      });
    }
    if (name === "send_payment_reminders") {
      const reminders = Array.isArray(argumentsValue.reminders)
        ? argumentsValue.reminders
        : [];
      const confirmation = assistantConfirmationSnapshotSchema.safeParse(
        argumentsValue.__assistantConfirmation,
      );
      if (!confirmation.success || reminders.length === 0) return undefined;
      return emailResultCard({
        entityKey: `payment-reminder-batch:${confirmation.data.digest}`,
        title: `Send ${reminders.length} payment reminders`,
        subtitle: "Outbound reminder batch awaiting approval",
        recipientSummary: confirmation.data.recipientSummary,
        subject: confirmation.data.subject,
        messagePreview: confirmation.data.bodyPreview,
        href: "/payments",
        actionLabel: "View payments",
      });
    }
    const studentId = value("studentId");
    if (!studentId) return undefined;
    const student = await loadStudentCardSource(studentId);
    if (name === "mark_due_paid") {
      return student
        ? studentResultCard(
            student,
            `Record ${formatMoney(value("amount"))} for ${value("month") ?? "the billing period"}`,
          )
        : undefined;
    }
    return student
      ? studentResultCard(student, "Payment action for this student")
      : undefined;
  }

  if (namespace === "recurrence") {
    const ruleId = value("ruleId");
    if (ruleId) {
      const rule = await getRecurrenceRuleForAssistant(ruleId);
      return rule
        ? recurrenceResultCard(rule, "Recurring schedule affected")
        : undefined;
    }
    const enrollmentId = value("enrollmentId");
    if (enrollmentId) {
      const enrollment = await loadEnrollmentCardSource(enrollmentId);
      return enrollment
        ? enrollmentResultCard(enrollment, "Recurring schedule affected")
        : undefined;
    }
    const groupId = value("groupId");
    if (groupId) {
      const group = await loadGroupCardSource(groupId);
      return group
        ? groupResultCard(group, "Recurring schedule affected")
        : undefined;
    }
    return undefined;
  }

  if (namespace === "communications") {
    if (name === "delete_email_template" || name === "update_email_template") {
      const templateId = value("id");
      if (!templateId) return undefined;
      const template = await getEmailTemplate(templateId);
      return template
        ? emailResultCard({
            entityKey: `email-template:${template.id}`,
            title: template.name,
            subtitle:
              name === "delete_email_template"
                ? "Template selected for permanent deletion"
                : "Template affected by this change",
            subject: template.subject,
          })
        : undefined;
    }
    const studentIds = Array.isArray(argumentsValue.studentIds)
      ? argumentsValue.studentIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    if (studentIds.length === 0) return undefined;
    const confirmation = assistantConfirmationSnapshotSchema.safeParse(
      argumentsValue.__assistantConfirmation,
    );
    if (!confirmation.success) return undefined;
    return emailResultCard({
      entityKey: `email-send:${confirmation.data.digest}`,
      title:
        studentIds.length === 1
          ? "Email 1 student"
          : `Email ${studentIds.length} students`,
      subtitle: "Outbound message awaiting approval",
      subject: confirmation.data.subject,
      recipientSummary: confirmation.data.recipientSummary,
      messagePreview: confirmation.data.bodyPreview,
    });
  }

  if (namespace === "team") {
    if (name === "invite_team_member") {
      const email = value("email");
      return email
        ? teamResultCard({
            entityKey: `team-invite:${email}`,
            title: email,
            subtitle: "New team invitation",
            email,
            role: "STAFF",
          })
        : undefined;
    }
    if (name === "revoke_team_invitation") {
      const invitationId = value("invitationId");
      const invitation = invitationId
        ? await getPendingTeamInvitation({ invitationId })
        : undefined;
      return invitation
        ? teamResultCard({
            entityKey: `team-invitation:${invitation.id}`,
            title: invitation.emailAddress,
            subtitle: "Pending invitation selected for revocation",
            email: invitation.emailAddress,
          })
        : undefined;
    }
    const adminId = value("adminId");
    const admin = adminId ? await getTeamAdminForAssistant(adminId) : undefined;
    if (!admin) return undefined;
    return teamResultCard({
      entityKey: `team-admin:${admin.id}`,
      title: admin.name,
      subtitle:
        name === "remove_team_member"
          ? "Team member selected for removal"
          : `Change role to ${titleCase(value("role") ?? "")}`,
      email: admin.email,
      role: admin.role,
    });
  }

  return undefined;
}

async function executeStudents(name: string, args: ToolArguments) {
  switch (name) {
    case "search_students": {
      const result = await listStudents({
        search: args.query as string | undefined,
        status: args.status as "ACTIVE" | "PAUSED" | "INACTIVE" | undefined,
        page: Number(args.page),
        pageSize: Number(args.limit ?? 10),
      });
      return toolResult({
        total: result.total,
        page: result.page,
        limit: result.pageSize,
        hasMore: result.page * result.pageSize < result.total,
        students: result.students.map((student) => ({
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          status: student.status,
          email: student.email,
          phone: student.phone,
          dateOfBirth: student.dob?.toISOString().slice(0, 10) ?? null,
          school: student.school,
          gradeLevel: student.gradeLevel,
          createdAt: student.createdAt,
          updatedAt: student.updatedAt,
          primaryGuardian: student.guardians[0]
            ? {
                id: student.guardians[0].guardian.id,
                name: `${student.guardians[0].guardian.firstName} ${student.guardians[0].guardian.lastName}`,
                email: student.guardians[0].guardian.email,
                phone: student.guardians[0].guardian.phone,
              }
            : null,
          href: `/students?student=${student.id}`,
        })),
      });
    }
    case "query_student_directory": {
      const result = await queryStudentDirectory(
        args as Parameters<typeof queryStudentDirectory>[0],
      );
      const todayKey = getInstantCalendarDateKey(
        new Date(),
        getConfiguredCenterTimeZone(),
      );
      return toolResult(
        {
          matchingStudentCount: result.matchingCount,
          rankedStudentCount: result.rankedCount,
          missingDateOfBirthCount: result.missingDateOfBirthCount,
          page: result.page,
          limit: result.limit,
          hasMore: result.hasMore,
          topRankTieCount: result.topRankTieCount,
          topRankTiesTruncated: result.topRankTiesTruncated,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
          students: result.students.map((student) => ({
            id: student.id,
            name: `${student.firstName} ${student.lastName}`,
            status: student.status,
            dateOfBirth: student.dob?.toISOString().slice(0, 10) ?? null,
            ageYears: student.dob ? ageInYears(student.dob, todayKey) : null,
            school: student.school,
            gradeLevel: student.gradeLevel,
            createdAt: student.createdAt,
            updatedAt: student.updatedAt,
            href: `/students?student=${student.id}`,
          })),
        },
        "/students",
      );
    }
    case "get_student": {
      const id = stringValue(args, "id");
      const page = Number(args.page);
      const limit = Number(args.limit);
      const result = await getStudentForAssistant(id, { page, limit });
      if (!result) throw new Error("Student not found");
      const { _count, ...student } = result;
      return toolResult(
        {
          ...student,
          page,
          limit,
          guardianTotal: _count.guardians,
          enrollmentTotal: _count.enrollments,
          hasMoreGuardians: page * limit < _count.guardians,
          hasMoreEnrollments: page * limit < _count.enrollments,
        },
        `/students?student=${id}`,
        page === 1 ? studentResultCard(student, "Student record") : undefined,
      );
    }
    case "create_student": {
      const created = await createStudentWithGuardian(args as never);
      const href = `/students?student=${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const student = await loadStudentCardSource(created.id);
        if (!student) throw new Error("Created student could not be loaded");
        return toolResult(
          { id: student.id, name: `${student.firstName} ${student.lastName}` },
          href,
          studentResultCard(
            student,
            `Student created ${formatCalendarDate(student.createdAt)}`,
          ),
        );
      });
    }
    case "update_student": {
      const id = stringValue(args, "id");
      const current = await getStudentProfileForAssistantMutation(id);
      if (!current) throw new Error("Student not found");
      const updated = await updateStudentProfile(id, {
        firstName: (args.firstName as string | undefined) ?? current.firstName,
        lastName: (args.lastName as string | undefined) ?? current.lastName,
        avatarUrl:
          (args.avatarUrl as string | undefined) ?? current.avatarUrl ?? "",
        avatarPublicId:
          (args.avatarPublicId as string | undefined) ??
          current.avatarPublicId ??
          undefined,
        dob:
          (args.dob as string | undefined) ??
          current.dob?.toISOString().slice(0, 10) ??
          "",
        email: (args.email as string | undefined) ?? current.email ?? "",
        phone: (args.phone as string | undefined) ?? current.phone ?? "",
        school: (args.school as string | undefined) ?? current.school ?? "",
        gradeLevel:
          (args.gradeLevel as string | undefined) ?? current.gradeLevel ?? "",
        notes: (args.notes as string | undefined) ?? current.notes ?? "",
      });
      const href = `/students?student=${id}`;
      return resultAfterMutation({ id: updated.id }, href, async () => {
        const student = await loadStudentCardSource(updated.id);
        if (!student) throw new Error("Updated student could not be loaded");
        return toolResult(
          { id: updated.id },
          href,
          studentResultCard(student, "Student details updated"),
        );
      });
    }
    case "set_student_status": {
      const updated = await updateStudentStatusById(
        stringValue(args, "id"),
        z.enum(["ACTIVE", "PAUSED", "INACTIVE"]).parse(args.status),
      );
      const href = `/students?student=${updated.id}`;
      return resultAfterMutation(
        { id: updated.id, status: updated.status },
        href,
        async () => {
          const student = await loadStudentCardSource(updated.id);
          if (!student) throw new Error("Updated student could not be loaded");
          return toolResult(
            { id: updated.id, status: updated.status },
            href,
            studentResultCard(student, "Student status updated"),
          );
        },
      );
    }
    case "archive_student": {
      const updated = await archiveStudentById(stringValue(args, "id"));
      return toolResult(
        { id: updated.id, status: updated.status },
        "/students",
      );
    }
    case "delete_student": {
      const deleted = await deleteStudentById(stringValue(args, "id"));
      return toolResult({ id: deleted.id, deleted: true }, "/students");
    }
    default:
      throw new Error(`Unknown students tool: ${name}`);
  }
}

async function executeGuardians(name: string, args: ToolArguments) {
  const studentId = stringValue(args, "studentId");
  switch (name) {
    case "get_guardian": {
      const guardianId = stringValue(args, "guardianId");
      const link = await getLinkedGuardianForAssistant(studentId, guardianId);
      if (!link) throw new Error("Guardian is not linked to this student");
      return toolResult(link, `/students?student=${studentId}`);
    }
    case "add_guardian": {
      const guardian = { ...args };
      delete guardian.studentId;
      const created = await addGuardianToStudent(studentId, guardian as never);
      const href = `/students?student=${studentId}`;
      return resultAfterMutation(
        { id: created.id, studentId },
        href,
        async () => {
          const student = await loadStudentCardSource(studentId);
          if (!student) throw new Error("Student not found");
          return toolResult(
            { id: created.id, studentId },
            href,
            studentResultCard(student, "Guardian added"),
          );
        },
      );
    }
    case "update_guardian": {
      const guardianId = stringValue(args, "guardianId");
      const guardian = { ...args };
      delete guardian.studentId;
      delete guardian.guardianId;
      const updated = await updateGuardianDetails(
        guardianId,
        studentId,
        guardian as never,
      );
      const href = `/students?student=${studentId}`;
      return resultAfterMutation(
        { id: updated.id, studentId },
        href,
        async () => {
          const student = await loadStudentCardSource(studentId);
          if (!student) throw new Error("Student not found");
          return toolResult(
            { id: updated.id, studentId },
            href,
            studentResultCard(student, "Guardian details updated"),
          );
        },
      );
    }
    case "remove_guardian": {
      const guardianId = stringValue(args, "guardianId");
      await removeGuardianFromStudent(studentId, guardianId);
      return toolResult(
        { guardianId, studentId, removed: true },
        `/students?student=${studentId}`,
      );
    }
    default:
      throw new Error(`Unknown guardians tool: ${name}`);
  }
}

async function executeTutors(name: string, args: ToolArguments) {
  switch (name) {
    case "search_tutors": {
      const result = await listTutors({
        search: args.query as string | undefined,
        status: args.status as "ACTIVE" | "PAUSED" | "INACTIVE" | undefined,
        subjectId: args.subjectId as string | undefined,
        page: Number(args.page),
        pageSize: Number(args.limit ?? 10),
      });
      return toolResult({
        total: result.total,
        page: result.page,
        limit: result.pageSize,
        hasMore: result.page * result.pageSize < result.total,
        tutors: result.tutors.map((tutor) => ({
          id: tutor.id,
          name: `${tutor.firstName} ${tutor.lastName}`,
          status: tutor.status,
          email: tutor.email,
          phone: tutor.phone,
          hourlyRate: tutor.hourlyRate.toString(),
          subjects: tutor.subjects.map((item) => ({
            id: item.subject.id,
            name: item.subject.name,
          })),
          href: `/tutors/${tutor.id}`,
        })),
      });
    }
    case "get_tutor": {
      const id = stringValue(args, "id");
      const page = Number(args.page);
      const limit = Number(args.limit);
      const result = await getTutorForAssistant(id, { page, limit });
      if (!result) throw new Error("Tutor not found");
      const { _count, ...tutor } = result;
      return toolResult(
        {
          ...tutor,
          page,
          limit,
          subjectTotal: _count.subjects,
          enrollmentTotal: _count.enrollments,
          hasMoreSubjects: page * limit < _count.subjects,
          hasMoreEnrollments: page * limit < _count.enrollments,
        },
        `/tutors/${id}`,
        page === 1 ? tutorResultCard(tutor, "Tutor record") : undefined,
      );
    }
    case "create_tutor": {
      const created = await createTutorWithSubjects(args as never);
      const href = `/tutors/${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const tutor = await loadTutorCardSource(created.id);
        if (!tutor) throw new Error("Created tutor could not be loaded");
        return toolResult(
          { id: tutor.id, name: `${tutor.firstName} ${tutor.lastName}` },
          href,
          tutorResultCard(tutor, "Tutor created"),
        );
      });
    }
    case "update_tutor": {
      const id = stringValue(args, "id");
      const current = await getTutorProfileForAssistantMutation(id);
      if (!current) throw new Error("Tutor not found");
      const updated = await updateTutorProfile(id, {
        firstName: (args.firstName as string | undefined) ?? current.firstName,
        lastName: (args.lastName as string | undefined) ?? current.lastName,
        avatarUrl:
          (args.avatarUrl as string | undefined) ?? current.avatarUrl ?? "",
        avatarPublicId:
          (args.avatarPublicId as string | undefined) ??
          current.avatarPublicId ??
          undefined,
        email: (args.email as string | undefined) ?? current.email,
        phone: (args.phone as string | undefined) ?? current.phone,
        hourlyRate:
          (args.hourlyRate as string | undefined) ??
          current.hourlyRate.toString(),
        notes: (args.notes as string | undefined) ?? current.notes ?? "",
      });
      const href = `/tutors/${id}`;
      return resultAfterMutation({ id: updated.id }, href, async () => {
        const tutor = await loadTutorCardSource(updated.id);
        if (!tutor) throw new Error("Updated tutor could not be loaded");
        return toolResult(
          { id: updated.id },
          href,
          tutorResultCard(tutor, "Tutor details updated"),
        );
      });
    }
    case "set_tutor_subjects": {
      const id = stringValue(args, "id");
      await updateTutorSubjectsList(
        id,
        z.array(z.string()).parse(args.subjectIds),
      );
      const href = `/tutors/${id}`;
      return resultAfterMutation(
        { id, subjectIds: args.subjectIds },
        href,
        async () => {
          const tutor = await loadTutorCardSource(id);
          if (!tutor) throw new Error("Tutor not found");
          return toolResult(
            { id, subjectIds: args.subjectIds },
            href,
            tutorResultCard(tutor, "Tutor subjects updated"),
          );
        },
      );
    }
    case "archive_tutor": {
      const tutor = await archiveTutorById(stringValue(args, "id"));
      return mutationToolResult(
        { id: tutor.id, status: tutor.status },
        `/tutors/${tutor.id}`,
        tutorResultCard(tutor, "Tutor archived"),
      );
    }
    case "get_tutor_payroll": {
      const id = stringValue(args, "id");
      const payroll = await getTutorPayrollForAssistant(
        id,
        dateValue(args.from),
        dateValue(args.to),
        Number(args.limit),
      );
      if (!payroll) throw new Error("Tutor not found");
      return toolResult(payroll, `/tutors/${id}`);
    }
    default:
      throw new Error(`Unknown tutors tool: ${name}`);
  }
}

async function executeCatalog(name: string, args: ToolArguments) {
  switch (name) {
    case "list_subjects": {
      return toolResult(
        await listSubjectsForAssistant({
          id: args.id as string | undefined,
          page: Number(args.page),
          limit: Number(args.limit),
        }),
        "/subjects",
      );
    }
    case "create_subject": {
      const subject = await createSubjectOffering(args as never);
      return mutationToolResult(
        subject,
        "/subjects",
        subjectResultCard(subject, "Subject created"),
      );
    }
    case "update_subject": {
      const id = stringValue(args, "id");
      const subject = await getSubject(id);
      if (!subject) throw new Error("Subject not found");
      const updated = await updateSubjectOffering(id, {
        name: (args.name as string | undefined) ?? subject.name,
        description:
          (args.description as string | undefined) ?? subject.description ?? "",
      });
      return mutationToolResult(
        updated,
        "/subjects",
        subjectResultCard(updated, "Subject updated"),
      );
    }
    case "delete_subject": {
      const id = stringValue(args, "id");
      const subject = await getSubject(id);
      if (!subject) throw new Error("Subject not found");
      const deleted = await deleteSubjectOffering(id);
      return mutationToolResult(
        { id: deleted.id, deleted: true },
        "/subjects",
        subjectResultCard(subject, "Subject deleted"),
      );
    }
    case "list_packages": {
      const result = await listPackagesForAssistant({
        activeOnly: Boolean(args.activeOnly),
        page: Number(args.page),
        limit: Number(args.limit),
      });
      return toolResult(
        {
          ...result,
          packages: result.packages.map((pkg) => ({
            id: pkg.id,
            name: pkg.name,
            type: pkg.type,
            billingPeriod: pkg.billingPeriod,
            lessonType: pkg.lessonType,
            subject: pkg.subject
              ? { id: pkg.subject.id, name: pkg.subject.name }
              : null,
            basePrice: pkg.basePrice.toString(),
            sessionsPerWeek: pkg.sessionsPerWeek,
            durationMinutes: pkg.durationMinutes,
            isActive: pkg.isActive,
          })),
        },
        "/packages",
      );
    }
    case "get_package": {
      const id = stringValue(args, "id");
      const pkg = await getPackage(id);
      if (!pkg) throw new Error("Package not found");
      return toolResult(
        pkg,
        `/packages/${id}/edit`,
        packageResultCard(pkg, "Package details"),
      );
    }
    case "create_package": {
      const created = await createPackageOffering(args as never);
      const href = `/packages/${created.id}/edit`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const pkg = await getPackage(created.id);
        if (!pkg) throw new Error("Created package could not be loaded");
        return toolResult(pkg, href, packageResultCard(pkg, "Package created"));
      });
    }
    case "update_package": {
      const id = stringValue(args, "id");
      const current = await getPackage(id);
      if (!current) throw new Error("Package not found");
      const updated = await updatePackageOffering(id, {
        name: (args.name as string | undefined) ?? current.name,
        type:
          (args.type as "MONTHLY" | "PER_SESSION" | undefined) ?? current.type,
        billingPeriod:
          (args.billingPeriod as
            "MONTHLY" | "THREE_MONTHS" | "YEARLY" | undefined) ??
          current.billingPeriod,
        lessonType:
          (args.lessonType as "PRIVATE" | "GROUP" | undefined) ??
          current.lessonType,
        subjectId:
          args.subjectId === undefined
            ? (current.subjectId ?? "")
            : (args.subjectId as string),
        basePrice:
          (args.basePrice as string | undefined) ??
          current.basePrice.toString(),
        sessionsPerWeek:
          args.sessionsPerWeek === undefined
            ? (current.sessionsPerWeek?.toString() ?? "")
            : (args.sessionsPerWeek as string),
        durationMinutes:
          (args.durationMinutes as string | undefined) ??
          current.durationMinutes.toString(),
      });
      const href = `/packages/${id}/edit`;
      return resultAfterMutation({ id: updated.id }, href, async () => {
        const pkg = await getPackage(updated.id);
        if (!pkg) throw new Error("Updated package could not be loaded");
        return toolResult(pkg, href, packageResultCard(pkg, "Package updated"));
      });
    }
    case "set_package_active": {
      const updated = await setPackageActive(
        stringValue(args, "id"),
        z.boolean().parse(args.isActive),
      );
      const href = `/packages/${updated.id}/edit`;
      return resultAfterMutation(
        { id: updated.id, isActive: updated.isActive },
        href,
        async () => {
          const pkg = await getPackage(updated.id);
          if (!pkg) throw new Error("Updated package could not be loaded");
          return toolResult(
            pkg,
            href,
            packageResultCard(
              pkg,
              pkg.isActive ? "Package activated" : "Package deactivated",
            ),
          );
        },
      );
    }
    default:
      throw new Error(`Unknown catalog tool: ${name}`);
  }
}

async function executeEnrollments(name: string, args: ToolArguments) {
  switch (name) {
    case "search_enrollments":
      return toolResult(
        await searchEnrollmentsForAssistant({
          studentId: args.studentId as string | undefined,
          tutorId: args.tutorId as string | undefined,
          groupId: args.groupId as string | undefined,
          status: args.status as never,
          page: Number(args.page),
          limit: Number(args.limit ?? 20),
        }),
        "/enrollments",
      );
    case "get_enrollment": {
      const discountPage = Number(args.discountPage);
      const discountLimit = Number(args.discountLimit);
      const discountId = args.discountId as string | undefined;
      if (discountId) {
        const discount = await getDiscountForAssistant(discountId);
        if (!discount?.enrollmentId) throw new Error("Discount not found");
        const result = await getEnrollmentForAssistant(
          discount.enrollmentId,
          discountPage,
          discountLimit,
        );
        if (!result) throw new Error("Enrollment not found");
        const { _count, ...enrollment } = result;
        return toolResult(
          {
            discount,
            enrollment: {
              ...enrollment,
              discountTotal: _count.discounts,
              sessionTotal: _count.sessions,
              paymentTotal: _count.payments,
              hasMoreDiscounts: discountPage * discountLimit < _count.discounts,
              discountPage,
              discountLimit,
            },
          },
          `/enrollments?enrollment=${enrollment.id}`,
          enrollmentResultCard(enrollment, "Enrollment and discount details"),
        );
      }
      const id = stringValue(args, "id");
      const result = await getEnrollmentForAssistant(
        id,
        discountPage,
        discountLimit,
      );
      if (!result) throw new Error("Enrollment not found");
      const { _count, ...enrollment } = result;
      return toolResult(
        {
          ...enrollment,
          discountTotal: _count.discounts,
          sessionTotal: _count.sessions,
          paymentTotal: _count.payments,
          hasMoreDiscounts: discountPage * discountLimit < _count.discounts,
          discountPage,
          discountLimit,
        },
        `/enrollments?enrollment=${id}`,
        enrollmentResultCard(enrollment, "Enrollment details"),
      );
    }
    case "create_enrollment": {
      const created = await createEnrollmentForStudent(args as never);
      const href = `/enrollments?enrollment=${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const result = await getEnrollmentForAssistant(created.id);
        if (!result) throw new Error("Created enrollment could not be loaded");
        const { _count, ...enrollment } = result;
        return toolResult(
          {
            ...enrollment,
            discountTotal: _count.discounts,
            sessionTotal: _count.sessions,
            paymentTotal: _count.payments,
            hasMoreDiscounts: _count.discounts > enrollment.discounts.length,
          },
          href,
          enrollmentResultCard(enrollment, "Enrollment created"),
        );
      });
    }
    case "update_enrollment": {
      const id = stringValue(args, "id");
      const updated = await updateEnrollmentStatus(id, {
        endDate: args.endDate as string | undefined,
        status: args.status as never,
        customPriceOverride: args.customPriceOverride as string | undefined,
      });
      const href = `/enrollments?enrollment=${id}`;
      return resultAfterMutation({ id: updated.id }, href, async () => {
        const result = await getEnrollmentForAssistant(updated.id);
        if (!result) throw new Error("Updated enrollment could not be loaded");
        const { _count, ...enrollment } = result;
        return toolResult(
          {
            ...enrollment,
            discountTotal: _count.discounts,
            sessionTotal: _count.sessions,
            paymentTotal: _count.payments,
            hasMoreDiscounts: _count.discounts > enrollment.discounts.length,
          },
          href,
          enrollmentResultCard(enrollment, "Enrollment updated"),
        );
      });
    }
    case "add_discount": {
      const enrollmentId = stringValue(args, "enrollmentId");
      const discount = { ...args };
      delete discount.enrollmentId;
      const created = await addDiscountToEnrollment(
        enrollmentId,
        discount as never,
      );
      const href = `/enrollments?enrollment=${enrollmentId}`;
      return resultAfterMutation(created, href, async () => {
        const enrollment = await loadEnrollmentCardSource(enrollmentId);
        if (!enrollment) throw new Error("Enrollment not found");
        return toolResult(
          created,
          href,
          enrollmentResultCard(enrollment, "Discount added"),
        );
      });
    }
    case "remove_discount": {
      const discountId = stringValue(args, "discountId");
      await removeDiscount(discountId);
      return toolResult({ discountId, removed: true }, "/enrollments");
    }
    case "list_groups": {
      return toolResult(
        await listGroupsForAssistant({
          groupId: args.groupId as string | undefined,
          tutorId: args.tutorId as string | undefined,
          subjectId: args.subjectId as string | undefined,
          page: Number(args.page),
          limit: Number(args.limit),
        }),
        "/enrollments",
      );
    }
    case "rename_group": {
      const groupId = stringValue(args, "groupId");
      const group = await updateExistingGroup(groupId, {
        name: stringValue(args, "name"),
      });
      return resultAfterMutation(group, "/enrollments", async () => {
        const loaded = await loadGroupCardSource(groupId);
        if (!loaded) throw new Error("Updated group could not be loaded");
        return toolResult(
          group,
          "/enrollments",
          groupResultCard(loaded, "Group renamed"),
        );
      });
    }
    default:
      throw new Error(`Unknown enrollments tool: ${name}`);
  }
}

async function executeSchedule(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  switch (name) {
    case "get_schedule": {
      const sessionId = args.sessionId as string | undefined;
      if (sessionId) {
        const result = await getSessionForAssistant(sessionId);
        if (!result) throw new Error("Session not found");
        const { _count, ...session } = result;
        return toolResult(
          {
            ...session,
            attendanceTotal: _count.attendance,
            hasMoreAttendance: _count.attendance > session.attendance.length,
          },
          "/schedule",
          sessionResultCard(result, "Session details"),
        );
      }
      if (args.from && args.to) {
        return toolResult(
          await querySessionsForAssistant({
            from: dateValue(args.from),
            to: dateValue(args.to),
            studentId: args.studentId as string | undefined,
            tutorId: args.tutorId as string | undefined,
            enrollmentId: args.enrollmentId as string | undefined,
            subjectId: args.subjectId as string | undefined,
            status: args.status as never,
            attendanceStatus: args.attendanceStatus as never,
            direction: args.direction as "ASC" | "DESC",
            page: Number(args.page),
            limit: Number(args.limit),
          }),
          "/schedule",
        );
      }
      return toolResult(
        await getMonthScheduleForAssistant(
          stringValue(args, "month"),
          Number(args.limit),
          Number(args.page),
        ),
        "/schedule",
      );
    }
    case "get_enrollment_capacity":
      return toolResult(
        await getEnrollmentMonthSummary(
          stringValue(args, "enrollmentId"),
          dateValue(args.date),
        ),
        "/schedule",
      );
    case "preview_recurring_schedule":
      return toolResult(
        await getRecurringSchedulePreview(args as never),
        "/schedule",
      );
    case "create_one_time_session": {
      const session = await createAdHocSession(args as never);
      return toolResult(
        session,
        "/schedule",
        sessionResultCard(session, "One-time session created"),
      );
    }
    case "update_session": {
      const sessionId = stringValue(args, "sessionId");
      const rest = { ...args };
      delete rest.sessionId;
      delete rest.__assistantSessionVersion;
      const scheduledFor = rest.scheduledFor;
      delete rest.scheduledFor;
      const updated = await updateScheduledSession(
        sessionId,
        {
          ...rest,
          scheduledFor: scheduledFor
            ? new Date(String(scheduledFor))
            : undefined,
        } as never,
        confirmedSessionUpdatedAt(
          args,
          sessionId,
          context.confirmationApproved,
        ),
      );
      return toolResult(
        updated,
        "/schedule",
        sessionResultCard(updated, "Session updated"),
      );
    }
    case "mark_attendance": {
      const sessionId = stringValue(args, "sessionId");
      await markSessionAttendance(
        sessionId,
        {
          attendances: args.attendances as never,
        },
        confirmedSessionUpdatedAt(
          args,
          sessionId,
          context.confirmationApproved,
        ),
      );
      return resultAfterMutation(
        { sessionId, updated: true },
        "/schedule",
        async () => {
          const session = await getSessionForAssistant(sessionId);
          if (!session) throw new Error("Updated session could not be loaded");
          return toolResult(
            { sessionId, updated: true },
            "/schedule",
            sessionResultCard(session, "Attendance updated"),
          );
        },
      );
    }
    case "set_session_status": {
      const sessionId = stringValue(args, "sessionId");
      const result = await updateSessionStatus(
        sessionId,
        args.status as never,
        confirmedSessionUpdatedAt(
          args,
          sessionId,
          context.confirmationApproved,
        ),
      );
      return resultAfterMutation(result, "/schedule", async () => {
        const session = await getSessionForAssistant(sessionId);
        if (!session) throw new Error("Updated session could not be loaded");
        return toolResult(
          result,
          "/schedule",
          sessionResultCard(session, "Session status updated"),
        );
      });
    }
    case "cancel_session": {
      const sessionId = stringValue(args, "sessionId");
      const result = await cancelSessionById(
        sessionId,
        args.cancelledBy as "TUTOR" | "STUDENT",
        confirmedSessionUpdatedAt(
          args,
          sessionId,
          context.confirmationApproved,
        ),
      );
      return resultAfterMutation(result, "/schedule", async () => {
        const session = await getSessionForAssistant(sessionId);
        if (!session) throw new Error("Cancelled session could not be loaded");
        return toolResult(
          result,
          "/schedule",
          sessionResultCard(session, "Session cancelled"),
        );
      });
    }
    case "delete_session": {
      const sessionId = stringValue(args, "sessionId");
      const session = await getSessionForAssistant(sessionId);
      if (!session) throw new Error("Session not found");
      await deleteSessionById(
        sessionId,
        confirmedSessionUpdatedAt(
          args,
          sessionId,
          context.confirmationApproved,
        ),
      );
      return mutationToolResult(
        { sessionId, deleted: true },
        "/schedule",
        sessionResultCard(session, "Session deleted"),
      );
    }
    default:
      throw new Error(`Unknown schedule tool: ${name}`);
  }
}

async function executeRecurrence(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  switch (name) {
    case "list_recurring_schedules": {
      const enrollmentId = args.enrollmentId as string | undefined;
      const groupId = args.groupId as string | undefined;
      const rules = await listRecurrenceRulesForAssistant({
        enrollmentId,
        groupId,
        includeEnded: Boolean(args.includeEnded),
        page: Number(args.page),
        limit: Number(args.limit),
      });
      return toolResult(rules, "/schedule");
    }
    case "get_recurring_schedule": {
      const rule = await getRecurrenceRuleForAssistant(
        stringValue(args, "ruleId"),
      );
      if (!rule) throw new Error("Recurring schedule not found");
      const group = rule.group
        ? {
            ...rule.group,
            enrollmentTotal: rule.group._count.enrollments,
            hasMoreEnrollments:
              rule.group._count.enrollments > rule.group.enrollments.length,
          }
        : null;
      return toolResult(
        { ...rule, group },
        "/schedule",
        recurrenceResultCard(rule, "Recurring schedule details"),
      );
    }
    case "create_recurring_schedule": {
      const result = await createRecurringSchedule(args as never);
      return resultAfterMutation(result, "/schedule", async () => {
        const enrollmentId = args.enrollmentId as string | undefined;
        if (enrollmentId) {
          const enrollment = await loadEnrollmentCardSource(enrollmentId);
          if (!enrollment) throw new Error("Enrollment not found");
          return toolResult(
            result,
            "/schedule",
            enrollmentResultCard(enrollment, "Recurring schedule created"),
          );
        }
        const groupId = stringValue(args, "groupId");
        const group = await loadGroupCardSource(groupId);
        if (!group) throw new Error("Group not found");
        return toolResult(
          result,
          "/schedule",
          groupResultCard(group, "Recurring schedule created"),
        );
      });
    }
    case "split_recurring_schedule": {
      const ruleId = stringValue(args, "ruleId");
      const params = args.params as Record<string, unknown>;
      await splitRecurrenceRule(
        ruleId,
        new Date(stringValue(args, "splitDate")),
        params as never,
        confirmedRecurrenceUpdatedAt(args, ruleId),
      );
      return resultAfterMutation({ updated: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleForAssistant(ruleId);
        if (!rule)
          throw new Error("Updated recurring schedule could not be loaded");
        return toolResult(
          { updated: true },
          "/schedule",
          recurrenceResultCard(rule, "Recurring schedule changed"),
        );
      });
    }
    case "end_recurring_schedule": {
      const ruleId = stringValue(args, "ruleId");
      await endRecurrenceFromDate(
        ruleId,
        new Date(stringValue(args, "occurrenceFor")),
        confirmedRecurrenceUpdatedAt(args, ruleId),
      );
      return resultAfterMutation({ ended: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleForAssistant(ruleId);
        if (!rule)
          throw new Error("Ended recurring schedule could not be loaded");
        return toolResult(
          { ended: true },
          "/schedule",
          recurrenceResultCard(rule, "Recurring schedule ended", {
            linkToRule: false,
          }),
        );
      });
    }
    case "cancel_occurrence": {
      const ruleId = stringValue(args, "ruleId");
      await cancelVirtualOccurrence(
        ruleId,
        new Date(stringValue(args, "occurrenceFor")),
        confirmedRecurrenceUpdatedAt(args, ruleId),
      );
      return resultAfterMutation({ cancelled: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleForAssistant(ruleId);
        if (!rule) throw new Error("Recurring schedule could not be loaded");
        return toolResult(
          { cancelled: true },
          "/schedule",
          recurrenceResultCard(rule, "Occurrence cancelled"),
        );
      });
    }
    case "reschedule_occurrence": {
      const ruleId = stringValue(args, "ruleId");
      await rescheduleVirtualOccurrence(
        ruleId,
        new Date(stringValue(args, "occurrenceFor")),
        new Date(stringValue(args, "newScheduledFor")),
        (args.overrides ?? {}) as never,
        confirmedRecurrenceUpdatedAt(
          args,
          ruleId,
          context.confirmationApproved,
        ),
      );
      return resultAfterMutation(
        { rescheduled: true },
        "/schedule",
        async () => {
          const rule = await getRecurrenceRuleForAssistant(ruleId);
          if (!rule) throw new Error("Recurring schedule could not be loaded");
          return toolResult(
            { rescheduled: true },
            "/schedule",
            recurrenceResultCard(rule, "Occurrence rescheduled"),
          );
        },
      );
    }
    case "delete_recurring_schedule": {
      const ruleId = stringValue(args, "ruleId");
      const rule = await getRecurrenceRuleForAssistant(ruleId);
      if (!rule) throw new Error("Recurring schedule not found");
      await deleteRecurringSchedule(
        ruleId,
        confirmedRecurrenceUpdatedAt(args, ruleId),
      );
      return mutationToolResult(
        { ruleId, deleted: true },
        "/schedule",
        recurrenceResultCard(rule, "Recurring schedule deleted", {
          linkToRule: false,
        }),
      );
    }
    case "set_schedule_color": {
      const enrollmentId = stringValue(args, "enrollmentId");
      await updateEnrollmentRecurrenceColor(
        enrollmentId,
        stringValue(args, "color"),
      );
      return resultAfterMutation({ updated: true }, "/schedule", async () => {
        const enrollment = await loadEnrollmentCardSource(enrollmentId);
        if (!enrollment) throw new Error("Enrollment not found");
        return toolResult(
          { updated: true },
          "/schedule",
          enrollmentResultCard(enrollment, "Schedule color updated"),
        );
      });
    }
    default:
      throw new Error(`Unknown recurrence tool: ${name}`);
  }
}

async function executeAttendance(name: string, args: ToolArguments) {
  if (name !== "get_session_participants") {
    throw new Error(`Unknown attendance tool: ${name}`);
  }
  const sessionId = stringValue(args, "sessionId");
  const result = await getSessionParticipantsForAssistant({
    sessionId,
    studentId: args.studentId as string | undefined,
    page: Number(args.page),
    limit: Number(args.limit),
  });
  if (!result) throw new Error("Session not found");
  return toolResult(result, "/schedule");
}

async function executeBilling(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  switch (name) {
    case "get_student_balance": {
      const studentId = stringValue(args, "studentId");
      const student = await loadStudentCardSource(studentId);
      if (!student) throw new Error("Student not found");
      const balanceResult = await getStudentBalanceForAssistant(studentId);
      if (!balanceResult) throw new Error("Student not found");
      if (!balanceResult.calculationComplete) {
        return toolResult(
          {
            studentId,
            studentName: `${student.firstName} ${student.lastName}`,
            calculationComplete: false,
            warnings: balanceResult.warnings,
          },
          `/students?student=${studentId}`,
          studentResultCard(student, "Balance requires detailed review"),
        );
      }
      const balance = balanceResult.balance;
      return toolResult(
        {
          studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          balance: balance.toFixed(2),
          calculationComplete: true,
          warnings: balanceResult.warnings,
        },
        `/students?student=${studentId}`,
        studentResultCard(
          student,
          `Outstanding balance: ${formatMoney(balance)}`,
        ),
      );
    }
    case "list_payments":
      return toolResult(
        await listPaymentsForAssistant({
          paymentId: args.paymentId as string | undefined,
          studentId: args.studentId as string | undefined,
          enrollmentId: args.enrollmentId as string | undefined,
          method: args.method as string | undefined,
          from: args.from ? dateValue(args.from) : undefined,
          to: args.to ? dateValue(args.to) : undefined,
          page: Number(args.page),
          pageSize: Number(args.limit ?? 20),
        }),
        "/payments",
      );
    case "get_upcoming_dues": {
      const currentMonth = getInstantCalendarDateKey(
        new Date(),
        getConfiguredCenterTimeZone(),
      ).slice(0, 7);
      const currentMonthDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
      const fromMonth =
        (args.fromMonth as string | undefined) ??
        addCalendarMonths(currentMonthDate, -11).toISOString().slice(0, 7);
      const toMonth =
        (args.toMonth as string | undefined) ??
        addCalendarMonths(currentMonthDate, 2).toISOString().slice(0, 7);
      const result = await getPaymentDuesForAssistant({
        status: args.status as
          "ALL" | "OVERDUE" | "DUE_THIS_MONTH" | "UPCOMING" | "PAID",
        fromMonth,
        toMonth,
        page: Number(args.page),
        limit: Number(args.limit),
      });
      return toolResult(
        {
          ...result,
          dues: result.dues.map((due) => ({
            key: due.key,
            enrollmentId: due.enrollmentId,
            studentId: due.studentId,
            studentName: due.studentName,
            subjectName: due.subjectName,
            packageName: due.packageName,
            amount: due.amount,
            month: due.month,
            monthLabel: due.monthLabel,
            isPaid: due.isPaid,
            isOverdue: due.isOverdue,
            isDueThisMonth: due.isDueThisMonth,
          })),
        },
        "/payments",
      );
    }
    case "get_payment_stats":
      return toolResult(await getPaymentStats(), "/payments");
    case "record_payment": {
      const payment = await recordPayment(
        args as never,
        context.admin.id,
        context.idempotencyKey,
      );
      return resultAfterMutation(payment, "/payments", async () => {
        const student = await getStudentIdentityForAssistant(
          stringValue(args, "studentId"),
        );
        if (!student) throw new Error("Student not found");
        return toolResult(
          payment,
          "/payments",
          paymentResultCard(payment, student),
        );
      });
    }
    case "mark_due_paid": {
      const payment = await recordPaymentForDue(
        args,
        context.admin.id,
        context.idempotencyKey,
      );
      return resultAfterMutation(payment, "/payments", async () => {
        const student = await getStudentIdentityForAssistant(
          stringValue(args, "studentId"),
        );
        if (!student) throw new Error("Student not found");
        return toolResult(
          payment,
          "/payments",
          paymentResultCard(payment, student),
        );
      });
    }
    case "delete_payment": {
      const paymentId = stringValue(args, "paymentId");
      await deletePaymentById(paymentId);
      return toolResult({ paymentId, deleted: true }, "/payments");
    }
    case "send_payment_reminder": {
      const reminderConfirmation = confirmationSnapshot(args);
      await sendPaymentReminderEmail(
        stringValue(args, "enrollmentId"),
        stringValue(args, "month"),
        context.idempotencyKey,
        reminderConfirmation.digest,
      );
      return mutationToolResult(
        { sent: true },
        "/payments",
        emailResultCard({
          entityKey: `payment-reminder:${stringValue(args, "enrollmentId")}:${stringValue(args, "month")}`,
          title: `Payment reminder for ${reminderConfirmation.monthLabel ?? stringValue(args, "month")}`,
          subtitle: "Payment reminder sent",
          recipientSummary: reminderConfirmation.recipientSummary,
          subject: reminderConfirmation.subject,
          messagePreview: reminderConfirmation.bodyPreview,
          href: "/payments",
          actionLabel: "View payments",
        }),
      );
    }
    case "send_payment_reminders": {
      const reminderConfirmation = confirmationSnapshot(args);
      const reminders = z
        .array(z.object({ enrollmentId: z.string(), month: z.string() }))
        .min(1)
        .max(100)
        .parse(args.reminders);
      const deliveries = reminderConfirmation.deliveries;
      if (!deliveries || deliveries.length !== reminders.length) {
        throw new Error("The approved payment reminder batch is incomplete");
      }
      const expectedBatchDigest = createHash("sha256")
        .update(JSON.stringify(deliveries))
        .digest("hex");
      if (
        expectedBatchDigest !== reminderConfirmation.digest ||
        deliveries.some(
          (delivery, index) =>
            delivery.enrollmentId !== reminders[index].enrollmentId ||
            delivery.month !== reminders[index].month,
        )
      ) {
        throw new Error("The payment reminder batch changed after approval");
      }
      const results: Array<{
        enrollmentId: string;
        month: string;
        success: boolean;
      }> = [];
      for (const [index, reminder] of reminders.entries()) {
        try {
          await sendPaymentReminderEmail(
            reminder.enrollmentId,
            reminder.month,
            context.idempotencyKey
              ? `${context.idempotencyKey}:${index}`
              : undefined,
            deliveries[index].digest,
          );
          results.push({ ...reminder, success: true });
        } catch (error) {
          if (error instanceof DeliveryOutcomeUnknownError) throw error;
          results.push({ ...reminder, success: false });
        }
      }
      const sent = results.filter((result) => result.success).length;
      const failed = results.length - sent;
      return mutationToolResult(
        { sent, failed, results },
        "/payments",
        emailResultCard({
          entityKey: `payment-reminder-batch:${reminderConfirmation.digest}`,
          title: `${sent} payment reminder${sent === 1 ? "" : "s"} sent`,
          subtitle: failed
            ? `${failed} reminder${failed === 1 ? "" : "s"} failed`
            : "Reminder batch completed",
          recipientSummary: reminderConfirmation.recipientSummary,
          subject: reminderConfirmation.subject,
          messagePreview: reminderConfirmation.bodyPreview,
          href: "/payments",
          actionLabel: "View payments",
        }),
      );
    }
    default:
      throw new Error(`Unknown billing tool: ${name}`);
  }
}

async function executeCommunications(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  switch (name) {
    case "resolve_recipients":
      return toolResult(
        await resolveStudentCommunicationRecipientsData({
          studentIds: args.studentIds as string[] | undefined,
          query: args.query as string | undefined,
          status: args.status as "ACTIVE" | "PAUSED" | "INACTIVE" | undefined,
          school: args.school as string | undefined,
          gradeLevel: args.gradeLevel as string | undefined,
          page: Number(args.page),
          limit: Number(args.limit),
        }),
        "/students",
      );
    case "list_email_templates": {
      return toolResult(
        await listEmailTemplatesForAssistant({
          page: Number(args.page),
          limit: Number(args.limit),
        }),
        "/emails",
      );
    }
    case "get_email_template": {
      const template = await getEmailTemplate(stringValue(args, "id"));
      if (!template) throw new Error("Email template not found");
      return toolResult(
        template,
        "/emails",
        emailTemplateResultCard(template, "Email template details"),
      );
    }
    case "create_email_template": {
      const template = await createTemplate(args as never);
      return mutationToolResult(
        template,
        "/emails",
        emailTemplateResultCard(template, "Email template created"),
      );
    }
    case "update_email_template": {
      const id = stringValue(args, "id");
      const template = { ...args };
      delete template.id;
      const updated = await updateTemplate(id, template as never);
      return mutationToolResult(
        updated,
        "/emails",
        emailTemplateResultCard(updated, "Email template updated"),
      );
    }
    case "delete_email_template": {
      const id = stringValue(args, "id");
      const template = await getEmailTemplate(id);
      if (!template) throw new Error("Email template not found");
      await deleteTemplate(id);
      return mutationToolResult(
        { id, deleted: true },
        "/emails",
        emailTemplateResultCard(template, "Email template deleted"),
      );
    }
    case "send_email": {
      const emailConfirmation = confirmationSnapshot(args);
      const studentIds = z.array(z.string()).parse(args.studentIds);
      const result = await sendEmailToStudents({
        studentIds,
        subject: stringValue(args, "subject"),
        body: stringValue(args, "body"),
        idempotencyKey: context.idempotencyKey,
        expectedConfirmationDigest: emailConfirmation.digest,
      });
      return mutationToolResult(
        result,
        "/emails",
        emailResultCard({
          entityKey: `email-send:${emailConfirmation.digest}`,
          title:
            studentIds.length === 1
              ? "Email sent to 1 student"
              : `Email sent to ${studentIds.length} students`,
          subtitle: `${result.sent} sent${result.failed ? ` · ${result.failed} failed` : ""}`,
          subject: emailConfirmation.subject,
          recipientSummary: emailConfirmation.recipientSummary,
          messagePreview: emailConfirmation.bodyPreview,
        }),
      );
    }
    default:
      throw new Error(`Unknown communications tool: ${name}`);
  }
}

async function executeTeam(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  if (context.admin.role !== "OWNER") {
    throw new Error("Owner access required");
  }
  switch (name) {
    case "get_team": {
      const adminId = args.adminId as string | undefined;
      const invitationId = args.invitationId as string | undefined;
      const email = (args.email as string | undefined)?.toLowerCase();
      const team = await getTeamPageForAssistant({
        adminId,
        invitationId,
        email,
        page: Number(args.page),
        limit: Number(args.limit),
      });
      return toolResult(
        {
          admins: team.admins.admins.map(
            ({ id, name, email: adminEmail, role }) => ({
              id,
              name,
              email: adminEmail,
              role,
            }),
          ),
          adminTotal: team.admins.total,
          hasMoreAdmins: team.admins.hasMore,
          pendingInvitations: team.pendingInvitations.results.map(
            (invitation) => ({
              id: invitation.id,
              emailAddress: invitation.emailAddress,
              status: invitation.status,
            }),
          ),
          invitationTotal: team.pendingInvitations.total,
          hasMoreInvitations: team.pendingInvitations.hasMore,
          page: team.admins.page,
          limit: team.admins.limit,
        },
        "/team",
      );
    }
    case "invite_team_member": {
      const email = stringValue(args, "email");
      const invitation = await inviteTeamMember(email);
      return mutationToolResult(
        { invited: true, email },
        "/team",
        teamResultCard({
          entityKey: `team-invite:${invitation.id}`,
          title: email,
          subtitle: "Team invitation sent",
          email,
          role: "STAFF",
        }),
      );
    }
    case "revoke_team_invitation": {
      const invitationId = stringValue(args, "invitationId");
      const invitation = await getPendingTeamInvitation({ invitationId });
      if (!invitation) throw new Error("Team invitation not found");
      await revokeTeamInvitation(invitationId);
      return mutationToolResult(
        { revoked: true },
        "/team",
        teamResultCard({
          entityKey: `team-invitation:${invitation.id}`,
          title: invitation.emailAddress,
          subtitle: "Team invitation revoked",
          email: invitation.emailAddress,
        }),
      );
    }
    case "update_team_role": {
      const adminId = stringValue(args, "adminId");
      const member = await getTeamAdminForAssistant(adminId);
      if (!member) throw new Error("Team member not found");
      const role = args.role as "OWNER" | "STAFF";
      await updateTeamMemberRole(context.admin.id, adminId, role);
      return mutationToolResult(
        { updated: true },
        "/team",
        teamResultCard({
          entityKey: `team-admin:${member.id}`,
          title: member.name,
          subtitle: `Role changed to ${titleCase(role)}`,
          email: member.email,
          role,
        }),
      );
    }
    case "remove_team_member": {
      const adminId = stringValue(args, "adminId");
      const member = await getTeamAdminForAssistant(adminId);
      if (!member) throw new Error("Team member not found");
      const result = await removeTeamMember(context.admin.id, adminId);
      return mutationToolResult(
        result,
        "/team",
        teamResultCard({
          entityKey: `team-admin:${member.id}`,
          title: member.name,
          subtitle: result.clerkAccountDeleted
            ? "Team access removed"
            : "Team access removed · Clerk cleanup pending",
          email: member.email,
          role: member.role,
        }),
      );
    }
    default:
      throw new Error(`Unknown team tool: ${name}`);
  }
}

export async function executeAssistantTool(input: {
  namespace: string;
  name: string;
  argumentsValue: unknown;
  context: AssistantToolExecutionContext;
}) {
  const currentAdmin = await getAssistantAdminAuthorization(
    input.context.admin.id,
  );
  const currentContext: AssistantToolExecutionContext = {
    ...input.context,
    admin: currentAdmin,
  };
  const spec = getAssistantToolSpec(
    input.namespace,
    input.name,
    currentAdmin.role,
  );
  if (!spec) throw new Error("Tool is not available for this administrator");
  const args = parsedArguments(spec, input.argumentsValue);
  currentContext.confirmationApproved =
    Boolean(input.context.confirmationApproved) ||
    assistantToolRequiresConfirmation(spec, args);
  if (
    assistantToolMutatesData(spec) &&
    collectAssistantIdentifierReferences(input.namespace, input.name, args)
      .length > 0 &&
    !input.context.provenanceValidated
  ) {
    throw new Error(
      "Mutation identifiers must be validated by the assistant orchestrator before execution",
    );
  }

  switch (input.namespace) {
    case "students":
      return executeStudents(input.name, args);
    case "guardians":
      return executeGuardians(input.name, args);
    case "tutors":
      return executeTutors(input.name, args);
    case "catalog":
      return executeCatalog(input.name, args);
    case "enrollments":
      return executeEnrollments(input.name, args);
    case "schedule":
      return executeSchedule(input.name, args, currentContext);
    case "attendance":
      return executeAttendance(input.name, args);
    case "recurrence":
      return executeRecurrence(input.name, args, currentContext);
    case "billing":
      return executeBilling(input.name, args, currentContext);
    case "communications":
      return executeCommunications(input.name, args, currentContext);
    case "team":
      return executeTeam(input.name, args, currentContext);
    case "reporting": {
      const section = args.section as
        "SUMMARY" | "UNPAID_STUDENTS" | "UPCOMING_ENDINGS" | "TUTOR_WORKLOAD";
      const page = Number(args.page);
      const limit = Number(args.limit);
      if (section === "UNPAID_STUDENTS" || section === "UPCOMING_ENDINGS") {
        return toolResult(
          {
            section,
            ...(await getDashboardReportPageForAssistant({
              section,
              page,
              limit,
            })),
          },
          "/dashboard",
        );
      }
      const [dashboard, schedule] = await Promise.all([
        getDashboardStats({
          materialize: false,
          includeSessionDetails: false,
          includeScheduleAggregates: false,
          includeUnpaidStudents: false,
          includeUpcomingEndings: false,
        }),
        getDashboardScheduleForAssistant(),
      ]);
      const bounded = <T, R>(items: T[], summarize: (item: T) => R) => ({
        total: items.length,
        page,
        limit,
        hasMore: page * limit < items.length,
        results: items.slice((page - 1) * limit, page * limit).map(summarize),
      });
      if (section === "TUTOR_WORKLOAD") {
        return toolResult(
          {
            section,
            ...bounded(schedule.tutorCounts, (tutor) => tutor),
          },
          "/dashboard",
        );
      }
      const [upcomingEndings, unpaidStudents] = await Promise.all([
        getDashboardReportPageForAssistant({
          section: "UPCOMING_ENDINGS",
          page,
          limit,
        }),
        getDashboardReportPageForAssistant({
          section: "UNPAID_STUDENTS",
          page,
          limit,
        }),
      ]);
      return toolResult(
        {
          section,
          activeStudentCount: dashboard.activeStudentCount,
          todaySessions: schedule.todaySessions,
          tomorrowSessions: schedule.tomorrowSessions,
          upcomingEndings,
          tutorCounts: bounded(schedule.tutorCounts, (tutor) => tutor),
          unpaidStudents,
          weeklySessionsByDay: schedule.weeklySessionsByDay,
          monthlyRevenue: dashboard.monthlyRevenue,
        },
        "/dashboard",
      );
    }
    default:
      throw new Error(`Unknown tool namespace: ${input.namespace}`);
  }
}
