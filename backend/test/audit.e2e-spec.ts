import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, loginAs } from './helpers/auth.helper';
import { createTestApp } from './helpers/test-app.factory';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

describe('Audit on CUD (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    app = await createTestApp();
    const admin = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an audit log when a branch is created', async () => {
    const branchName = `Audit Branch ${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/api/branches')
      .set(authHeader(adminToken))
      .send({ name: branchName })
      .expect(201);

    const branchId = createResponse.body.data.id as string;

    await new Promise((resolve) => setTimeout(resolve, 100));

    const auditResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .query({ module: 'branches', action: 'create', recordId: branchId, limit: 5 })
      .set(authHeader(adminToken))
      .expect(200);

    expect(auditResponse.body.meta.total).toBeGreaterThanOrEqual(1);
    const entry = auditResponse.body.data.find(
      (log: { recordId: string }) => log.recordId === branchId,
    );
    expect(entry).toMatchObject({
      module: 'branches',
      action: 'create',
      recordType: 'branches',
      recordId: branchId,
    });
    expect(entry.afterValue).toMatchObject({ name: branchName });
  });

  it('stores before and after values when a branch is updated', async () => {
    const originalName = `Audit Branch Original ${Date.now()}`;
    const updatedName = `Audit Branch Updated ${Date.now()}`;

    const createResponse = await request(app.getHttpServer())
      .post('/api/branches')
      .set(authHeader(adminToken))
      .send({ name: originalName })
      .expect(201);

    const branchId = createResponse.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/api/branches/${branchId}`)
      .set(authHeader(adminToken))
      .send({ name: updatedName })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const auditResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .query({ module: 'branches', action: 'update', recordId: branchId, limit: 5 })
      .set(authHeader(adminToken))
      .expect(200);

    const entry = auditResponse.body.data.find(
      (log: { recordId: string; action: string }) =>
        log.recordId === branchId && log.action === 'update',
    );

    expect(entry).toBeDefined();
    expect(entry.beforeValue).toMatchObject({ name: originalName });
    expect(entry.afterValue).toMatchObject({ name: updatedName });
  });

  it('does not audit excluded notification endpoints', async () => {
    const beforeResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .query({ module: 'notifications', limit: 1 })
      .set(authHeader(adminToken))
      .expect(200);

    const beforeTotal = beforeResponse.body.meta.total as number;

    const admin = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .post('/api/notifications/send')
      .set(authHeader(admin.accessToken))
      .send({
        recipientId: admin.userId,
        eventType: 'test.audit',
        channel: 'IN_APP',
        subject: 'Audit test',
        body: 'Should not create audit row',
      })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const afterResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .query({ module: 'notifications', limit: 1 })
      .set(authHeader(adminToken))
      .expect(200);

    expect(afterResponse.body.meta.total).toBe(beforeTotal);
  });
});
