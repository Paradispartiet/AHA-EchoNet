import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AhaRequest } from "../common/request-context.js";
import { AUTH_TOKEN_VERIFIER, type TokenVerifier } from "./auth.types.js";
import { IS_PUBLIC_ROUTE } from "./public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AhaRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw unauthorized();

    try {
      request.principal = await this.tokenVerifier.verify(token);
      return true;
    } catch {
      throw unauthorized();
    }
  }
}

function extractBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer ([^\s]+)$/);
  return match?.[1] || null;
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    error: "Unauthorized",
    message: "A valid bearer token is required"
  });
}
