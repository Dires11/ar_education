import { z } from "zod";

export const idSchema = z.string().trim().min(1).max(128);

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
    "Invalid date",
  );

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: "Invalid date and time" });

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const positiveIntegerStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Enter a positive whole number");

export const positiveMoneySchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
    "Enter a positive amount with at most two decimal places",
  )
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

export const optionalPositiveMoneySchema = z
  .union([positiveMoneySchema, z.literal("")])
  .optional();

export const optionalIdSchema = z.union([idSchema, z.literal("")]).optional();

export const optionalDateSchema = z.union([dateSchema, z.literal("")]).optional();

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
