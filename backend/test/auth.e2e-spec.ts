import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, loginAs } from './helpers/auth.helper';
import { createTestApp } from './helpers/test-app.factory';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    app = await createTestApp();
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
});
