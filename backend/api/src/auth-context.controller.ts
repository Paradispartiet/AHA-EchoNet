import { Controller, Get, Req } from "@nestjs/common";
import type { AhaRequest } from "./common/request-context.js";

@Controller("v1/auth")
export class AuthContextController {
  @Get("context")
  context(@Req() request: AhaRequest) {
    const principal = request.principal;
    return {
      authenticated: Boolean(principal),
      requestId: request.requestId,
      principal: principal
        ? {
            subject: principal.subject,
            provider: principal.provider,
            issuer: principal.issuer,
            audience: principal.audience
          }
        : null
    };
  }
}
