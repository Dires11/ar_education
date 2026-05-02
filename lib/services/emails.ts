import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/utils/email";

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
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      guardians: {
        where: { isPrimary: true },
        include: { guardian: true },
      },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { tutor: true, subject: true, package: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

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
      amount: student.enrollments[0]?.package.basePrice.toString(),
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
