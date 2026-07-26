import "server-only";

import { z } from "zod";
import type { Admin } from "@/generated/prisma";
import { listStudents, getStudent as getStudentData } from "@/lib/data/students";
import { listTutors, getTutor as getTutorData } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listPackages, getPackage } from "@/lib/data/packages";
import { listEnrollments, getEnrollment } from "@/lib/data/enrollments";
import { listGroups } from "@/lib/data/groups";
import { listPayments } from "@/lib/data/payments";
import {
  createStudentWithGuardian,
  updateStudentProfile,
  updateStudentStatusById,
  archiveStudentById,
  deleteStudentById,
  addGuardianToStudent,
  updateGuardianDetails,
  removeGuardianFromStudent,
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
} from "@/lib/services/sessions";
import {
  recordPayment,
  recordPaymentForDue,
  deletePaymentById,
  getUpcomingPaymentDues,
  getPaymentStats,
  sendPaymentReminderEmail,
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

type ToolArguments = Record<string, unknown>;

export type AssistantToolExecutionContext = {
  admin: Pick<Admin, "id" | "role">;
};

function safeJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function toolResult(data: unknown, href?: string) {
  return safeJson({ ok: true, data: minimizeAssistantDto(safeJson(data)), href });
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
    case "get_student": {
      const id = stringValue(args, "id");
      const student = await getStudentData(id);
      if (!student) throw new Error("Student not found");
      return toolResult(student, `/students?student=${id}`);
    }
    case "create_student": {
      const student = await createStudentWithGuardian(args as never);
      return toolResult(
        { id: student.id, name: `${student.firstName} ${student.lastName}` },
        `/students?student=${student.id}`,
      );
    }
    case "update_student": {
      const id = stringValue(args, "id");
      const current = await getStudentData(id);
      if (!current) throw new Error("Student not found");
      const updated = await updateStudentProfile(id, {
        firstName: (args.firstName as string | undefined) ?? current.firstName,
        lastName: (args.lastName as string | undefined) ?? current.lastName,
        avatarUrl: (args.avatarUrl as string | undefined) ?? current.avatarUrl ?? "",
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
      return toolResult({ id: updated.id }, `/students?student=${id}`);
    }
    case "set_student_status": {
      const updated = await updateStudentStatusById(
        stringValue(args, "id"),
        z.enum(["ACTIVE", "PAUSED", "INACTIVE"]).parse(args.status),
      );
      return toolResult({ id: updated.id, status: updated.status }, `/students`);
    }
    case "archive_student": {
      const updated = await archiveStudentById(stringValue(args, "id"));
      return toolResult({ id: updated.id, status: updated.status }, "/students");
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
      return toolResult({ id: created.id, studentId }, `/students?student=${studentId}`);
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
      return toolResult({ id: updated.id, studentId }, `/students?student=${studentId}`);
    }
    case "remove_guardian": {
      const guardianId = stringValue(args, "guardianId");
      await removeGuardianFromStudent(studentId, guardianId);
      return toolResult({ guardianId, studentId, removed: true }, `/students?student=${studentId}`);
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
      return toolResult(tutor, `/tutors/${id}`);
    }
    case "create_tutor": {
      const tutor = await createTutorWithSubjects(args as never);
      return toolResult(
        { id: tutor.id, name: `${tutor.firstName} ${tutor.lastName}` },
        `/tutors/${tutor.id}`,
      );
    }
    case "update_tutor": {
      const id = stringValue(args, "id");
      const current = await getTutorData(id);
      if (!current) throw new Error("Tutor not found");
      const updated = await updateTutorProfile(id, {
        firstName: (args.firstName as string | undefined) ?? current.firstName,
        lastName: (args.lastName as string | undefined) ?? current.lastName,
        avatarUrl: (args.avatarUrl as string | undefined) ?? current.avatarUrl ?? "",
        avatarPublicId:
          (args.avatarPublicId as string | undefined) ??
          current.avatarPublicId ??
          undefined,
        email: (args.email as string | undefined) ?? current.email,
        phone: (args.phone as string | undefined) ?? current.phone,
        hourlyRate:
          (args.hourlyRate as string | undefined) ?? current.hourlyRate.toString(),
        notes: (args.notes as string | undefined) ?? current.notes ?? "",
      });
      return toolResult({ id: updated.id }, `/tutors/${id}`);
    }
    case "set_tutor_subjects": {
      const id = stringValue(args, "id");
      await updateTutorSubjectsList(id, z.array(z.string()).parse(args.subjectIds));
      return toolResult({ id, subjectIds: args.subjectIds }, `/tutors/${id}`);
    }
    case "archive_tutor": {
      const tutor = await archiveTutorById(stringValue(args, "id"));
      return toolResult({ id: tutor.id, status: tutor.status }, `/tutors/${tutor.id}`);
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
      return toolResult(await listPackages(Boolean(args.activeOnly)), "/packages");
    case "get_package": {
      const id = stringValue(args, "id");
      const pkg = await getPackage(id);
      if (!pkg) throw new Error("Package not found");
      return toolResult(pkg, `/packages/${id}/edit`);
    }
    case "create_package": {
      const pkg = await createPackageOffering(args as never);
      return toolResult(pkg, `/packages/${pkg.id}/edit`);
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
            | "MONTHLY"
            | "THREE_MONTHS"
            | "YEARLY"
            | undefined) ?? current.billingPeriod,
        lessonType:
          (args.lessonType as "PRIVATE" | "GROUP" | undefined) ??
          current.lessonType,
        subjectId:
          args.subjectId === undefined
            ? current.subjectId ?? ""
            : (args.subjectId as string),
        basePrice:
          (args.basePrice as string | undefined) ?? current.basePrice.toString(),
        sessionsPerWeek:
          args.sessionsPerWeek === undefined
            ? current.sessionsPerWeek?.toString() ?? ""
            : (args.sessionsPerWeek as string),
        durationMinutes:
          (args.durationMinutes as string | undefined) ??
          current.durationMinutes.toString(),
      });
      return toolResult(updated, `/packages/${id}/edit`);
    }
    case "set_package_active": {
      const updated = await setPackageActive(
        stringValue(args, "id"),
        z.boolean().parse(args.isActive),
      );
      return toolResult(updated, "/packages");
    }
    default:
      throw new Error(`Unknown catalog tool: ${name}`);
  }
}

