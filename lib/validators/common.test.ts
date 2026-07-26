import { describe, expect, it } from "vitest";
import { dateSchema } from "@/lib/validators/common";

describe("date validation", () => {
  it.each(["2024-02-29", "2026-01-31", "0000-01-01"])(
    "accepts the real calendar date %s",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01"])(
    "rejects the nonexistent calendar date %s",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(false);
    },
  );
});
