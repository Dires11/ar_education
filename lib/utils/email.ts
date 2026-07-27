import { Resend } from "resend";

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
  const { data, error } = await resend.emails.send(
    {
      from: "AR Educational Center <onboarding@resend.dev>",
      to,
      subject,
      html,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
