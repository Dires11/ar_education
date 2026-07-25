import { describe, expect, it } from "vitest";
import { authorizeCronRequest } from "@/lib/services/cron-authorization";

describe("cron authorization", () => {
  it("fails closed when no cron secret is configured", () => {
    expect(authorizeCronRequest(null, undefined)).toBe("MISCONFIGURED");
    expect(authorizeCronRequest(null, "")).toBe("MISCONFIGURED");
  });

  it("rejects missing and incorrect bearer tokens", () => {
    expect(authorizeCronRequest(null, "secret")).toBe("UNAUTHORIZED");
    expect(authorizeCronRequest("Bearer wrong", "secret")).toBe(
      "UNAUTHORIZED",
    );
  });

  it("accepts the configured bearer token", () => {
    expect(authorizeCronRequest("Bearer secret", "secret")).toBe("AUTHORIZED");
  });
});
