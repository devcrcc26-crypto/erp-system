import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  authHeader,
  createInvitedUser,
  loginAs,
  seedUnverifiedUserWithPassword,
} from './helpers/auth.helper';
import { createTestApp } from './helpers/test-app.factory';
import {
  issueActivationToken,
  issuePasswordResetToken,
} from './helpers/token.helper';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: string;
  let adminCompanyId: string;
  let employeeRoleId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    app = await createTestApp();

    const adminSession = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = adminSession.accessToken;
    adminUserId = adminSession.userId;

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authHeader(adminToken))
      .expect(200);

    adminCompanyId = meResponse.body.data.companyId as string;

    const rolesResponse = await request(app.getHttpServer())
      .get('/api/roles')
      .set(authHeader(adminToken))
      .expect(200);

    const roles = rolesResponse.body.data as Array<{ id: string; name: string }>;
    const employeeRole = roles.find((role) => role.name === 'Employee');
    if (!employeeRole) {
      throw new Error('Employee role not found in seed data');
    }
    employeeRoleId = employeeRole.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body.success).toBe(true);
  });

  it('POST /api/auth/login returns tokens for valid credentials', async () => {
    const session = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toBeDefined();
    expect(session.sessionId).toBeDefined();
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
      .expect(401);

    expect(response.body.success).toBe(false);
  });

  it('POST /api/auth/refresh rotates tokens', async () => {
    const session = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        sessionId: session.sessionId,
        refreshToken: session.refreshToken,
      })
      .expect(201);

    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).not.toBe(session.refreshToken);
  });

  it('POST /api/auth/logout revokes the session', async () => {
    const session = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(authHeader(session.accessToken))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        sessionId: session.sessionId,
        refreshToken: session.refreshToken,
      })
      .expect(401);
  });

  it('protected routes reject missing tokens', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('POST /api/auth/login blocks unverified users with EMAIL_NOT_VERIFIED', async () => {
    const email = `unverified-${Date.now()}@test.local`;
    const password = 'Unverified@12345';

    await seedUnverifiedUserWithPassword(app, {
      companyId: adminCompanyId,
      createdBy: adminUserId,
      email,
      password,
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('invite → activate → login flow works end-to-end', async () => {
    const email = `invite-${Date.now()}@test.local`;
    const newPassword = 'Employee@12345';

    const invited = await createInvitedUser(app, adminToken, {
      email,
      firstName: 'Invited',
      lastName: 'Employee',
      roleId: employeeRoleId,
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(401);

    const activationToken = await issueActivationToken(app, invited.id);

    await request(app.getHttpServer())
      .post('/api/auth/activate-account')
      .send({ token: activationToken, newPassword })
      .expect(201);

    const session = await loginAs(app, email, newPassword);
    expect(session.accessToken).toBeDefined();
  });

  it('forgot → reset → login with new password works end-to-end', async () => {
    const email = `reset-${Date.now()}@test.local`;
    const originalPassword = 'Original@12345';
    const newPassword = 'ResetPass@12345';

    const createUserResponse = await request(app.getHttpServer())
      .post('/api/users')
      .set(authHeader(adminToken))
      .send({
        email,
        firstName: 'Reset',
        lastName: 'User',
        password: originalPassword,
        isActive: true,
      })
      .expect(201);

    const userId = createUserResponse.body.data.id as string;

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(201);

    const resetToken = await issuePasswordResetToken(app, userId);

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email, token: resetToken, newPassword })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: originalPassword })
      .expect(401);

    const session = await loginAs(app, email, newPassword);
    expect(session.accessToken).toBeDefined();
  });

  it('GET/PATCH /api/auth/me and change-password work for authenticated users', async () => {
    const email = `profile-${Date.now()}@test.local`;
    const password = 'Profile@12345';
    const newPassword = 'ProfileNew@12345';

    await request(app.getHttpServer())
      .post('/api/users')
      .set(authHeader(adminToken))
      .send({
        email,
        firstName: 'Profile',
        lastName: 'Tester',
        password,
        isActive: true,
      })
      .expect(201);

    const session = await loginAs(app, email, password);

    const profileResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authHeader(session.accessToken))
      .expect(200);

    expect(profileResponse.body.data.email).toBe(email);

    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set(authHeader(session.accessToken))
      .send({ firstName: 'Updated', phone: '+251911000000' })
      .expect(200);

    const updatedProfile = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authHeader(session.accessToken))
      .expect(200);

    expect(updatedProfile.body.data.firstName).toBe('Updated');
    expect(updatedProfile.body.data.phone).toBe('+251911000000');

    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set(authHeader(session.accessToken))
      .send({ currentPassword: password, newPassword })
      .expect(201);

    await loginAs(app, email, newPassword);
  });
});
