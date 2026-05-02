import { Prisma } from "../../generated/prisma";

export type DecimalLike = Prisma.Decimal | number | string;

export function formatUSD(amount: DecimalLike): string {
  const num =
    typeof amount === "object" && "toNumber" in amount
      ? (amount as Prisma.Decimal).toNumber()
      : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

export function toDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
