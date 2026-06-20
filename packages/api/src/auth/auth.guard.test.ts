import { describe, it, expect, vi } from "vitest";
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuthGuard, extractBearer, verifyToken } from "./auth.guard.js";

const VALID_TOKEN = "correct-token";
const WRONG_TOKEN = "wrong-token";

describe("extractBearer", () => {
  it("returns token for 'Bearer <token>' header", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
  });

  it("returns undefined for missing header", () => {
    expect(extractBearer(undefined)).toBeUndefined();
  });

  it("returns undefined for malformed header (no Bearer prefix)", () => {
    expect(extractBearer("Basic abc123")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractBearer("")).toBeUndefined();
  });
});

describe("verifyToken", () => {
  it("returns true when tokens match", () => {
    expect(verifyToken(VALID_TOKEN, VALID_TOKEN)).toBe(true);
  });

  it("returns false when tokens differ", () => {
    expect(verifyToken(VALID_TOKEN, WRONG_TOKEN)).toBe(false);
  });

  it("returns false when expected token is empty", () => {
    expect(verifyToken("", VALID_TOKEN)).toBe(false);
  });

  it("returns false when provided token is empty", () => {
    expect(verifyToken(VALID_TOKEN, "")).toBe(false);
  });

  it("returns false when both tokens are empty", () => {
    expect(verifyToken("", "")).toBe(false);
  });
});

describe("AuthGuard", () => {
  const guard = new AuthGuard(VALID_TOKEN);

  function createMockContext(headers: Record<string, string>): ExecutionContext {
    const http = {
      getRequest: () => ({ headers }),
    };
    return {
      switchToHttp: () => http,
    } as ExecutionContext;
  }

  it("throws UnauthorizedException for missing Authorization and x-api-key headers", () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException for malformed Authorization header", () => {
    const ctx = createMockContext({ authorization: "Basic abc123" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throws UnauthorizedException for wrong Bearer token", () => {
    const ctx = createMockContext({ authorization: "Bearer wrong-token" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("returns true for correct Bearer token", () => {
    const ctx = createMockContext({ authorization: "Bearer correct-token" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("returns true for correct x-api-key header", () => {
    const ctx = createMockContext({ "x-api-key": VALID_TOKEN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws UnauthorizedException for wrong x-api-key header", () => {
    const ctx = createMockContext({ "x-api-key": WRONG_TOKEN });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("returns true when x-api-key is correct even if Authorization header is malformed", () => {
    const ctx = createMockContext({ authorization: "Basic abc123", "x-api-key": VALID_TOKEN });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
