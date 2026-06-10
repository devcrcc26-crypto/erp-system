import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, loginAs } from './helpers/auth.helper';
import { createTestApp } from './helpers/test-app.factory';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;
  let employeeRoleId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    app = await createTestApp();
    const admin = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = admin.accessToken;

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

    const email = `rbac-employee-${Date.now()}@test.local`;
    const createUserResponse = await request(app.getHttpServer())
      .post('/api/users')
      .set(authHeader(adminToken))
      .send({
        email,
        firstName: 'RBAC',
        lastName: 'Employee',
        password: 'Employee@12345',
      })
      .expect(201);

    const userId = createUserResponse.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/users/${userId}/roles`)
      .set(authHeader(adminToken))
      .send({ roleId: employeeRoleId })
      .expect(201);

    const employeeSession = await loginAs(app, email, 'Employee@12345');
    employeeToken = employeeSession.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin can list users', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set(authHeader(adminToken))
      .expect(200);
  });

  it('employee can view documents but cannot create users', async () => {
    await request(app.getHttpServer())
      .get('/api/document-folders')
      .set(authHeader(employeeToken))
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/users')
      .set(authHeader(employeeToken))
      .send({
        email: `blocked-${Date.now()}@test.local`,
        firstName: 'Blocked',
        lastName: 'User',
        password: 'Blocked@12345',
      })
      .expect(403);
  });

  it('employee cannot access audit logs', async () => {
    await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set(authHeader(employeeToken))
      .expect(403);
  });

  it('admin can access audit logs', async () => {
    await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set(authHeader(adminToken))
      .expect(200);
  });
});
