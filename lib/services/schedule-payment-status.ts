export function getSchedulePaymentStatus(input: {
  enrollmentId: string | null;
  monthKey: string;
  subscriptionEnrollmentIds: ReadonlySet<string>;
  paidMonths: ReadonlySet<string>;
}): boolean | null {
  if (
    !input.enrollmentId ||
    !input.subscriptionEnrollmentIds.has(input.enrollmentId)
  ) {
    return null;
  }

  return input.paidMonths.has(
    `${input.enrollmentId}:${input.monthKey}`,
  );
}
