import "server-only";

import { createHash } from "node:crypto";
import { format } from "date-fns";
import { sendEmail } from "@/lib/utils/email";
import { DeliveryOutcomeUnknownError } from "@/lib/utils/email-errors";
import { getStudentsForEmail } from "@/lib/data/emails";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from "@/lib/data/emails";
import {
  emailTemplateSchema,
  type EmailTemplateInput,
} from "@/lib/validators/emails";

// ─── Placeholder substitution ────────────────────────────────────────────────
// Supported: @name @fullname @guardian @tutor @subject @amount @month @center

type PlaceholderContext = {
  studentFirstName: string;
  studentLastName: string;
  guardianFirstName?: string;
  tutorName?: string;
  subjectName?: string;
  amount?: string;
  month?: string;
};

function substitutePlaceholders(text: string, ctx: PlaceholderContext): string {
  return text
    .replace(/@name\b/g, ctx.studentFirstName)
    .replace(/@fullname\b/g, `${ctx.studentFirstName} ${ctx.studentLastName}`)
    .replace(/@guardian\b/g, ctx.guardianFirstName ?? ctx.studentFirstName)
    .replace(/@tutor\b/g, ctx.tutorName ?? "your tutor")
    .replace(/@subject\b/g, ctx.subjectName ?? "your subject")
    .replace(/@amount\b/g, ctx.amount ? `$${ctx.amount}` : "")
    .replace(/@month\b/g, ctx.month ?? format(new Date(), "MMMM yyyy"))
    .replace(/@center\b/g, "AR Educational Center");
}

type PreparedStudentEmail = {
  studentId: string;
  studentName: string;
  email: string;
  subject: string;
  body: string;
};

function deliveryDigest(deliveries: PreparedStudentEmail[]) {
  return createHash("sha256")
    .update(JSON.stringify(deliveries))
    .digest("hex");
}

async function prepareStudentEmails(input: {
  studentIds: string[];
  subject: string;
  body: string;
}) {
  const students = await getStudentsForEmail(input.studentIds);
  const byId = new Map(students.map((student) => [student.id, student]));
  const deliveries: PreparedStudentEmail[] = [];
  const unavailableStudentIds: string[] = [];

  for (const studentId of [...input.studentIds].sort()) {
    const student = byId.get(studentId);
    if (!student) {
      unavailableStudentIds.push(studentId);
      continue;
    }
    const recipientEmail =
      student.guardians[0]?.guardian.email ?? student.email;
    if (!recipientEmail) {
      unavailableStudentIds.push(studentId);
      continue;
    }

    const ctx: PlaceholderContext = {
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      guardianFirstName: student.guardians[0]?.guardian.firstName,
      tutorName: student.enrollments[0]
        ? `${student.enrollments[0].tutor.firstName} ${student.enrollments[0].tutor.lastName}`
        : undefined,
      subjectName: student.enrollments[0]?.subject.name,
      amount: (
        student.enrollments[0]?.customPriceOverride ??
        student.enrollments[0]?.priceAtEnrollment
      )?.toString(),
      month: format(new Date(), "MMMM yyyy"),
    };

    deliveries.push({
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      email: recipientEmail,
      subject: substitutePlaceholders(input.subject, ctx),
      body: substitutePlaceholders(input.body, ctx),
    });
  }

  return {
    deliveries,
    unavailableStudentIds,
    digest: deliveryDigest(deliveries),
  };
}

export async function getEmailDeliveryConfirmation(input: {
  studentIds: string[];
  subject: string;
  body: string;
}) {
  const prepared = await prepareStudentEmails(input);
  if (prepared.unavailableStudentIds.length > 0) {
    throw new Error(
      "Every selected student must exist and have a deliverable primary guardian or student email before approval.",
    );
  }
  return {
    digest: prepared.digest,
    recipients: prepared.deliveries.map((delivery) => ({
      studentId: delivery.studentId,
      name: delivery.studentName,
      email: delivery.email,
    })),
  };
}

// ─── Send to multiple students ────────────────────────────────────────────────

export async function sendEmailToStudents({
  studentIds,
  subject,
  body,
  idempotencyKey,
  expectedConfirmationDigest,
}: {
  studentIds: string[];
  subject: string;
  body: string;
  idempotencyKey?: string;
  expectedConfirmationDigest?: string;
}) {
  const prepared = await prepareStudentEmails({ studentIds, subject, body });
  if (
    expectedConfirmationDigest &&
    prepared.digest !== expectedConfirmationDigest
  ) {
    throw new Error(
      "The email recipients or personalized content changed after approval was requested. Review and approve a new email action.",
    );
  }

  const results: { studentId: string; email: string; success: boolean }[] = [];

  for (const delivery of prepared.deliveries) {
    try {
      await sendEmail({
        to: delivery.email,
        subject: delivery.subject,
        html: delivery.body
          .split("\n")
          .map((line) => `<p>${line}</p>`)
          .join(""),
        idempotencyKey: idempotencyKey
          ? `${idempotencyKey}:${delivery.studentId}`
          : undefined,
      });
      results.push({
        studentId: delivery.studentId,
        email: delivery.email,
        success: true,
      });
    } catch (error) {
      if (error instanceof DeliveryOutcomeUnknownError) throw error;
      results.push({
        studentId: delivery.studentId,
        email: delivery.email,
        success: false,
      });
    }
  }

  return {
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export { substitutePlaceholders };

export { listEmailTemplates };

export function createTemplate(input: EmailTemplateInput) {
  return createEmailTemplate(emailTemplateSchema.parse(input));
}

export function updateTemplate(id: string, input: EmailTemplateInput) {
  return updateEmailTemplate(id, emailTemplateSchema.parse(input));
}

export function deleteTemplate(id: string) {
  return deleteEmailTemplate(id);
}
