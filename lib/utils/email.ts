import { Resend } from "resend";
import { DeliveryOutcomeUnknownError } from "@/lib/utils/email-errors";

const resend = new Resend(process.env.RESEND_API);

export async function sendEmail({
  to,
  subject,
  html,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  let response: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    response = await resend.emails.send(
      {
        from: "AR Educational Center <onboarding@resend.dev>",
        to,
        subject,
        html,
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  } catch (error) {
    throw new DeliveryOutcomeUnknownError(
      "The email provider connection failed after delivery was attempted, so the delivery outcome is unknown.",
      { cause: error },
    );
  }

  const { data, error } = response;

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
