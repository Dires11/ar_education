import "server-only";

import { sendEmail } from "@/lib/utils/email";
import { subHours, format } from "date-fns";
import {
  enqueueSessionReminderData,
  getDueReminders,
  getSessionForReminder,
  updateReminderDelivery,
} from "@/lib/data/notifications";

// ─── Email templates ─────────────────────────────────────────────────────────

function sessionUpcomingTemplate(payload: {
  studentName: string;
  tutorName: string;
  subjectName: string;
  scheduledFor: string;
  room?: string;
}) {
  const { studentName, tutorName, subjectName, scheduledFor, room } = payload;
  return {
    subject: `Reminder: ${subjectName} session tomorrow`,
    html: `
      <p>Hello,</p>
      <p>This is a reminder that <strong>${studentName}</strong> has a <strong>${subjectName}</strong> session scheduled for:</p>
      <p><strong>${scheduledFor}</strong>${room ? ` in ${room}` : ""}</p>
      <p>Tutor: <strong>${tutorName}</strong></p>
      <p>Please reply to this email if you need to reschedule.</p>
      <p>Thank you,<br/>AR Educational Center</p>
    `,
  };
}

function paymentDueTemplate(payload: {
  studentName: string;
  amount: string;
}) {
  const { studentName, amount } = payload;
  return {
    subject: `Payment reminder for ${studentName}`,
    html: `
      <p>Hello,</p>
      <p>This is a reminder that a payment of <strong>${amount}</strong> is outstanding for <strong>${studentName}</strong>.</p>
      <p>Please contact us to arrange payment.</p>
      <p>Thank you,<br/>AR Educational Center</p>
    `,
  };
}

function packageEndingTemplate(payload: {
  studentName: string;
  packageName: string;
  endDate: string;
}) {
  const { studentName, packageName, endDate } = payload;
  return {
    subject: `Package ending soon — ${studentName}`,
    html: `
      <p>Hello,</p>
      <p>This is a reminder that <strong>${studentName}</strong>'s enrollment in <strong>${packageName}</strong> ends on <strong>${endDate}</strong>.</p>
      <p>Please contact us to renew or discuss next steps.</p>
      <p>Thank you,<br/>AR Educational Center</p>
    `,
  };
}

// ─── Enqueueing ───────────────────────────────────────────────────────────────

/**
 * Enqueue a session_upcoming reminder for a session.
 * Sends to the primary guardian email (or student if none).
 * Scheduled 24 hours before the session.
 */
export async function enqueueSessionReminder(sessionId: string) {
  const session = await getSessionForReminder(sessionId);

  if (!session) throw new Error("Session not found");

  const scheduledFor = format(new Date(session.scheduledFor), "EEEE, MMMM d 'at' h:mm a");

  for (const attendance of session.attendance) {
    const student = attendance.student;
    const primaryGuardian = student.guardians[0]?.guardian;
    const recipientEmail = primaryGuardian?.email;

    if (!recipientEmail) continue;

    const payload = {
      studentName: `${student.firstName} ${student.lastName}`,
      tutorName: `${session.tutor.firstName} ${session.tutor.lastName}`,
      subjectName: session.subject.name,
      scheduledFor,
      room: session.room ?? undefined,
    };

    await enqueueSessionReminderData({
      recipientEmail,
      payload,
      scheduledFor: subHours(new Date(session.scheduledFor), 24),
      sessionId: session.id,
    });
  }
}

// ─── Sending (disabled until automatic reminders are explicitly enabled) ─────

/**
 * Find all pending reminders that are due, send them, mark SENT/FAILED.
 * Returns counts.
 */
export async function processDueReminders(): Promise<{
  sent: number;
  failed: number;
}> {
  const due = await getDueReminders(new Date());

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    try {
      const payload = reminder.payload as Record<string, string>;
      let template: { subject: string; html: string };

      switch (reminder.type) {
        case "SESSION_UPCOMING":
          template = sessionUpcomingTemplate(payload as Parameters<typeof sessionUpcomingTemplate>[0]);
          break;
        case "PAYMENT_DUE":
          template = paymentDueTemplate(payload as Parameters<typeof paymentDueTemplate>[0]);
          break;
        case "PACKAGE_ENDING":
          template = packageEndingTemplate(payload as Parameters<typeof packageEndingTemplate>[0]);
          break;
        default:
          continue;
      }

      await sendEmail({
        to: reminder.recipientEmail,
        subject: template.subject,
        html: template.html,
      });

      await updateReminderDelivery(reminder.id, "SENT");

      sent++;
    } catch {
      await updateReminderDelivery(reminder.id, "FAILED");
      failed++;
    }
  }

  return { sent, failed };
}
