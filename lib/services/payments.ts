import {
  format,
  startOfMonth,
  isBefore,
  addMonths,
  isSameMonth,
  differenceInCalendarMonths,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { createPayment, listPayments, deletePayment, getPaymentStats } from "@/lib/data/payments";
import {
  createPaymentSchema,
  type CreatePaymentInput,
} from "@/lib/validators/payments";
import { getStudentBalance } from "@/lib/services/pricing";
import { sendEmail } from "@/lib/utils/email";
import { substitutePlaceholders } from "@/lib/services/emails";

export type PaymentDue = {
  key: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  recipientEmail: string | null;
  subjectName: string;
  packageName: string;
  amount: string;
  month: string; // "2026-04"
  monthLabel: string; // "April 2026"
  isPaid: boolean;
  isOverdue: boolean;
  isDueThisMonth: boolean;
};

function billingPeriodMonths(period: "MONTHLY" | "THREE_MONTHS" | "YEARLY") {
  if (period === "YEARLY") return 12;
  if (period === "THREE_MONTHS") return 3;
  return 1;
}

export async function recordPayment(
  input: CreatePaymentInput,
  recordedById: string
) {
  const parsed = createPaymentSchema.parse(input);
  return createPayment({
    studentId: parsed.studentId,
    amount: parsed.amount,
    method: parsed.method,
    paidAt: new Date(parsed.paidAt),
    recordedById,
    enrollmentId: parsed.enrollmentId || undefined,
    coversMonth: parsed.coversMonth || undefined,
    notes: parsed.notes || undefined,
  });
}

export async function deletePaymentById(id: string) {
  return deletePayment(id);
}

export async function getUpcomingPaymentDues(): Promise<PaymentDue[]> {
  const today = new Date();
  const offsets = [-2, -1, 0, 1, 2];

  const enrollments = await prisma.enrollment.findMany({
    where: { status: "ACTIVE", package: { type: "MONTHLY" } },
    include: {
      student: {
        include: {
          guardians: {
            where: { isPrimary: true },
            include: { guardian: true },
          },
        },
      },
      package: true,
      subject: true,
      payments: {
        where: { coversMonth: { not: null } },
        select: { coversMonth: true },
      },
    },
  });

  const dues: PaymentDue[] = [];

  for (const enrollment of enrollments) {
    const { student } = enrollment;
    const recipientEmail =
      student.guardians[0]?.guardian.email ?? student.email ?? null;
    const studentName = `${student.firstName} ${student.lastName}`;
    const amount = (
      enrollment.customPriceOverride ?? enrollment.package.basePrice
    ).toString();
    const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
    const enrollmentStart = startOfMonth(new Date(enrollment.startDate));

    for (const offset of offsets) {
      const monthDate = addMonths(startOfMonth(today), offset);

      // Skip months before enrollment started
      if (enrollmentStart > monthDate) continue;
      if (differenceInCalendarMonths(monthDate, enrollmentStart) % periodMonths !== 0) {
        continue;
      }

      const monthStr = format(monthDate, "yyyy-MM");
      const periodEnd = addMonths(monthDate, periodMonths - 1);
      const monthLabel =
        periodMonths === 1
          ? format(monthDate, "MMMM yyyy")
          : `${format(monthDate, "MMM yyyy")} - ${format(periodEnd, "MMM yyyy")}`;
      const coveredMonths = Array.from({ length: periodMonths }, (_, index) =>
        format(addMonths(monthDate, index), "yyyy-MM")
      );
      const isPaid = enrollment.payments.some((p) =>
        p.coversMonth ? coveredMonths.includes(p.coversMonth) : false
      );

      dues.push({
        key: `${enrollment.id}_${monthStr}`,
        enrollmentId: enrollment.id,
        studentId: student.id,
        studentName,
        recipientEmail,
        subjectName: enrollment.subject.name,
        packageName: enrollment.package.name,
        amount,
        month: monthStr,
        monthLabel,
        isPaid,
        isOverdue: !isPaid && isBefore(monthDate, startOfMonth(today)),
        isDueThisMonth: !isPaid && isSameMonth(monthDate, today),
      });
    }
  }

  dues.sort((a, b) => {
    const rank = (d: PaymentDue) => {
      if (d.isPaid) return 4;
      if (d.isOverdue) return 0;
      if (d.isDueThisMonth) return 1;
      return 2;
    };
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.month.localeCompare(b.month);
  });

  return dues;
}

export async function sendPaymentReminderEmail(
  enrollmentId: string,
  month: string
) {
  const [enrollment, template] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        student: {
          include: {
            guardians: {
              where: { isPrimary: true },
              include: { guardian: true },
            },
          },
        },
        package: true,
        subject: true,
        tutor: true,
      },
    }),
    prisma.emailTemplate.findFirst({
      where: { type: "PAYMENT_REMINDER" },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  if (!enrollment) throw new Error("Enrollment not found");

  const { student } = enrollment;
  const recipientEmail =
    student.guardians[0]?.guardian.email ?? student.email;

  if (!recipientEmail)
    throw new Error("No email address found for this student");

  const amount = (
    enrollment.customPriceOverride ?? enrollment.package.basePrice
  ).toString();
  const monthLabel = format(new Date(month + "-01"), "MMMM yyyy");

  const ctx = {
    studentFirstName: student.firstName,
    studentLastName: student.lastName,
    guardianFirstName: student.guardians[0]?.guardian.firstName,
    tutorName: `${enrollment.tutor.firstName} ${enrollment.tutor.lastName}`,
    subjectName: enrollment.subject.name,
    amount,
    month: monthLabel,
  };

  // Auto-create the default template if it was deleted
  const activeTemplate =
    template ??
    (await prisma.emailTemplate.create({
      data: {
        name: "Payment Reminder",
        type: "PAYMENT_REMINDER",
        subject: "Payment reminder — @subject (@month)",
        body: `Hello @guardian,\n\nThis is a friendly reminder that the payment for @name's @subject lessons is due for @month.\n\nAmount due: @amount\n\nPlease contact us to arrange payment or if you have any questions.\n\nThank you,\n@center`,
      },
    }));

  const emailSubject = substitutePlaceholders(activeTemplate.subject, ctx);
  const emailHtml = substitutePlaceholders(activeTemplate.body, ctx)
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("");

  await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
  });
}

export { listPayments, getStudentBalance, getPaymentStats };
