import { timingSafeEqual } from "node:crypto";

export type CronAuthorization =
  | "AUTHORIZED"
  | "MISCONFIGURED"
  | "UNAUTHORIZED";

function safelyEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function authorizeCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): CronAuthorization {
  if (!cronSecret) return "MISCONFIGURED";
  if (!authorizationHeader) return "UNAUTHORIZED";

  return safelyEqual(authorizationHeader, `Bearer ${cronSecret}`)
    ? "AUTHORIZED"
    : "UNAUTHORIZED";
}
