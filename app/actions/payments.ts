"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  recordPayment,
  deletePaymentById,
  sendPaymentReminderEmail,
} from "@/lib/services/payments";
import { createPayment } from "@/lib/data/payments";
import type { CreatePaymentInput } from "@/lib/validators/payments";

export async function createPaymentAction(input: CreatePaymentInput) {
  const admin = await requireAdmin();
  const payment = await recordPayment(input, admin.id);
  revalidatePath("/payments");
  revalidatePath(`/students/${input.studentId}`);
  return { success: true, id: payment.id };
}

export async function markPaymentPaidAction(data: {
  enrollmentId: string;
  studentId: string;
  amount: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  month: string;
}) {
  const admin = await requireAdmin();
  await createPayment({
    studentId: data.studentId,
    amount: data.amount,
    method: data.method,
    paidAt: new Date(),
    recordedById: admin.id,
    enrollmentId: data.enrollmentId,
    coversMonth: data.month,
  });
  revalidatePath("/payments");
  revalidatePath(`/students/${data.studentId}`);
  return { success: true };
}

export async function sendPaymentReminderAction(
  enrollmentId: string,
  month: string
) {
  await requireAdmin();
  await sendPaymentReminderEmail(enrollmentId, month);
  return { success: true };
}

export async function deletePaymentAction(
  paymentId: string,
  studentId: string
) {
  await requireAdmin();
  await deletePaymentById(paymentId);
  revalidatePath("/payments");
  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
