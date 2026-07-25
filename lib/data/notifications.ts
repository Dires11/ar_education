import "server-only";

import { Prisma } from "../../generated/prisma";
import { prisma } from "@/lib/prisma";

export function getSessionForReminder(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      tutor: true,
      subject: true,
      attendance: {
        include: {
          student: {
            include: {
              guardians: {
                where: { isPrimary: true },
                include: { guardian: true },
              },
            },
          },
        },
      },
    },
  });
}

export function enqueueSessionReminderData(input: {
  sessionId: string;
  recipientEmail: string;
  payload: Prisma.InputJsonValue;
  scheduledFor: Date;
}) {
  return prisma.reminder.upsert({
    where: {
      sessionId_recipientEmail_type: {
        sessionId: input.sessionId,
        recipientEmail: input.recipientEmail,
        type: "SESSION_UPCOMING",
      },
    },
    create: {
      ...input,
      type: "SESSION_UPCOMING",
    },
    update: {
      payload: input.payload,
      scheduledFor: input.scheduledFor,
      status: "PENDING",
      sentAt: null,
    },
  });
}

export function getDueReminders(now: Date) {
  return prisma.reminder.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
  });
}

export function updateReminderDelivery(
  id: string,
  status: "SENT" | "FAILED",
) {
  return prisma.reminder.update({
    where: { id },
    data: {
      status,
      sentAt: status === "SENT" ? new Date() : undefined,
    },
  });
}
