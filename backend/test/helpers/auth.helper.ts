import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  userId: string;
}

/**
 * Logs in with email/password and returns tokens from the API envelope.
 */
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<LoginResult> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(201);

  const body = response.body as {
    success: boolean;
    data: {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
      user: { id: string };
    };
  };

  return {
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    sessionId: body.data.sessionId,
    userId: body.data.user.id,
  };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
