import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import crypto from "node:crypto";

export function extractBearer(header?: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return undefined;
  return parts[1];
}

export function verifyToken(expected: string, provided: string): boolean {
  if (expected.length === 0 || provided.length === 0) return false;
  const expBuf = Buffer.from(expected, "utf-8");
  const provBuf = Buffer.from(provided, "utf-8");
  if (expBuf.length !== provBuf.length) return false;
  return crypto.timingSafeEqual(expBuf, provBuf);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly token: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const bearer = extractBearer(header);
    if (!bearer || !verifyToken(this.token, bearer)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
