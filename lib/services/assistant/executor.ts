import "server-only";

import { z } from "zod";
import type { Admin } from "@/generated/prisma";
import {
  getStudent as getStudentData,
  listStudents,
} from "@/lib/data/students";
import { listTutors, getTutor as getTutorData } from "@/lib/data/tutors";
import { getSubject, listSubjects } from "@/lib/data/subjects";
import { listPackages, getPackage } from "@/lib/data/packages";
import {
  getDiscountWithEnrollment,
  getEnrollment,
  searchEnrollmentsForAssistant,
} from "@/lib/data/enrollments";
import { listGroups } from "@/lib/data/groups";
import {
  getPaymentForAssistantConfirmation,
  listPaymentsForAssistant,
} from "@/lib/data/payments";
import {
  getRecurrenceRuleWithParticipants,
  getSession as getSessionData,
} from "@/lib/data/sessions";
import { getEmailTemplate } from "@/lib/data/emails";
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
  getTutorPayroll,
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
import {
  listGroupsForTutorSubject,
  updateExistingGroup,
} from "@/lib/services/groups";
import {
  createAdHocSession,
  createRecurringSchedule,
  getMonthSchedule,
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
} from "@/lib/services/sessions";
import {
  recordPayment,
  recordPaymentForDue,
  deletePaymentById,
  getUpcomingPaymentDues,
  getPaymentStats,
  sendPaymentReminderEmail,
  getStudentBalance,
  getPaymentDueQuote,
  getPaymentReminderConfirmation,
} from "@/lib/services/payments";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listEmailTemplates,
  sendEmailToStudents,
  getEmailDeliveryConfirmation,
} from "@/lib/services/emails";
import {
  getTeamPageData,
  inviteTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/lib/services/team";
import { getDashboardStats } from "@/lib/services/dashboard";
import {
  assistantToolMutatesData,
  getAssistantToolSpec,
  type AssistantToolSpec,
} from "@/lib/services/assistant/tools";
import { minimizeAssistantDto } from "@/lib/services/assistant/dto";
import { getConfiguredCenterTimeZone } from "@/lib/services/session-dates";
import { formatCalendarDate, formatDateTime } from "@/lib/utils/dates";
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
});

export type AssistantToolExecutionContext = {
  admin: Pick<Admin, "id" | "role">;
  idempotencyKey?: string;
  provenanceValidated?: boolean;
};

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
        key &&
        /(?:^id$|Id$|Ids$)/.test(key)
      ) {
        identifiers.add(item);
      }
      return;
    }
    Object.entries(item as Record<string, unknown>).forEach(([childKey, child]) =>
      visit(child, childKey),
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
  if (input.namespace === "billing" && input.name === "mark_due_paid") {
    const quote = await getPaymentDueQuote(input.argumentsValue);
    return quote.confirmationArguments as Record<string, unknown>;
  }
  if (
    input.namespace === "billing" &&
    input.name === "send_payment_reminder"
  ) {
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
        const student = await getStudentData(attendance.studentId);
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
  const normalizedCard = card
    ? normalizeAssistantResultCard(card)
    : undefined;
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
  return parsed;
}

function confirmationSnapshot(args: ToolArguments) {
  return assistantConfirmationSnapshotSchema.parse(
    args.__assistantConfirmation,
  );
}

function stringValue(args: ToolArguments, key: string) {
  return z.string().parse(args[key]);
}

function dateValue(value: unknown) {
  return new Date(z.iso.datetime().parse(value));
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
};

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
  const hasActiveEnrollment = student.enrollments?.some(
    (enrollment) => enrollment.status === "ACTIVE",
  );
  const suggestedActions: AssistantResultCard["suggestedActions"] = [];

  if (!primaryGuardian) {
    suggestedActions.push({
      kind: "PROMPT",
      label: "Add guardian",
      prompt: `Add a guardian for ${fullName}.`,
    });
  }
  if (!hasActiveEnrollment) {
    suggestedActions.push({
      kind: "PROMPT",
      label: "Enroll in a package",
      prompt: `Enroll ${fullName} in a package.`,
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
      prompt: `Assign subjects to tutor ${fullName}.`,
    });
  }
  suggestedActions.push(
    {
      kind: "PROMPT",
      label: "Create enrollment",
      prompt: `Create an enrollment with tutor ${fullName}.`,
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
        prompt: `Create a student enrollment using the ${pkg.name} package.`,
      },
      { kind: "DISMISS", label: "Done for now" },
    ],
  };
}

