import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PasswordService } from '../../src/modules/auth/application/services/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

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

export interface InvitedUserResult {
  id: string;
  email: string;
}

/**
 * Creates an invited user (no password) and assigns a role.
 */
export async function createInvitedUser(
  app: INestApplication,
  adminToken: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
  },
): Promise<InvitedUserResult> {
  const createResponse = await request(app.getHttpServer())
    .post('/api/users')
    .set(authHeader(adminToken))
    .send({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      isActive: true,
    })
    .expect(201);

  const userId = createResponse.body.data.id as string;

  await request(app.getHttpServer())
    .post(`/api/users/${userId}/roles`)
    .set(authHeader(adminToken))
    .send({ roleId: input.roleId })
    .expect(201);

  return { id: userId, email: input.email };
}

/**
 * Seeds an active user with a known password but unverified email.
 */
export async function seedUnverifiedUserWithPassword(
  app: INestApplication,
  input: {
    companyId: string;
    createdBy: string;
    email: string;
    password: string;
  },
): Promise<{ id: string; email: string }> {
  const passwordService = app.get(PasswordService);
  const prisma = app.get(PrismaService);
  const passwordHash = await passwordService.hash(input.password);

  const user = await prisma.user.create({
    data: {
      companyId: input.companyId,
      email: input.email,
      firstName: 'Unverified',
      lastName: 'User',
      passwordHash,
      emailVerifiedAt: null,
      isActive: true,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
    select: { id: true, email: true },
  });

  return user;
}
