import "server-only";

import {
  createPayment,
  listPayments,
  deletePayment,
  getPaymentStats,
  getEnrollmentPaymentCoverage,
  getActiveSubscriptionEnrollments,
  getEnrollmentForPaymentReminder,
  getEnrollmentPaymentDue,
  getEnrollmentStudentForPayment,
  createOutstandingPaymentForPeriod,
} from "@/lib/data/payments";
import {
  createPaymentSchema,
  markPaymentPaidSchema,
  type CreatePaymentInput,
} from "@/lib/validators/payments";
import { getStudentBalance } from "@/lib/services/pricing";
import {
  addBillingMonths,
  applyDiscounts,
  billingMonthDifference,
  billingPeriodMonths,
  calculateOutstandingAmount,
  startOfBillingMonth,
} from "@/lib/services/pricing-calculator";
import { sendEmail } from "@/lib/utils/email";
import { substitutePlaceholders } from "@/lib/services/emails";
import { Prisma } from "../../generated/prisma";
import {
  createEmailTemplate,
  getLatestEmailTemplate,
} from "@/lib/data/emails";

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

function formatBillingMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function formatBillingMonthLabel(date: Date, short = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function recordPayment(
  input: CreatePaymentInput,
  recordedById: string
) {
  const parsed = createPaymentSchema.parse(input);
  if (parsed.enrollmentId) {
    const enrollment = await getEnrollmentStudentForPayment(
      parsed.enrollmentId,
    );
    if (!enrollment || enrollment.studentId !== parsed.studentId) {
      throw new Error("Payment enrollment does not belong to this student");
    }
  }
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

export async function recordPaymentForDue(
  input: unknown,
  recordedById: string,
) {
  const parsed = markPaymentPaidSchema.parse(input);
  const enrollment = await getEnrollmentPaymentDue(parsed.enrollmentId);
  if (!enrollment || enrollment.studentId !== parsed.studentId) {
    throw new Error("Enrollment does not belong to this student");
  }
  if (enrollment.package.type !== "MONTHLY") {
    throw new Error("Only subscription enrollments have monthly dues");
  }

  const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
  const enrollmentStart = startOfBillingMonth(enrollment.startDate);
  const periodDate = new Date(`${parsed.month}-01T00:00:00.000Z`);
  const monthsFromStart = billingMonthDifference(
    periodDate,
    enrollmentStart,
  );
  if (monthsFromStart < 0 || monthsFromStart % periodMonths !== 0) {
    throw new Error("That month is not a billing period for this enrollment");
  }

  const amountDue = applyDiscounts(
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
    enrollment.discounts,
    {
      date: periodDate,
      billingPeriodIndex: monthsFromStart / periodMonths,
    },
  );
  return createOutstandingPaymentForPeriod({
    studentId: parsed.studentId,
    method: parsed.method,
    paidAt: new Date(),
    recordedById,
    enrollmentId: parsed.enrollmentId,
    coversMonth: parsed.month,
    amountDue,
  });
}

export async function deletePaymentById(id: string) {
  return deletePayment(id);
}

export async function getUpcomingPaymentDues(): Promise<PaymentDue[]> {
  const today = new Date();
  const currentBillingMonth = startOfBillingMonth(today);
  const offsets = [-2, -1, 0, 1, 2];

  const enrollments = await getActiveSubscriptionEnrollments();

  const dues: PaymentDue[] = [];

  for (const enrollment of enrollments) {
    const { student } = enrollment;
    const recipientEmail =
      student.guardians[0]?.guardian.email ?? student.email ?? null;
    const studentName = `${student.firstName} ${student.lastName}`;
    const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
    const enrollmentStart = startOfBillingMonth(enrollment.startDate);

    for (const offset of offsets) {
      const monthDate = addBillingMonths(currentBillingMonth, offset);

      // Skip months before enrollment started
      if (enrollmentStart > monthDate) continue;
      if (billingMonthDifference(monthDate, enrollmentStart) % periodMonths !== 0) {
        continue;
      }

      const monthStr = formatBillingMonth(monthDate);
      const billingPeriodIndex =
        billingMonthDifference(monthDate, enrollmentStart) / periodMonths;
      const amountDecimal = applyDiscounts(
        enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
        enrollment.discounts,
        { date: monthDate, billingPeriodIndex },
      );
      const periodEnd = addBillingMonths(monthDate, periodMonths - 1);
      const monthLabel =
        periodMonths === 1
          ? formatBillingMonthLabel(monthDate)
          : `${formatBillingMonthLabel(monthDate, true)} - ${formatBillingMonthLabel(periodEnd, true)}`;
      const paymentAmounts = enrollment.payments
        .filter((payment) => payment.coversMonth === monthStr)
        .map((payment) => payment.amount);
      const outstandingAmount = calculateOutstandingAmount(
        amountDecimal,
        paymentAmounts,
      );
      const amount = outstandingAmount.toFixed(2);
      const isPaid = outstandingAmount.isZero();

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
        isOverdue: !isPaid && monthDate < currentBillingMonth,
        isDueThisMonth:
          !isPaid && monthDate.getTime() === currentBillingMonth.getTime(),
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

export async function getEnrollmentPaidMonths(
  enrollmentIds: string[],
  months: string[],
): Promise<Array<{ enrollmentId: string; coversMonth: string }>> {
  const rows = await getEnrollmentPaymentCoverage(enrollmentIds, months);
  const wantedMonths = new Set(months);
  const paymentsByPeriod = new Map<
    string,
    { total: Prisma.Decimal; row: (typeof rows)[number] }
  >();

  for (const row of rows) {
    if (!row.enrollmentId || !row.coversMonth || !row.enrollment) continue;
    const key = `${row.enrollmentId}:${row.coversMonth}`;
    const existing = paymentsByPeriod.get(key);
    if (existing) {
      existing.total = existing.total.add(row.amount);
    } else {
      paymentsByPeriod.set(key, {
        total: new Prisma.Decimal(row.amount),
        row,
      });
    }
  }

  const paid: Array<{ enrollmentId: string; coversMonth: string }> = [];
  for (const { total, row } of paymentsByPeriod.values()) {
    const enrollment = row.enrollment!;
    const periodMonths = billingPeriodMonths(
      enrollment.package.billingPeriod,
    );
    const periodStart = new Date(
      `${row.coversMonth}-01T00:00:00.000Z`,
    );
    const billingPeriodIndex = Math.floor(
      billingMonthDifference(
        periodStart,
        startOfBillingMonth(enrollment.startDate),
      ) / periodMonths,
    );
    const amountDue = applyDiscounts(
      enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
      enrollment.discounts,
      { date: periodStart, billingPeriodIndex },
    );
    if (total.lessThan(amountDue)) continue;

    for (let offset = 0; offset < periodMonths; offset++) {
      const coveredMonth = formatBillingMonth(
        addBillingMonths(periodStart, offset),
      );
      if (wantedMonths.has(coveredMonth)) {
        paid.push({
          enrollmentId: row.enrollmentId!,
          coversMonth: coveredMonth,
        });
      }
    }
  }
  return paid;
}

export async function sendPaymentReminderEmail(
  enrollmentId: string,
  month: string
) {
  const [enrollment, template] = await Promise.all([
    getEnrollmentForPaymentReminder(enrollmentId, month),
    getLatestEmailTemplate("PAYMENT_REMINDER"),
  ]);

  if (!enrollment) throw new Error("Enrollment not found");

  const { student } = enrollment;
  const recipientEmail =
    student.guardians[0]?.guardian.email ?? student.email;

  if (!recipientEmail)
    throw new Error("No email address found for this student");

  const periodDate = new Date(`${month}-01T00:00:00.000Z`);
  const amountDue = applyDiscounts(
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
    enrollment.discounts,
    {
      date: periodDate,
      billingPeriodIndex: Math.max(
        0,
        Math.floor(
          billingMonthDifference(
            periodDate,
            startOfBillingMonth(enrollment.startDate),
          ) / billingPeriodMonths(enrollment.package.billingPeriod),
        ),
      ),
    },
  );
  const outstandingAmount = calculateOutstandingAmount(
    amountDue,
    enrollment.payments.map((payment) => payment.amount),
  );
  if (outstandingAmount.isZero()) {
    throw new Error("This billing period is already paid");
  }

  const amount = outstandingAmount.toFixed(2);
  const monthLabel = formatBillingMonthLabel(periodDate);

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
    (await createEmailTemplate({
        name: "Payment Reminder",
        type: "PAYMENT_REMINDER",
        subject: "Payment reminder — @subject (@month)",
        body: `Hello @guardian,\n\nThis is a friendly reminder that the payment for @name's @subject lessons is due for @month.\n\nAmount due: @amount\n\nPlease contact us to arrange payment or if you have any questions.\n\nThank you,\n@center`,
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
