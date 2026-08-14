import type { Request } from "express";
import type { AuthPrincipal } from "../auth/auth.types.js";

export interface AhaRequest extends Request {
  requestId?: string;
  requestStartedAt?: bigint;
  principal?: AuthPrincipal;
}
