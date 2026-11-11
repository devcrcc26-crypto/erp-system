export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string;
  sessionId: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  companyId: string;
  sessionId: string;
}
