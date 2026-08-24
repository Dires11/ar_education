export type AssistantEntityKind =
  | "student"
  | "guardian"
  | "tutor"
  | "subject"
  | "package"
  | "enrollment"
  | "group"
  | "session"
  | "recurrence"
  | "payment"
  | "discount"
  | "emailTemplate"
  | "invitation"
  | "admin";

export type AssistantIdentifierReference = {
  kind: AssistantEntityKind;
  id: string;
};

const REFERENCE_KIND_BY_KEY: Partial<Record<string, AssistantEntityKind>> = {
  studentId: "student",
  studentIds: "student",
  guardianId: "guardian",
  tutorId: "tutor",
  subjectId: "subject",
  subjectIds: "subject",
  packageId: "package",
  enrollmentId: "enrollment",
  groupId: "group",
  existingGroupId: "group",
  sessionId: "session",
  recurrenceRuleId: "recurrence",
  recurrenceRuleIds: "recurrence",
  ruleId: "recurrence",
  paymentId: "payment",
  discountId: "discount",
  invitationId: "invitation",
  adminId: "admin",
};

const ID_KIND_BY_TOOL: Record<string, AssistantEntityKind> = {
  "students.get_student": "student",
  "students.create_student": "student",
  "students.update_student": "student",
  "students.set_student_status": "student",
  "students.archive_student": "student",
  "students.delete_student": "student",
  "guardians.add_guardian": "guardian",
  "guardians.update_guardian": "guardian",
  "tutors.get_tutor": "tutor",
  "tutors.create_tutor": "tutor",
  "tutors.update_tutor": "tutor",
  "tutors.set_tutor_subjects": "tutor",
  "tutors.archive_tutor": "tutor",
  "tutors.get_tutor_payroll": "tutor",
  "catalog.list_subjects": "subject",
  "catalog.create_subject": "subject",
  "catalog.update_subject": "subject",
  "catalog.delete_subject": "subject",
  "catalog.get_package": "package",
  "catalog.create_package": "package",
  "catalog.update_package": "package",
  "catalog.set_package_active": "package",
  "enrollments.get_enrollment": "enrollment",
  "enrollments.create_enrollment": "enrollment",
  "enrollments.update_enrollment": "enrollment",
  "enrollments.rename_group": "group",
  "schedule.create_one_time_session": "session",
  "schedule.update_session": "session",
  "schedule.mark_attendance": "session",
  "schedule.set_session_status": "session",
  "schedule.cancel_session": "session",
  "schedule.delete_session": "session",
  "communications.get_email_template": "emailTemplate",
  "communications.create_email_template": "emailTemplate",
  "communications.update_email_template": "emailTemplate",
  "communications.delete_email_template": "emailTemplate",
};

export function collectAssistantIdentifierReferences(
  namespace: string,
  name: string,
  value: unknown,
): AssistantIdentifierReference[] {
  const references = new Map<string, AssistantIdentifierReference>();
  const genericIdKind = ID_KIND_BY_TOOL[`${namespace}.${name}`];
  const visit = (item: unknown, key?: string) => {
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, key));
      return;
    }
    if (!item || typeof item !== "object") {
      if (typeof item !== "string" || item.trim().length === 0 || !key) return;
      const kind = key === "id" ? genericIdKind : REFERENCE_KIND_BY_KEY[key];
      if (kind) references.set(`${kind}:${item}`, { kind, id: item });
      return;
    }
    Object.entries(item as Record<string, unknown>).forEach(([childKey, child]) =>
      visit(child, childKey),
    );
  };
  visit(value);
  return [...references.values()];
}