type EnrollmentCardSource = NonNullable<
  Awaited<ReturnType<typeof getEnrollment>>
>;

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
      avatarUrl: enrollment.student.avatarUrl,
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
        prompt: `Create a schedule for ${studentName}'s ${enrollment.subject.name} enrollment.`,
      },
      {
        kind: "PROMPT",
        label: "Record payment",
        prompt: `Record a payment for ${studentName}'s ${enrollment.subject.name} enrollment.`,
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
  },
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "SESSION",
    entityKey: `session:${session.id}`,
    title: "Scheduled session",
    subtitle,
    badges: [{ label: "Scheduled", tone: "SUCCESS" }],
    fields: [
      {
        label: "Date & time",
        value: formatDateTime(
          session.scheduledFor,
          getConfiguredCenterTimeZone(),
        ),
        icon: "CALENDAR",
      },
      {
        label: "Duration",
        value: `${session.durationMinutes} minutes`,
        icon: "CLOCK",
      },
      ...(session.room
        ? [{ label: "Room", value: session.room, icon: "LOCATION" as const }]
        : []),
    ],
    href: "/schedule",
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
        value: formatDateTime(
          scheduledFor,
          getConfiguredCenterTimeZone(),
        ),
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
    href: "/schedule",
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
  student: StudentCardSource,
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
    href: "/payments",
    actionLabel: "View payments",
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
  rule: NonNullable<
    Awaited<ReturnType<typeof getRecurrenceRuleWithParticipants>>
  >,
  subtitle: string,
): AssistantResultCard {
  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 6, 26 + rule.dayOfWeek)));
  const participant = rule.enrollment
    ? `${rule.enrollment.student.firstName} ${rule.enrollment.student.lastName} · ${rule.enrollment.subject.name}`
    : rule.group
      ? `${rule.group.name} · ${rule.group.subject.name}`
      : "Recurring schedule";
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
    href: "/schedule",
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
    href: "/emails",
    actionLabel: "View email templates",
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
  group: Awaited<ReturnType<typeof listGroups>>[number],
  subtitle: string,
): AssistantResultCard {
  return {
    kind: "GROUP",
    entityKey: `group:${group.id}`,
    title: group.name,
    subtitle,
    badges: [
      {
        label: `${group.enrollments.length} ${
          group.enrollments.length === 1 ? "student" : "students"
        }`,
        tone: "NEUTRAL",
      },
    ],
    fields: [
      { label: "Subject", value: group.subject.name, icon: "BOOK" },
      {
        label: "Tutor",
        value: `${group.tutor.firstName} ${group.tutor.lastName}`,
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
        attendance && typeof attendance === "object" && !Array.isArray(attendance)
          ? [
              (attendance as Record<string, unknown>).studentId,
            ].filter((item): item is string => typeof item === "string")
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
    const students = await Promise.all(studentIds.map(getStudentData));
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
    const tutor = await getTutorData(tutorId);
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
    const enrollment = await getEnrollment(enrollmentId);
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
    const group = (await listGroups()).find((item) => item.id === groupId);
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
    fields: [...card.fields, ...proposedFields],
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

  return enrichAssistantConfirmationCard({
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
      (field): field is AssistantResultCard["fields"][number] => Boolean(field),
    ),
    href: presentation.href,
    actionLabel: "Open manual workspace",
    suggestedActions: [],
  }, argumentsValue);
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
    const student = await getStudentData(studentId);
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
    const student = await getStudentData(studentId);
    const guardian = student?.guardians.find(
      (link) => link.guardianId === guardianId,
    )?.guardian;
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
    const tutor = await getTutorData(tutorId);
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
      const discount = await getDiscountWithEnrollment(discountId);
      return discount?.enrollment
        ? enrollmentResultCard(
            discount.enrollment,
            `${titleCase(discount.kind)} discount selected for removal`,
          )
        : undefined;
    }
    const enrollmentId = value("id") ?? value("enrollmentId");
    if (!enrollmentId) return undefined;
    const enrollment = await getEnrollment(enrollmentId);
    return enrollment
      ? enrollmentResultCard(enrollment, "Enrollment affected by this change")
      : undefined;
  }

  if (namespace === "schedule") {
    const sessionId = value("sessionId");
    if (sessionId) {
      const session = await getSessionData(sessionId);
      return session
        ? sessionResultCard(session, "Session affected by this change")
        : undefined;
    }
    const enrollmentId = value("enrollmentId");
    if (enrollmentId) {
      const enrollment = await getEnrollment(enrollmentId);
      return enrollment
        ? enrollmentResultCard(enrollment, "New session from attached schedule")
        : undefined;
    }
    const groupId = value("groupId");
    if (groupId) {
      const group = (await listGroups()).find((item) => item.id === groupId);
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
      const student = await getStudentData(studentIds[0]);
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
    const studentId = value("studentId");
    if (!studentId) return undefined;
    const student = await getStudentData(studentId);
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
      const rule = await getRecurrenceRuleWithParticipants(ruleId);
      return rule
        ? recurrenceResultCard(rule, "Recurring schedule affected")
        : undefined;
    }
    const enrollmentId = value("enrollmentId");
    if (enrollmentId) {
      const enrollment = await getEnrollment(enrollmentId);
      return enrollment
        ? enrollmentResultCard(enrollment, "Recurring schedule affected")
        : undefined;
    }
    const groupId = value("groupId");
    if (groupId) {
      const group = (await listGroups()).find((item) => item.id === groupId);
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
      entityKey: `email-send:${studentIds.slice().sort().join(":")}`,
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
    const team = await getTeamPageData();
    if (name === "revoke_team_invitation") {
      const invitationId = value("invitationId");
      const invitation = team.pendingInvitations.find(
        (item) => item.id === invitationId,
      );
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
    const admin = team.admins.find((item) => item.id === adminId);
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
        pageSize: Number(args.limit ?? 10),
      });
      return toolResult({
        total: result.total,
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
      const student = await getStudentData(id);
      if (!student) throw new Error("Student not found");
      return toolResult(
        student,
        `/students?student=${id}`,
        studentResultCard(student, "Student record"),
      );
    }
    case "create_student": {
      const created = await createStudentWithGuardian(args as never);
      const href = `/students?student=${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const student = await getStudentData(created.id);
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
      const current = await getStudentData(id);
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
        const student = await getStudentData(updated.id);
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
          const student = await getStudentData(updated.id);
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
    case "add_guardian": {
      const guardian = { ...args };
      delete guardian.studentId;
      const created = await addGuardianToStudent(studentId, guardian as never);
      const href = `/students?student=${studentId}`;
      return resultAfterMutation(
        { id: created.id, studentId },
        href,
        async () => {
          const student = await getStudentData(studentId);
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
          const student = await getStudentData(studentId);
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
        pageSize: Number(args.limit ?? 10),
      });
      return toolResult({
        total: result.total,
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
      const tutor = await getTutorData(id);
      if (!tutor) throw new Error("Tutor not found");
      return toolResult(
        tutor,
        `/tutors/${id}`,
        tutorResultCard(tutor, "Tutor record"),
      );
    }
    case "create_tutor": {
      const created = await createTutorWithSubjects(args as never);
      const href = `/tutors/${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const tutor = await getTutorData(created.id);
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
      const current = await getTutorData(id);
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
        const tutor = await getTutorData(updated.id);
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
          const tutor = await getTutorData(id);
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
      return toolResult(
        { id: tutor.id, status: tutor.status },
        `/tutors/${tutor.id}`,
        tutorResultCard(tutor, "Tutor archived"),
      );
    }
    case "get_tutor_payroll": {
      const id = stringValue(args, "id");
      const payroll = await getTutorPayroll(
        id,
        dateValue(args.from),
        dateValue(args.to),
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
    case "list_subjects":
      return toolResult(await listSubjects(), "/subjects");
    case "create_subject": {
      const subject = await createSubjectOffering(args as never);
      return toolResult(
        subject,
        "/subjects",
        subjectResultCard(subject, "Subject created"),
      );
    }
    case "update_subject": {
      const id = stringValue(args, "id");
      const subject = (await listSubjects()).find((item) => item.id === id);
      if (!subject) throw new Error("Subject not found");
      const updated = await updateSubjectOffering(id, {
        name: (args.name as string | undefined) ?? subject.name,
        description:
          (args.description as string | undefined) ?? subject.description ?? "",
      });
      return toolResult(
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
      return toolResult(
        { id: deleted.id, deleted: true },
        "/subjects",
        subjectResultCard(subject, "Subject deleted"),
      );
    }
    case "list_packages":
      return toolResult(
        await listPackages(Boolean(args.activeOnly)),
        "/packages",
      );
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
          status: args.status as never,
          limit: Number(args.limit ?? 20),
        }),
        "/enrollments",
      );
    case "get_enrollment": {
      const discountId = args.discountId as string | undefined;
      if (discountId) {
        const discount = await getDiscountWithEnrollment(discountId);
        if (!discount?.enrollment) throw new Error("Discount not found");
        return toolResult(
          { discount, enrollment: discount.enrollment },
          `/enrollments?enrollment=${discount.enrollment.id}`,
          enrollmentResultCard(
            discount.enrollment,
            "Enrollment and discount details",
          ),
        );
      }
      const id = stringValue(args, "id");
      const enrollment = await getEnrollment(id);
      if (!enrollment) throw new Error("Enrollment not found");
      return toolResult(
        enrollment,
        `/enrollments?enrollment=${id}`,
        enrollmentResultCard(enrollment, "Enrollment details"),
      );
    }
    case "create_enrollment": {
      const created = await createEnrollmentForStudent(args as never);
      const href = `/enrollments?enrollment=${created.id}`;
      return resultAfterMutation({ id: created.id }, href, async () => {
        const enrollment = await getEnrollment(created.id);
        if (!enrollment)
          throw new Error("Created enrollment could not be loaded");
        return toolResult(
          enrollment,
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
        const enrollment = await getEnrollment(updated.id);
        if (!enrollment)
          throw new Error("Updated enrollment could not be loaded");
        return toolResult(
          enrollment,
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
        const enrollment = await getEnrollment(enrollmentId);
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
      const groups =
        args.tutorId && args.subjectId
          ? await listGroupsForTutorSubject(
              stringValue(args, "tutorId"),
              stringValue(args, "subjectId"),
            )
          : await listGroups();
      return toolResult(groups, "/enrollments");
    }
    case "rename_group": {
      const groupId = stringValue(args, "groupId");
      const group = await updateExistingGroup(groupId, {
        name: stringValue(args, "name"),
      });
      return resultAfterMutation(group, "/enrollments", async () => {
        const loaded = (await listGroups()).find((item) => item.id === groupId);
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

async function executeSchedule(name: string, args: ToolArguments) {
  switch (name) {
    case "get_schedule": {
      const sessionId = args.sessionId as string | undefined;
      if (sessionId) {
        const session = await getSessionData(sessionId);
        if (!session) throw new Error("Session not found");
        return toolResult(
          session,
          "/schedule",
          sessionResultCard(session, "Session details"),
        );
      }
      return toolResult(
        await getMonthSchedule(stringValue(args, "month")),
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
      const scheduledFor = rest.scheduledFor;
      delete rest.scheduledFor;
      const updated = await updateScheduledSession(sessionId, {
        ...rest,
        scheduledFor: scheduledFor ? new Date(String(scheduledFor)) : undefined,
      } as never);
      return toolResult(
        updated,
        "/schedule",
        sessionResultCard(updated, "Session updated"),
      );
    }
    case "mark_attendance": {
      const sessionId = stringValue(args, "sessionId");
      await markSessionAttendance(sessionId, {
        attendances: args.attendances as never,
      });
      return resultAfterMutation({ sessionId, updated: true }, "/schedule", async () => {
        const session = await getSessionData(sessionId);
        if (!session) throw new Error("Updated session could not be loaded");
        return toolResult(
          { sessionId, updated: true },
          "/schedule",
          sessionResultCard(session, "Attendance updated"),
        );
      });
    }
    case "set_session_status": {
      const sessionId = stringValue(args, "sessionId");
      const result = await updateSessionStatus(
        sessionId,
        args.status as never,
      );
      return resultAfterMutation(result, "/schedule", async () => {
        const session = await getSessionData(sessionId);
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
      );
      return resultAfterMutation(result, "/schedule", async () => {
        const session = await getSessionData(sessionId);
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
      const session = await getSessionData(sessionId);
      if (!session) throw new Error("Session not found");
      await deleteSessionById(sessionId);
      return toolResult(
        { sessionId, deleted: true },
        "/schedule",
        sessionResultCard(session, "Session deleted"),
      );
    }
    default:
      throw new Error(`Unknown schedule tool: ${name}`);
  }
}

async function executeRecurrence(name: string, args: ToolArguments) {
  switch (name) {
    case "list_recurring_schedules": {
      const enrollmentId = args.enrollmentId as string | undefined;
      const groupId = args.groupId as string | undefined;
      const rules = await listRecurrenceRulesForAssistant({
        enrollmentId,
        groupId,
        includeEnded: Boolean(args.includeEnded),
        limit: Number(args.limit),
      });
      return toolResult(rules, "/schedule");
    }
    case "get_recurring_schedule": {
      const rule = await getRecurrenceRuleWithParticipants(
        stringValue(args, "ruleId"),
      );
      if (!rule) throw new Error("Recurring schedule not found");
      return toolResult(
        rule,
        "/schedule",
        recurrenceResultCard(rule, "Recurring schedule details"),
      );
    }
    case "create_recurring_schedule": {
      const result = await createRecurringSchedule(args as never);
      return resultAfterMutation(result, "/schedule", async () => {
        const enrollmentId = args.enrollmentId as string | undefined;
        if (enrollmentId) {
          const enrollment = await getEnrollment(enrollmentId);
          if (!enrollment) throw new Error("Enrollment not found");
          return toolResult(
            result,
            "/schedule",
            enrollmentResultCard(enrollment, "Recurring schedule created"),
          );
        }
        const groupId = stringValue(args, "groupId");
        const group = (await listGroups()).find((item) => item.id === groupId);
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
      );
      return resultAfterMutation({ updated: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleWithParticipants(ruleId);
        if (!rule) throw new Error("Updated recurring schedule could not be loaded");
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
      );
      return resultAfterMutation({ ended: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleWithParticipants(ruleId);
        if (!rule) throw new Error("Ended recurring schedule could not be loaded");
        return toolResult(
          { ended: true },
          "/schedule",
          recurrenceResultCard(rule, "Recurring schedule ended"),
        );
      });
    }
    case "cancel_occurrence": {
      const ruleId = stringValue(args, "ruleId");
      await cancelVirtualOccurrence(
        ruleId,
        new Date(stringValue(args, "occurrenceFor")),
      );
      return resultAfterMutation({ cancelled: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleWithParticipants(ruleId);
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
      );
      return resultAfterMutation({ rescheduled: true }, "/schedule", async () => {
        const rule = await getRecurrenceRuleWithParticipants(ruleId);
        if (!rule) throw new Error("Recurring schedule could not be loaded");
        return toolResult(
          { rescheduled: true },
          "/schedule",
          recurrenceResultCard(rule, "Occurrence rescheduled"),
        );
      });
    }
    case "delete_recurring_schedule": {
      const ruleId = stringValue(args, "ruleId");
      const rule = await getRecurrenceRuleWithParticipants(ruleId);
      if (!rule) throw new Error("Recurring schedule not found");
      await deleteRecurringSchedule(ruleId);
      return toolResult(
        { ruleId, deleted: true },
        "/schedule",
        recurrenceResultCard(rule, "Recurring schedule deleted"),
      );
    }
    case "set_schedule_color": {
      const enrollmentId = stringValue(args, "enrollmentId");
      await updateEnrollmentRecurrenceColor(
        enrollmentId,
        stringValue(args, "color"),
      );
      return resultAfterMutation({ updated: true }, "/schedule", async () => {
        const enrollment = await getEnrollment(enrollmentId);
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

async function executeBilling(
  name: string,
  args: ToolArguments,
  context: AssistantToolExecutionContext,
) {
  switch (name) {
    case "get_student_balance": {
      const studentId = stringValue(args, "studentId");
      const student = await getStudentData(studentId);
      if (!student) throw new Error("Student not found");
      const balance = await getStudentBalance(studentId);
      return toolResult(
        {
          studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          balance: balance.toFixed(2),
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
          pageSize: Number(args.limit ?? 20),
        }),
        "/payments",
      );
    case "get_upcoming_dues":
      return toolResult(await getUpcomingPaymentDues(), "/payments");
    case "get_payment_stats":
      return toolResult(await getPaymentStats(), "/payments");
    case "record_payment": {
      const payment = await recordPayment(
        args as never,
        context.admin.id,
        context.idempotencyKey,
      );
      return resultAfterMutation(payment, "/payments", async () => {
        const student = await getStudentData(stringValue(args, "studentId"));
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
        const student = await getStudentData(stringValue(args, "studentId"));
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
      return toolResult(
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
    case "list_email_templates":
      return toolResult(await listEmailTemplates(), "/emails");
    case "create_email_template": {
      const template = await createTemplate(args as never);
      return toolResult(
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
      return toolResult(
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
      return toolResult(
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
      return toolResult(
        result,
        "/emails",
        emailResultCard({
          entityKey: `email-send:${studentIds.slice().sort().join(":")}`,
          title: studentIds.length === 1 ? "Email sent to 1 student" : `Email sent to ${studentIds.length} students`,
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
      const team = await getTeamPageData();
      const adminId = args.adminId as string | undefined;
      const invitationId = args.invitationId as string | undefined;
      const email = (args.email as string | undefined)?.toLocaleLowerCase();
      return toolResult(
        {
          admins: team.admins
            .filter(
              (admin) =>
                !invitationId &&
                (!adminId || admin.id === adminId) &&
                (!email || admin.email.toLocaleLowerCase() === email),
            )
            .map(({ id, name, email: adminEmail, role }) => ({
              id,
              name,
              email: adminEmail,
              role,
            })),
          pendingInvitations: team.pendingInvitations
            .filter(
              (invitation) =>
                !adminId &&
                (!invitationId || invitation.id === invitationId) &&
                (!email ||
                  invitation.emailAddress.toLocaleLowerCase() === email),
            )
            .map((invitation) => ({
              id: invitation.id,
              emailAddress: invitation.emailAddress,
              status: invitation.status,
            })),
        },
        "/team",
      );
    }
    case "invite_team_member":
      {
        const email = stringValue(args, "email");
        const invitation = await inviteTeamMember(email);
        return toolResult(
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
      const invitation = (await getTeamPageData()).pendingInvitations.find(
        (item) => item.id === invitationId,
      );
      if (!invitation) throw new Error("Team invitation not found");
      await revokeTeamInvitation(invitationId);
      return toolResult(
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
      await updateTeamMemberRole(
        context.admin.id,
        adminId,
        args.role as "OWNER" | "STAFF",
      );
      const member = (await getTeamPageData()).admins.find(
        (item) => item.id === adminId,
      );
      if (!member) throw new Error("Updated team member could not be loaded");
      return toolResult(
        { updated: true },
        "/team",
        teamResultCard({
          entityKey: `team-admin:${member.id}`,
          title: member.name,
          subtitle: `Role changed to ${titleCase(member.role)}`,
          email: member.email,
          role: member.role,
        }),
      );
    }
    case "remove_team_member": {
      const adminId = stringValue(args, "adminId");
      const member = (await getTeamPageData()).admins.find(
        (item) => item.id === adminId,
      );
      if (!member) throw new Error("Team member not found");
      const result = await removeTeamMember(context.admin.id, adminId);
      return toolResult(
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
  const spec = getAssistantToolSpec(
    input.namespace,
    input.name,
    input.context.admin.role,
  );
  if (!spec) throw new Error("Tool is not available for this administrator");
  const args = parsedArguments(spec, input.argumentsValue);
  if (
    assistantToolMutatesData(spec) &&
    collectAssistantIdentifierValues(args).length > 0 &&
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
      return executeSchedule(input.name, args);
    case "recurrence":
      return executeRecurrence(input.name, args);
    case "billing":
      return executeBilling(input.name, args, input.context);
    case "communications":
      return executeCommunications(input.name, args, input.context);
    case "team":
      return executeTeam(input.name, args, input.context);
    case "reporting":
      return toolResult(await getDashboardStats(), "/dashboard");
    default:
      throw new Error(`Unknown tool namespace: ${input.namespace}`);
  }
}