async function executeEnrollments(name: string, args: ToolArguments) {
  switch (name) {
    case "search_enrollments":
      return toolResult(
        await listEnrollments({
          studentId: args.studentId as string | undefined,
          tutorId: args.tutorId as string | undefined,
          status: args.status as never,
        }),
        "/enrollments",
      );
    case "get_enrollment": {
      const id = stringValue(args, "id");
      const enrollment = await getEnrollment(id);
      if (!enrollment) throw new Error("Enrollment not found");
      return toolResult(enrollment, `/enrollments?enrollment=${id}`);
    }
    case "create_enrollment": {
      const enrollment = await createEnrollmentForStudent(args as never);
      return toolResult(enrollment, `/enrollments?enrollment=${enrollment.id}`);
    }
    case "update_enrollment": {
      const id = stringValue(args, "id");
      const updated = await updateEnrollmentStatus(id, {
        endDate: args.endDate as string | undefined,
        status: args.status as never,
        customPriceOverride: args.customPriceOverride as string | undefined,
      });
      return toolResult(updated, `/enrollments?enrollment=${id}`);
    }
    case "add_discount": {
      const enrollmentId = stringValue(args, "enrollmentId");
      const discount = { ...args };
      delete discount.enrollmentId;
      const created = await addDiscountToEnrollment(
        enrollmentId,
        discount as never,
      );
      return toolResult(created, `/enrollments?enrollment=${enrollmentId}`);
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
      return toolResult(await getMonthSchedule(stringValue(args, "month")), "/schedule");
    case "create_one_time_session": {
      const session = await createAdHocSession(args as never);
      return toolResult(session, "/schedule");
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
      return toolResult(updated, "/schedule");
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
    case "create_recurring_schedule":
      return toolResult(await createRecurringSchedule(args as never), "/schedule");
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
  adminId: string,
) {
  switch (name) {
    case "list_payments":
      return toolResult(
        await listPayments({
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
      const payment = await recordPayment(args as never, adminId);
      return toolResult(payment, "/payments");
    }
    case "mark_due_paid": {
      const payment = await recordPaymentForDue(args, adminId);
      return toolResult(payment, "/payments");
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
      );
      return toolResult({ sent: true }, "/payments");
    default:
      throw new Error(`Unknown billing tool: ${name}`);
  }
}

async function executeCommunications(name: string, args: ToolArguments) {
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
      return toolResult(await sendEmailToStudents(args as never), "/emails");
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
      await removeTeamMember(
        context.admin.id,
        stringValue(args, "adminId"),
      );
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
      return executeBilling(input.name, args, input.context.admin.id);
    case "communications":
      return executeCommunications(input.name, args);
    case "team":
      return executeTeam(input.name, args, input.context);
    case "reporting":
      return toolResult(await getDashboardStats(), "/dashboard");
    default:
      throw new Error(`Unknown tool namespace: ${input.namespace}`);
  }
}
