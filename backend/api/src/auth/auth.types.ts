export interface AuthPrincipal {
  subject: string;
  provider: string;
  issuer: string;
  audience: readonly string[];
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}

export const AUTH_TOKEN_VERIFIER = Symbol("AUTH_TOKEN_VERIFIER");
