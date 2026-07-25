"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/utils/auth";
import {
  recordPayment,
  recordPaymentForDue,
  deletePaymentById,
  sendPaymentReminderEmail,
} from "@/lib/services/payments";
import type { CreatePaymentInput } from "@/lib/validators/payments";
import { idSchema, monthSchema } from "@/lib/validators/common";

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
  await recordPaymentForDue(data, admin.id);
  revalidatePath("/payments");
  revalidatePath(`/students/${data.studentId}`);
  return { success: true };
}

export async function sendPaymentReminderAction(
  enrollmentId: string,
  month: string
) {
  await requireAdmin();
  await sendPaymentReminderEmail(
    idSchema.parse(enrollmentId),
    monthSchema.parse(month),
  );
  return { success: true };
}

export async function deletePaymentAction(
  paymentId: string,
  studentId: string
) {
  await requireAdmin();
  await deletePaymentById(idSchema.parse(paymentId));
  revalidatePath("/payments");
  revalidatePath(`/students/${idSchema.parse(studentId)}`);
  return { success: true };
}
