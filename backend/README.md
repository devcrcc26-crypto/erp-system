# Construction ERP - Backend

NestJS API for the Core Foundation module.

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL, Redis, Minio)

## Quick start

From the monorepo root:

```bash
# Start infrastructure
npm run db:up

# Install dependencies (root + workspaces)
npm install

# Run migrations and seed
npm run db:migrate
npm run db:seed

# Start API in dev mode
npm run dev:backend
```

Health check: `GET http://localhost:3001/api/health`

Swagger UI: `http://localhost:3001/api/docs`

### Auth endpoints (Slice 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | Login with email/password |
| POST | `/api/auth/refresh` | Public | Rotate refresh token |
| POST | `/api/auth/logout` | Bearer JWT | Revoke session |
| POST | `/api/auth/forgot-password` | Public | Request password reset |
| POST | `/api/auth/reset-password` | Public | Reset password with token |

All responses use the envelope: `{ success, data, meta? }` or `{ success: false, error }`.

### Company Setup & User Management (Slice 3)

All endpoints require `Authorization: Bearer <accessToken>` unless noted.

**Company:** `GET/PATCH /company`, `CRUD /company-settings`

**Organisation:** `CRUD /branches`, `/divisions`, `/departments`, `/cost-centres`, `/positions`

**Financial:** `CRUD /financial-years`, `GET /financial-periods`, `POST /financial-periods/:id/lock|close`, `CRUD /number-series`, `POST /number-series/:documentType/next`

**Users:** `CRUD /users`, `POST/DELETE /users/:id/roles`

**Roles:** `CRUD /roles`, `PUT /roles/:id/permissions`, `GET /permissions`, `CRUD /user-roles/:id/data-scopes`

Permissions enforced via `@RequirePermission(module, action)` with role inheritance.

### Audit & Notifications (Slice 4)

**Audit:** Automatic CUD logging via global interceptor. `GET /api/audit-logs` (filter by module, action, user, dates).

**Notifications:**
- `GET /api/notifications` - in-app inbox
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
- `POST /api/notifications/send` - dispatch in-app + email (BullMQ)
- CRUD `/api/notification-templates`
- `GET/PUT /api/notification-preferences`

In-app notifications work without Redis. For email queueing, set `REDIS_ENABLED=true`, run `npm run db:up`, and configure `MAIL_HOST` (or JSON transport in dev when unset).

### Documents & Reporting (Slice 5)

**Storage:** Minio/S3-compatible via `StorageService` (`STORAGE_PROVIDER=minio`). Buckets auto-created on startup when Minio is available.

**Documents:**
- `CRUD /document-folders`, `GET /document-folders/:id/documents`
- `POST /document-folders/:folderId/documents` - multipart upload
- `GET/PATCH/DELETE /documents/:id`
- `GET /documents/:id/download-url` - presigned URL
- `POST /documents/:id/versions` - upload new version
- `GET/PUT/DELETE /document-folders/:folderId/access` - role-based folder ACL

**Reports:**
- `CRUD /reports`, `POST /reports/:id/execute`, `POST /reports/:id/export?format=json|csv`
- `CRUD /reports/:id/schedules`
- `GET /dashboard/widgets` - widgets for current user's roles
- `CRUD /dashboard/widgets` - admin widget management

Data sources (MVP): `users`, `audit_logs`, `branches`, `departments`.

### Testing (Slice 6)

```bash
cd backend
npm test              # unit tests (auth, RBAC, audit)
npm run test:cov      # with coverage report
npm run test:e2e      # integration tests (requires DATABASE_URL + seed data)
```

E2E tests use seeded admin (`admin@company.local` / `Admin@12345`) and a temporary Employee user.

## Database

| Service  | URL / Port                          |
|----------|-------------------------------------|
| Postgres | `localhost:5432` / `construction_erp` |
| Redis    | `localhost:6379`                    |
| Minio    | `localhost:9000` (API), `9001` (console) |
| Adminer  | `http://localhost:8080`             |

Default seed admin: `admin@company.local` / `Admin@12345`

## Prisma commands

```bash
npm run prisma:generate --workspace=backend
npm run prisma:migrate --workspace=backend
npm run prisma:seed --workspace=backend
npm run prisma:studio --workspace=backend
```
