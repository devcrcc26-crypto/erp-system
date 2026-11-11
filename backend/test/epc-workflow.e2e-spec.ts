import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authHeader, loginAs } from './helpers/auth.helper';
import { createTestApp } from './helpers/test-app.factory';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

describe('EPC Workflow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let projectId: string | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    app = await createTestApp();
    const session = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = session.accessToken;

    const projectsResponse = await request(app.getHttpServer())
      .get('/api/projects?page=1&limit=1')
      .set(authHeader(adminToken))
      .expect(200);

    const projects = projectsResponse.body.data as Array<{ id: string }>;
    projectId = projects[0]?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/review-inbox returns envelope for authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/review-inbox')
      .set(authHeader(adminToken))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('GET /api/my-comments returns envelope for authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/my-comments')
      .set(authHeader(adminToken))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('GET /api/projects/:id/status-board returns KPI envelope when project exists', async () => {
    if (!projectId) {
      return;
    }

    const response = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/status-board`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.projectId).toBe(projectId);
    expect(response.body.data).toHaveProperty('activeReviewSessions');
  });

  it('GET /api/projects/:id/workload returns dispatcher workload envelope', async () => {
    if (!projectId) {
      return;
    }

    const response = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/workload`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('POST /api/workflow-events/:id/correct rejects unknown event', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/workflow-events/00000000-0000-4000-8000-000000000099/correct')
      .set(authHeader(adminToken))
      .send({ reason: 'Test correction' })
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});
