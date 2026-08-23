import "server-only";

import { createHash } from "node:crypto";
import {
  createPayment,
  listPayments,
  deletePayment,
  getPaymentStats as getPaymentStatsData,
  getEnrollmentPaymentCoverage,
  getActiveSubscriptionEnrollments,
  getEnrollmentForPaymentReminder,
  getEnrollmentPaymentDue,
  getEnrollmentPaymentDueQuote,
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
  getBillingCutoff,
  getPaidBillingMonths,
  getValidatedBillingPeriod,
  startOfBillingMonth,
} from "@/lib/services/pricing-calculator";
import { sendEmail } from "@/lib/utils/email";
import {
  plainTextToEmailHtml,
  substitutePlaceholders,
} from "@/lib/services/emails";
import { createEmailTemplate, getLatestEmailTemplate } from "@/lib/data/emails";
import {
  addCalendarMonths,
  getCalendarDateStart,
  getCalendarDateInTimeZone,
  getCalendarMonthKey,
  getCalendarMonthRange,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";

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

type PaymentDueStatus =
  | "ALL"
  | "OVERDUE"
  | "DUE_THIS_MONTH"
  | "UPCOMING"
  | "PAID";

const DEFAULT_PAYMENT_REMINDER_TEMPLATE = {
  name: "Payment Reminder",
  type: "PAYMENT_REMINDER" as const,
  subject: "Payment reminder — @subject (@month)",
  body: `Hello @guardian,\n\nThis is a friendly reminder that the payment for @name's @subject lessons is due for @month.\n\nAmount due: @amount\n\nPlease contact us to arrange payment or if you have any questions.\n\nThank you,\n@center`,
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
  recordedById: string,
  idempotencyKey?: string,
) {
  const parsed = createPaymentSchema.parse(input);
  if (parsed.enrollmentId) {
    const enrollment = await getEnrollmentPaymentDue(parsed.enrollmentId);
    if (!enrollment || enrollment.studentId !== parsed.studentId) {
      throw new Error("Payment enrollment does not belong to this student");
    }
    if (parsed.coversMonth) {
      getValidatedBillingPeriod(
        enrollment,
        parsed.coversMonth,
        getConfiguredCenterTimeZone(),
      );
    }
  }
  const timeZone = getConfiguredCenterTimeZone();
  return createPayment({
    studentId: parsed.studentId,
    amount: parsed.amount,
    method: parsed.method,
    paidAt: getCalendarDateStart(parsed.paidAt, timeZone),
    recordedById,
    enrollmentId: parsed.enrollmentId || undefined,
    coversMonth: parsed.coversMonth || undefined,
    notes: parsed.notes || undefined,
    idempotencyKey,
  });
}

export async function recordPaymentForDue(
  input: unknown,
  recordedById: string,
  idempotencyKey?: string,
) {
  const parsed = markPaymentPaidSchema.parse(input);
  const timeZone = getConfiguredCenterTimeZone();

  return createOutstandingPaymentForPeriod({
    studentId: parsed.studentId,
    method: parsed.method,
    paidAt: new Date(),
    recordedById,
    enrollmentId: parsed.enrollmentId,
    coversMonth: parsed.month,
    expectedOutstandingAmount: parsed.amount,
    calculateAmountDue: (enrollment) => {
      const { periodDate, billingPeriodIndex } = getValidatedBillingPeriod(
        enrollment,
        parsed.month,
        timeZone,
      );
      return applyDiscounts(
        enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
        enrollment.discounts,
        { calendarDate: periodDate, billingPeriodIndex, timeZone },
      );
    },
    idempotencyKey,
  });
}

export async function getPaymentDueQuote(input: unknown) {
  const parsed = markPaymentPaidSchema.parse(input);
  const enrollment = await getEnrollmentPaymentDueQuote(
    parsed.enrollmentId,
    parsed.month,
  );
  if (!enrollment || enrollment.studentId !== parsed.studentId) {
    throw new Error("Enrollment does not belong to this student");
  }

  const timeZone = getConfiguredCenterTimeZone();
  const { periodDate, billingPeriodIndex } = getValidatedBillingPeriod(
    enrollment,
    parsed.month,
    timeZone,
  );

  const amountDue = applyDiscounts(
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
    enrollment.discounts,
    {
      calendarDate: periodDate,
      billingPeriodIndex,
      timeZone,
    },
  );
  const outstanding = calculateOutstandingAmount(
    amountDue,
    enrollment.payments.map((payment) => payment.amount),
  );
  if (outstanding.isZero()) {
    throw new Error("This billing period is already paid");
  }

  return {
    parsed,
    confirmationArguments: {
      ...parsed,
      amount: outstanding.toFixed(2),
    },
    enrollment,
    amountDue,
  };
}

export async function deletePaymentById(id: string) {
  return deletePayment(id);
}

function paymentDueMatchesStatus(due: PaymentDue, status: PaymentDueStatus) {
  if (status === "OVERDUE") return due.isOverdue;
  if (status === "DUE_THIS_MONTH") return due.isDueThisMonth;
  if (status === "UPCOMING") {
    return !due.isPaid && !due.isOverdue && !due.isDueThisMonth;
  }
  if (status === "PAID") return due.isPaid;
  return true;
}

function paymentDuesForEnrollments(
  enrollments: Awaited<ReturnType<typeof getActiveSubscriptionEnrollments>>["enrollments"],
  monthDates: Date[],
  currentBillingMonth: Date,
  timeZone: string,
) {
  const dues: PaymentDue[] = [];
  for (const enrollment of enrollments) {
    const { student } = enrollment;
    const recipientEmail =
      student.guardians[0]?.guardian.email ?? student.email ?? null;
    const studentName = `${student.firstName} ${student.lastName}`;
    const periodMonths = billingPeriodMonths(enrollment.package.billingPeriod);
    const enrollmentStart = startOfBillingMonth(enrollment.startDate);
    const billingCutoff = getBillingCutoff(enrollment, timeZone);
    const finalBillingMonth = billingCutoff
      ? startOfBillingMonth(billingCutoff)
      : null;

    for (const monthDate of monthDates) {
      if (enrollmentStart > monthDate) continue;
      if (finalBillingMonth && monthDate > finalBillingMonth) continue;
      if (
        billingMonthDifference(monthDate, enrollmentStart) % periodMonths !== 0
      ) {
        continue;
      }

      const monthStr = formatBillingMonth(monthDate);
      const billingPeriodIndex =
        billingMonthDifference(monthDate, enrollmentStart) / periodMonths;
      const amountDecimal = applyDiscounts(
        enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
        enrollment.discounts,
        { calendarDate: monthDate, billingPeriodIndex, timeZone },
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
      const isPaid = outstandingAmount.isZero();
      dues.push({
        key: `${enrollment.id}_${monthStr}`,
        enrollmentId: enrollment.id,
        studentId: student.id,
        studentName,
        recipientEmail,
        subjectName: enrollment.subject.name,
        packageName: enrollment.package.name,
        amount: outstandingAmount.toFixed(2),
        month: monthStr,
        monthLabel,
        isPaid,
        isOverdue: !isPaid && monthDate < currentBillingMonth,
        isDueThisMonth:
          !isPaid && monthDate.getTime() === currentBillingMonth.getTime(),
      });
    }
  }
  return dues;
}

function sortPaymentDues(dues: PaymentDue[]) {
  dues.sort((a, b) => {
    const rank = (due: PaymentDue) => {
      if (due.isPaid) return 4;
      if (due.isOverdue) return 0;
      if (due.isDueThisMonth) return 1;
      return 2;
    };
    return rank(a) - rank(b) || a.month.localeCompare(b.month);
  });
  return dues;
}

function billingMonthRange(fromMonth: string, toMonth: string) {
  const from = new Date(`${fromMonth}-01T00:00:00.000Z`);
  const to = new Date(`${toMonth}-01T00:00:00.000Z`);
  const count = billingMonthDifference(to, from) + 1;
  if (count < 1 || count > 24) {
    throw new Error("Payment-due ranges must cover between 1 and 24 months");
  }
  return Array.from({ length: count }, (_, index) =>
    addBillingMonths(from, index),
  );
}

export async function getPaymentDuesForAssistant(input: {
  status: PaymentDueStatus;
  fromMonth: string;
  toMonth: string;
  page: number;
  limit: number;
}) {
  const timeZone = getConfiguredCenterTimeZone();
  const currentBillingMonth = startOfBillingMonth(
    getCalendarDateInTimeZone(new Date(), timeZone),
  );
  const monthDates = billingMonthRange(input.fromMonth, input.toMonth);
  const enrollmentPage = await getActiveSubscriptionEnrollments({
    page: input.page,
    limit: input.limit,
    paymentFromMonth: input.fromMonth,
    paymentToMonth: input.toMonth,
  });
  const dues = sortPaymentDues(
    paymentDuesForEnrollments(
      enrollmentPage.enrollments,
      monthDates,
      currentBillingMonth,
      timeZone,
    ).filter((due) => paymentDueMatchesStatus(due, input.status)),
  );
  return {
    total: enrollmentPage.total,
    page: enrollmentPage.page,
    limit: enrollmentPage.limit,
    hasMore: enrollmentPage.hasMore,
    from: input.fromMonth,
    to: input.toMonth,
    dues,
  };
}

export async function getUpcomingPaymentDues(): Promise<PaymentDue[]> {
  const timeZone = getConfiguredCenterTimeZone();
  const currentBillingMonth = startOfBillingMonth(
    getCalendarDateInTimeZone(new Date(), timeZone),
  );
  const monthDates = [-2, -1, 0, 1, 2].map((offset) =>
    addBillingMonths(currentBillingMonth, offset),
  );
  const fromMonth = formatBillingMonth(monthDates[0]);
  const toMonth = formatBillingMonth(monthDates.at(-1)!);
  const dues: PaymentDue[] = [];
  for (let page = 1; ; page += 1) {
    const enrollmentPage = await getActiveSubscriptionEnrollments({
      page,
      limit: 100,
      paymentFromMonth: fromMonth,
      paymentToMonth: toMonth,
    });
    dues.push(
      ...paymentDuesForEnrollments(
        enrollmentPage.enrollments,
        monthDates,
        currentBillingMonth,
        timeZone,
      ),
    );
    if (!enrollmentPage.hasMore) break;
  }
  return sortPaymentDues(dues);
}

export async function getEnrollmentPaidMonths(
  enrollmentIds: string[],
  months: string[],
): Promise<Array<{ enrollmentId: string; coversMonth: string }>> {
  const rows = await getEnrollmentPaymentCoverage(enrollmentIds, months);
  const timeZone = getConfiguredCenterTimeZone();
  const paid: Array<{ enrollmentId: string; coversMonth: string }> = [];
  for (const enrollment of rows) {
    for (const wantedMonth of getPaidBillingMonths(
      enrollment,
      months,
      timeZone,
    )) {
      paid.push({
        enrollmentId: enrollment.id,
        coversMonth: wantedMonth,
      });
    }
  }

  return paid;
}

export async function getPaymentStats() {
  const timeZone = getConfiguredCenterTimeZone();
  const currentMonthKey = getCalendarMonthKey(new Date(), timeZone);
  const currentRange = getCalendarMonthRange(currentMonthKey, timeZone);
  const previousMonthKey = addCalendarMonths(currentRange.calendarStart, -1)
    .toISOString()
    .slice(0, 7);
  const previousRange = getCalendarMonthRange(previousMonthKey, timeZone);

  return getPaymentStatsData({
    thisMonthStart: currentRange.start,
    thisMonthEndExclusive: currentRange.endExclusive,
    lastMonthStart: previousRange.start,
    lastMonthEndExclusive: previousRange.endExclusive,
  });
}

async function preparePaymentReminderDelivery(
  enrollmentId: string,
  month: string,
) {
  const [enrollment, template] = await Promise.all([
    getEnrollmentForPaymentReminder(enrollmentId, month),
    getLatestEmailTemplate("PAYMENT_REMINDER"),
  ]);

  if (!enrollment) throw new Error("Enrollment not found");

  const { student } = enrollment;
  const recipientEmail = student.guardians[0]?.guardian.email ?? student.email;

  if (!recipientEmail)
    throw new Error("No email address found for this student");

  const timeZone = getConfiguredCenterTimeZone();
  const { periodDate, billingPeriodIndex } = getValidatedBillingPeriod(
    enrollment,
    month,
    timeZone,
  );
  const amountDue = applyDiscounts(
    enrollment.customPriceOverride ?? enrollment.priceAtEnrollment,
    enrollment.discounts,
    {
      calendarDate: periodDate,
      billingPeriodIndex,
      timeZone,
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

  const activeTemplate = template ?? DEFAULT_PAYMENT_REMINDER_TEMPLATE;

  const emailSubject = substitutePlaceholders(activeTemplate.subject, ctx);
  const emailBody = substitutePlaceholders(activeTemplate.body, ctx);
  const emailHtml = plainTextToEmailHtml(emailBody);

  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        enrollmentId,
        month,
        recipientEmail,
        amount,
        subject: emailSubject,
        html: emailHtml,
      }),
    )
    .digest("hex");

  return {
    digest,
    recipientEmail,
    recipientName: `${student.firstName} ${student.lastName}`,
    amount,
    monthLabel,
    subject: emailSubject,
    bodyPreview:
      emailBody.length <= 2_000
        ? emailBody
        : `${emailBody.slice(0, 1_999)}…`,
    html: emailHtml,
    usedDefaultTemplate: !template,
  };
}

export async function getPaymentReminderConfirmation(
  enrollmentId: string,
  month: string,
) {
  const prepared = await preparePaymentReminderDelivery(enrollmentId, month);
  return {
    digest: prepared.digest,
    recipientEmail: prepared.recipientEmail,
    recipientName: prepared.recipientName,
    amount: prepared.amount,
    monthLabel: prepared.monthLabel,
    subject: prepared.subject,
    bodyPreview: prepared.bodyPreview,
  };
}

export async function sendPaymentReminderEmail(
  enrollmentId: string,
  month: string,
  idempotencyKey?: string,
  expectedConfirmationDigest?: string,
) {
  const prepared = await preparePaymentReminderDelivery(enrollmentId, month);
  if (
    expectedConfirmationDigest &&
    prepared.digest !== expectedConfirmationDigest
  ) {
    throw new Error(
      "The reminder recipient, amount, or message changed after approval was requested. Review and approve a new reminder action.",
    );
  }

  // Preserve the manual workflow's default-template behavior without using a
  // mutable template value for the approved delivery itself.
  if (prepared.usedDefaultTemplate) {
    await createEmailTemplate(DEFAULT_PAYMENT_REMINDER_TEMPLATE);
  }

  await sendEmail({
    to: prepared.recipientEmail,
    subject: prepared.subject,
    html: prepared.html,
    idempotencyKey,
  });
}

export { listPayments, getStudentBalance };
