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
import { getEmailTemplate, getStudentsForEmail } from "@/lib/data/emails";
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
} from "@/lib/services/payments";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listEmailTemplates,
  sendEmailToStudents,
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
  getAssistantToolSpec,
  type AssistantToolSpec,
} from "@/lib/services/assistant/tools";
import { minimizeAssistantDto } from "@/lib/services/assistant/dto";
import { getConfiguredCenterTimeZone } from "@/lib/services/session-dates";
import { formatCalendarDate, formatDateTime } from "@/lib/utils/dates";
import { getInstantCalendarDateKey } from "@/lib/utils/time-zone";
import type { AssistantResultCard } from "@/lib/validators/assistant";

type ToolArguments = Record<string, unknown>;

export type AssistantToolExecutionContext = {
  admin: Pick<Admin, "id" | "role">;
  idempotencyKey?: string;
};

export async function resolveAssistantConfirmationArguments(input: {
  namespace: string;
  name: string;
  argumentsValue: Record<string, unknown>;
}) {
  if (input.namespace === "billing" && input.name === "mark_due_paid") {
    const quote = await getPaymentDueQuote(input.argumentsValue);
    return quote.confirmationArguments as Record<string, unknown>;
  }
  return input.argumentsValue;
}

function safeJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function toolResult(data: unknown, href?: string, card?: AssistantResultCard) {
  return safeJson({
    ok: true,
    data: minimizeAssistantDto(safeJson(data)),
    href,
    card,
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
  return requireRecord(spec.schema.parse(value));
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
        value: formatDateTime(session.scheduledFor),
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
        value: formatDateTime(scheduledFor),
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
    ],
    href: "/emails",
    actionLabel: "View email center",
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
    return guardian
      ? guardianResultCard(
          guardian,
          studentId,
          "Guardian relationship selected for removal",
        )
      : undefined;
  }

  if (namespace === "tutors") {
    const tutorId = value("id");
    if (!tutorId) return undefined;
    const tutor = await getTutorData(tutorId);
    return tutor
      ? tutorResultCard(tutor, "Tutor selected for archiving")
      : undefined;
  }

  if (namespace === "catalog") {
    const id = value("id");
    if (!id) return undefined;
    if (name === "delete_subject") {
      const subject = await getSubject(id);
      return subject
        ? subjectResultCard(subject, "Subject selected for permanent deletion")
        : undefined;
    }
    const pkg = await getPackage(id);
    return pkg
      ? packageResultCard(pkg, "Package selected for deactivation")
      : undefined;
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
      const enrollment = await getEnrollment(enrollmentId);
      return enrollment
        ? enrollmentResultCard(
            enrollment,
            `Payment reminder for ${value("month") ?? "billing period"}`,
          )
        : undefined;
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
    if (name === "delete_email_template") {
      const templateId = value("id");
      if (!templateId) return undefined;
      const template = await getEmailTemplate(templateId);
      return template
        ? emailResultCard({
            entityKey: `email-template:${template.id}`,
            title: template.name,
            subtitle: "Template selected for permanent deletion",
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
    const students = await getStudentsForEmail(studentIds);
    if (students.length !== studentIds.length) return undefined;
    const names = students.map(
      (student) => `${student.firstName} ${student.lastName}`,
    );
    return emailResultCard({
      entityKey: `email-send:${studentIds.slice().sort().join(":")}`,
      title:
        names.length === 1
          ? `Email ${names[0]}`
          : `Email ${names.length} students`,
      subtitle: "Outbound message awaiting approval",
      subject: value("subject"),
      recipientSummary:
        names.length <= 3
          ? names.join(", ")
          : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`,
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
      return toolResult(subject, "/subjects");
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
      return toolResult(updated, "/subjects");
    }
    case "delete_subject": {
      const deleted = await deleteSubjectOffering(stringValue(args, "id"));
      return toolResult({ id: deleted.id, deleted: true }, "/subjects");
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
      return toolResult(group, "/enrollments");
    }
    default:
      throw new Error(`Unknown enrollments tool: ${name}`);
  }
}

async function executeSchedule(name: string, args: ToolArguments) {
  switch (name) {
    case "get_schedule":
      return toolResult(
        await getMonthSchedule(stringValue(args, "month")),
        "/schedule",
      );
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
      const result = await markSessionAttendance(sessionId, {
        attendances: args.attendances as never,
      });
      return toolResult(result, "/schedule");
    }
    case "set_session_status": {
      const result = await updateSessionStatus(
        stringValue(args, "sessionId"),
        args.status as never,
      );
      return toolResult(result, "/schedule");
    }
    case "cancel_session": {
      const result = await cancelSessionById(
        stringValue(args, "sessionId"),
        args.cancelledBy as "TUTOR" | "STUDENT",
      );
      return toolResult(result, "/schedule");
    }
    case "delete_session": {
      const sessionId = stringValue(args, "sessionId");
      await deleteSessionById(sessionId);
      return toolResult({ sessionId, deleted: true }, "/schedule");
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
    case "create_recurring_schedule":
      return toolResult(
        await createRecurringSchedule(args as never),
        "/schedule",
      );
    case "split_recurring_schedule": {
      const params = args.params as Record<string, unknown>;
      await splitRecurrenceRule(
        stringValue(args, "ruleId"),
        new Date(stringValue(args, "splitDate")),
        params as never,
      );
      return toolResult({ updated: true }, "/schedule");
    }
    case "end_recurring_schedule":
      await endRecurrenceFromDate(
        stringValue(args, "ruleId"),
        new Date(stringValue(args, "occurrenceFor")),
      );
      return toolResult({ ended: true }, "/schedule");
    case "cancel_occurrence":
      await cancelVirtualOccurrence(
        stringValue(args, "ruleId"),
        new Date(stringValue(args, "occurrenceFor")),
      );
      return toolResult({ cancelled: true }, "/schedule");
    case "reschedule_occurrence": {
      await rescheduleVirtualOccurrence(
        stringValue(args, "ruleId"),
        new Date(stringValue(args, "occurrenceFor")),
        new Date(stringValue(args, "newScheduledFor")),
        (args.overrides ?? {}) as never,
      );
      return toolResult({ rescheduled: true }, "/schedule");
    }
    case "delete_recurring_schedule": {
      const ruleId = stringValue(args, "ruleId");
      await deleteRecurringSchedule(ruleId);
      return toolResult({ ruleId, deleted: true }, "/schedule");
    }
    case "set_schedule_color":
      await updateEnrollmentRecurrenceColor(
        stringValue(args, "enrollmentId"),
        stringValue(args, "color"),
      );
      return toolResult({ updated: true }, "/schedule");
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
    case "send_payment_reminder":
      await sendPaymentReminderEmail(
        stringValue(args, "enrollmentId"),
        stringValue(args, "month"),
        context.idempotencyKey,
      );
      return toolResult({ sent: true }, "/payments");
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
      return toolResult(template, "/emails");
    }
    case "update_email_template": {
      const id = stringValue(args, "id");
      const template = { ...args };
      delete template.id;
      const updated = await updateTemplate(id, template as never);
      return toolResult(updated, "/emails");
    }
    case "delete_email_template": {
      const id = stringValue(args, "id");
      await deleteTemplate(id);
      return toolResult({ id, deleted: true }, "/emails");
    }
    case "send_email":
      return toolResult(
        await sendEmailToStudents({
          ...(args as {
            studentIds: string[];
            subject: string;
            body: string;
          }),
          idempotencyKey: context.idempotencyKey,
        }),
        "/emails",
      );
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
      return toolResult(
        {
          admins: team.admins.map(({ id, name, email, role }) => ({
            id,
            name,
            email,
            role,
          })),
          pendingInvitations: team.pendingInvitations.map((invitation) => ({
            id: invitation.id,
            emailAddress: invitation.emailAddress,
            status: invitation.status,
          })),
        },
        "/team",
      );
    }
    case "invite_team_member":
      await inviteTeamMember(stringValue(args, "email"));
      return toolResult({ invited: true, email: args.email }, "/team");
    case "revoke_team_invitation":
      await revokeTeamInvitation(stringValue(args, "invitationId"));
      return toolResult({ revoked: true }, "/team");
    case "update_team_role":
      await updateTeamMemberRole(
        context.admin.id,
        stringValue(args, "adminId"),
        args.role as "OWNER" | "STAFF",
      );
      return toolResult({ updated: true }, "/team");
    case "remove_team_member":
      await removeTeamMember(context.admin.id, stringValue(args, "adminId"));
      return toolResult({ removed: true }, "/team");
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
