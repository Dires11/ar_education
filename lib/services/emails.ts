import "server-only";

import { format } from "date-fns";
import { sendEmail } from "@/lib/utils/email";
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

// ─── Send to multiple students ────────────────────────────────────────────────

export async function sendEmailToStudents({
  studentIds,
  subject,
  body,
}: {
  studentIds: string[];
  subject: string;
  body: string;
}) {
  const students = await getStudentsForEmail(studentIds);

  const results: { studentId: string; email: string; success: boolean }[] = [];

  for (const student of students) {
    const recipientEmail =
      student.guardians[0]?.guardian.email ?? student.email;
    if (!recipientEmail) continue;

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

    const personalizedSubject = substitutePlaceholders(subject, ctx);
    const personalizedBody = substitutePlaceholders(body, ctx);

    try {
      await sendEmail({
        to: recipientEmail,
        subject: personalizedSubject,
        html: personalizedBody
          .split("\n")
          .map((line) => `<p>${line}</p>`)
          .join(""),
      });
      results.push({ studentId: student.id, email: recipientEmail, success: true });
    } catch {
      results.push({ studentId: student.id, email: recipientEmail, success: false });
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
