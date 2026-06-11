# Construction ERP - Backend Implementation Reference

This document describes everything implemented in the **Core Foundation** backend (Slices 1–6). It covers every source, config, and test file under `backend/`, excluding `prisma/`, `node_modules/`, `dist/`, and `src/generated/` (auto-generated Prisma client).

**Stack:** NestJS 11 · TypeScript strict · Prisma 6 · PostgreSQL · JWT auth · CQRS (auth) · Clean Architecture module layout

**API base:** `http://localhost:3001/api`  
**Swagger:** `http://localhost:3001/api/docs`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Implementation Slices](#implementation-slices)
3. [Root & Configuration Files](#root--configuration-files)
4. [Application Bootstrap](#application-bootstrap)
5. [Shared Platform (`src/shared/`)](#shared-platform-srcshared)
6. [Module: Auth (`src/modules/auth/`)](#module-auth-srcmodulesauth)
7. [Module: Company Setup (`src/modules/company-setup/`)](#module-company-setup-srcmodulescompany-setup)
8. [Module: User Management (`src/modules/user-management/`)](#module-user-management-srcmodulesuser-management)
9. [Module: Audit (`src/modules/audit/`)](#module-audit-srcmodulesaudit)
10. [Module: Notifications (`src/modules/notifications/`)](#module-notifications-srcmodulesnotifications)
11. [Module: Documents (`src/modules/documents/`)](#module-documents-srcmodulesdocuments)
12. [Module: Reporting (`src/modules/reporting/`)](#module-reporting-srcmodulesreporting)
13. [Tests (`test/` + `*.spec.ts`)](#tests-test--spects)
14. [Environment Variables](#environment-variables)
15. [API Endpoint Summary](#api-endpoint-summary)

---

## Architecture Overview

```
HTTP Request
    │
    ▼
RequestContextMiddleware     ← correlation ID, IP, user-agent (AsyncLocalStorage)
    │
    ▼
JwtAuthGuard                 ← JWT validation (skipped on @Public routes)
    │
    ▼
ThrottlerGuard               ← rate limiting
    │
    ▼
PermissionsGuard             ← RBAC via @RequirePermission (where applied)
    │
    ▼
Controller                   ← validates DTO, resolves user from JWT
    │
    ▼
Application layer            ← services (CRUD) or CQRS handlers (auth)
    │
    ▼
Infrastructure               ← Prisma repositories, Minio storage, BullMQ
    │
    ▼
Interceptors (on response)
    ├── AuditInterceptor     ← CUD audit logging
    ├── LoggingInterceptor   ← structured request logs
    └── ResponseEnvelopeInterceptor  ← { success, data, meta? }
```

**Multi-tenancy:** Every data query includes `company_id` from the JWT - never from the request body.

**Soft delete:** User-facing entities use `deleted_at` / `deleted_by`. Queries use `activeOnly()` helper.

---

## Implementation Slices

| Slice | Scope | Status |
|-------|--------|--------|
| **1** | Monorepo scaffold, Prisma schema, migration, seed, health check | Complete |
| **2** | Shared platform, JWT auth, sessions, Swagger, env validation | Complete |
| **3** | Company setup, org structure, financial periods, user/role/RBAC | Complete |
| **4** | Audit trail (interceptor + read API), notifications engine | Complete |
| **5** | Document management (Minio), reporting MVP, dashboards | Complete |
| **6** | Unit + integration tests (auth, RBAC, audit) | Complete |

---

## Root & Configuration Files

### `package.json`
NPM workspace package for the backend. Defines scripts (`build`, `dev`, `start`, `test`, `test:e2e`, `test:cov`, Prisma commands) and dependencies: NestJS, Prisma, JWT, bcrypt, BullMQ, Minio, mailer, Jest, Supertest, etc.

### `nest-cli.json`
NestJS CLI configuration. Sets `sourceRoot` to `src` and enables `deleteOutDir` on build.

### `tsconfig.json`
TypeScript compiler options: strict mode, decorators, `ES2022` target, path alias `@/*` → `src/*`, and `@prisma/client` → `src/generated/prisma` (local generated client for reliable IDE resolution).

### `tsconfig.build.json`
Extends `tsconfig.json` for production builds. Excludes tests, seed file, and spec files.

### `jest.config.ts`
Jest configuration for **unit tests** (`src/**/*.spec.ts`). Maps `@prisma/client` to generated client; collects coverage into `coverage/`.

### `README.md`
Quick-start guide: prerequisites, Docker services, migration/seed commands, and endpoint summaries per slice.

### `.env` (local, not committed)
Runtime secrets and connection strings (`DATABASE_URL`, JWT secrets, Redis, Minio). Loaded by NestJS `ConfigModule` and test setup.

---

## Application Bootstrap

### `src/main.ts`
Application entry point. Bootstraps `AppModule`, sets global prefix `api`, applies Helmet, CORS, global `ValidationPipe` (whitelist + forbidNonWhitelisted), configures Swagger at `/api/docs`, and listens on `PORT` (default 3001).

### `src/app.module.ts`
Root NestJS module. Loads environment via `dotenv` before module registration (needed for dynamic `NotificationsModule.register()`). Imports:

- `ConfigModule` (Joi validation)
- `ThrottlerModule` (100 req/min default, 10/min auth)
- `PrismaModule`, `StorageModule`, `PermissionsModule`
- Feature modules: `Auth`, `CompanySetup`, `UserManagement`, `Audit`, `Notifications`, `Documents`, `Reporting`

Registers global providers: `HttpExceptionFilter`, `ResponseEnvelopeInterceptor`, `LoggingInterceptor`, `JwtAuthGuard`, `ThrottlerGuard`. Applies `RequestContextMiddleware` to all routes.

### `src/app.controller.ts`
Health check controller. `GET /api/health` (public) runs `SELECT 1` against Postgres and returns `{ status: 'ok', database: 'connected' }`.

---

## Shared Platform (`src/shared/`)

### Configuration

#### `src/shared/config/env.validation.ts`
Joi schema validating all environment variables at startup: `NODE_ENV`, `PORT`, `DATABASE_URL`, JWT secrets, `REDIS_ENABLED`, Minio settings, mail settings, `NOTIFICATION_RETENTION_DAYS`, etc. Fails fast on missing/invalid config.

### Prisma

#### `src/shared/prisma/prisma.module.ts`
Global module exporting `PrismaService` to all feature modules.

#### `src/shared/prisma/prisma.service.ts`
Extends `PrismaClient`. Connects on module init, disconnects on destroy. Development logging: `warn` + `error`; production: `error` only.

#### `src/shared/prisma/soft-delete.util.ts`
Exports `activeOnly(where)` - merges `{ deletedAt: null }` into Prisma `where` clauses for soft-delete filtering.

### Request Context

#### `src/shared/context/request-context.ts`
`AsyncLocalStorage`-backed store for per-request metadata: `correlationId`, `userId`, `companyId`, `sessionId`, `ipAddress`, `userAgent`. Used by audit logging.

#### `src/shared/context/request-context.middleware.ts`
Express middleware that generates a `correlationId` (UUID), captures IP and user-agent, and runs the request inside `requestContextStorage.run()`.

### DTOs & API Envelope

#### `src/shared/dtos/pagination-query.dto.ts`
Standard pagination query: `page`, `limit`, `sortBy`, `sortOrder`. Used by all list endpoints. Exports `PaginationMeta` interface.

#### `src/shared/dtos/api-response.dto.ts`
Swagger DTOs for the API error envelope shape (`ApiErrorResponseDto`).

### Decorators

#### `src/shared/decorators/public.decorator.ts`
`@Public()` - marks routes that skip `JwtAuthGuard` (login, health, etc.).

#### `src/shared/decorators/current-user.decorator.ts`
`@CurrentUser()` - injects `AuthenticatedUser` from the JWT payload into controller parameters.

### Guards

#### `src/shared/guards/jwt-auth.guard.ts`
Global JWT guard extending Passport `AuthGuard('jwt')`. Respects `@Public()` via `Reflector`.

### Filters

#### `src/shared/filters/http-exception.filter.ts`
Global exception filter. Catches all errors and returns `{ success: false, error: { code, message, details? } }`. Never exposes stack traces in production responses.

### Interceptors

#### `src/shared/interceptors/response-envelope.interceptor.ts`
Wraps all successful responses in `{ success: true, data: T, meta? }`. Detects paginated results (`{ data, meta }`) and preserves `meta`.

#### `src/shared/interceptors/logging.interceptor.ts`
Logs every request: method, path, status, duration, user ID. Structured for production JSON logging.

### Permissions (RBAC)

#### `src/shared/permissions/permission.types.ts`
Defines `PermissionAction` union (`view | create | edit | delete | approve | export`), `PermissionFlags` interface, `EMPTY_PERMISSION_FLAGS`, and `ACTION_TO_FLAG` mapping.

#### `src/shared/permissions/permission.service.ts`
Resolves effective permissions for a user on a module. Walks `user_role` assignments, follows `parent_role_id` inheritance chain, merges `role_permission` flags with OR logic. Filters by `company_id`.

#### `src/shared/permissions/require-permission.decorator.ts`
`@RequirePermission(module, action)` - sets metadata read by `PermissionsGuard`.

#### `src/shared/permissions/permissions.guard.ts`
Nest guard that reads `@RequirePermission` metadata and calls `PermissionService.hasPermission()`. Throws `403 Forbidden` when denied.

#### `src/shared/permissions/permissions.module.ts`
Global module exporting `PermissionService`.

#### `src/shared/permissions/permission.service.spec.ts`
Unit tests: no roles, inheritance merge, cross-company role exclusion.

#### `src/shared/permissions/permissions.guard.spec.ts`
Unit tests: public routes, missing metadata, denied/granted permission paths.

### Storage (Slice 5)

#### `src/shared/storage/storage.constants.ts`
`STORAGE_SERVICE` injection token. Bucket names: `erp-documents`, `erp-drawings`, `erp-photos`, `erp-hr`, `erp-reports`. `ALLOWED_UPLOAD_MIME_TYPES` set for document uploads.

#### `src/shared/storage/storage.interface.ts`
`IStorageService` port: `ensureBucket`, `upload`, `delete`, `getPresignedDownloadUrl`.

#### `src/shared/storage/minio-storage.service.ts`
Minio (S3-compatible) adapter. On init, connects to Minio and creates buckets if missing. Gracefully degrades (logs warning) when Minio is unavailable. Uploads via `putObject`; download via presigned GET URL (default 15 min).

#### `src/shared/storage/storage.module.ts`
Global module. Factory selects storage provider from `STORAGE_PROVIDER` env (currently routes to `MinioStorageService`).

### Types

#### `src/shared/types/jwt-payload.type.ts`
`JwtPayload` (JWT claims: `sub`, `email`, `companyId`, `sessionId`) and `AuthenticatedUser` (resolved user attached to `request.user`).

#### `src/shared/types/express.d.ts`
Augments Express `Request` interface with optional `user: AuthenticatedUser`.

### Utilities

#### `src/shared/utils/pagination.util.ts`
`buildPrismaPagination`, `buildPaginatedResult`, `buildOrderBy` - shared pagination helpers used by all list services.

---

## Module: Auth (`src/modules/auth/`)

JWT authentication with refresh token rotation, multi-device sessions, and password reset. Uses **CQRS** for write operations.

### Domain

#### `src/modules/auth/domain/repositories/auth.repository.interface.ts`
Port interface `IAuthRepository` and `UserWithCompany` type. Methods: find user by email/id, session CRUD, password reset tokens, last login update. `AUTH_REPOSITORY` injection symbol.

### Infrastructure

#### `src/modules/auth/infrastructure/repositories/auth.repository.ts`
Prisma implementation of `IAuthRepository`. All queries use `activeOnly()`. Sessions are hard-deleted on logout/revocation. Password reset tokens stored as bcrypt hashes.

### Application - Commands

#### `src/modules/auth/application/commands/login.command.ts`
CQRS command: `email`, `password`, optional `deviceInfo`, `ipAddress`.

#### `src/modules/auth/application/commands/login.handler.ts`
Validates credentials, creates `USER_SESSION` with bcrypt-hashed refresh token, updates `last_login_at`, issues access + refresh JWTs. Returns `AuthTokensDto`.

#### `src/modules/auth/application/commands/login.handler.spec.ts`
Unit tests: successful login, user not found, invalid password.

#### `src/modules/auth/application/commands/refresh-token.command.ts`
CQRS command: `sessionId`, `refreshToken`, `ipAddress`.

#### `src/modules/auth/application/commands/refresh-token.handler.ts`
Validates session + refresh token hash, rotates refresh token (old hash invalidated), issues new access token.

#### `src/modules/auth/application/commands/logout.command.ts`
CQRS command: `sessionId`, `userId`.

#### `src/modules/auth/application/commands/logout.handler.ts`
Writes audit log (`auth.logout`) **before** hard-deleting the session (avoids FK violation). Validates session belongs to user.

#### `src/modules/auth/application/commands/logout.handler.spec.ts`
Unit tests: audit-before-delete ordering, invalid session rejection.

#### `src/modules/auth/application/commands/forgot-password.command.ts`
CQRS command: `email`.

#### `src/modules/auth/application/commands/forgot-password.handler.ts`
Creates `PASSWORD_RESET_TOKEN` (opaque token, bcrypt hash in DB). Returns generic success message regardless of email existence (no user enumeration).

#### `src/modules/auth/application/commands/reset-password.command.ts`
CQRS command: `email`, `token`, `newPassword`.

#### `src/modules/auth/application/commands/reset-password.handler.ts`
Validates reset token, updates password hash, marks token used, revokes all user sessions.

### Application - Services

#### `src/modules/auth/application/services/password.service.ts`
bcrypt wrapper: `hash` (12 rounds), `verify`.

#### `src/modules/auth/application/services/password.service.spec.ts`
Unit tests for hash/verify round-trip.

#### `src/modules/auth/application/services/token.service.ts`
JWT access token generation, opaque refresh/reset token generation, bcrypt token hashing, expiry date calculation from config (`15m` access, `7d` refresh).

### Application - DTOs

#### `src/modules/auth/application/dtos/login.dto.ts`
`email`, `password`, optional `deviceInfo`. class-validator + Swagger decorators.

#### `src/modules/auth/application/dtos/refresh-token.dto.ts`
`sessionId`, `refreshToken`.

#### `src/modules/auth/application/dtos/forgot-password.dto.ts`
`email`.

#### `src/modules/auth/application/dtos/reset-password.dto.ts`
`email`, `token`, `newPassword` (min 8 chars).

#### `src/modules/auth/application/dtos/auth-response.dto.ts`
`AuthTokensDto` (accessToken, refreshToken, sessionId, expiresIn, user profile) and `MessageResponseDto`.

### Presentation

#### `src/modules/auth/presentation/controllers/auth.controller.ts`
REST endpoints (all under `/api/auth`):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | Public | Login |
| POST | `/refresh` | Public | Rotate tokens |
| POST | `/logout` | Bearer | Revoke session |
| POST | `/forgot-password` | Public | Request reset |
| POST | `/reset-password` | Public | Reset with token |

Rate-limited: 10 requests/minute via `@Throttle`.

#### `src/modules/auth/presentation/strategies/jwt.strategy.ts`
Passport JWT strategy. Validates token, loads session from DB (must exist and not expired), attaches `AuthenticatedUser` to request.

### Module

#### `src/modules/auth/auth.module.ts`
Wires CQRS handlers, `JwtModule`, `PassportModule`, `AuditModule` (for logout audit), `AuthRepository` provider, `JwtStrategy`.

---

## Module: Company Setup (`src/modules/company-setup/`)

Company profile, settings, organisation hierarchy, financial calendar, and document numbering.

### Application

#### `src/modules/company-setup/application/dtos/company.dtos.ts`
DTOs for: company update, company settings CRUD, branches, divisions, departments, cost centres, positions, financial years, financial periods, number series. All use class-validator decorators.

#### `src/modules/company-setup/application/services/company-setup.service.ts`
Single application service (~600 lines) orchestrating all company-setup use cases:

- **Company:** get/update profile
- **Settings:** CRUD `company_setting` (key/value per module)
- **Org:** CRUD branches, divisions, departments, cost centres, positions
- **Financial:** CRUD financial years; list/get/lock/close financial periods (two-stage: LOCKED → CLOSED)
- **Number series:** CRUD metadata; `nextNumber(documentType)` calls PostgreSQL sequence

All operations scoped by `companyId` from JWT context.

### Presentation

#### `src/modules/company-setup/presentation/controllers/company.controller.ts`
`GET/PATCH /company`, CRUD `/company-settings`.

#### `src/modules/company-setup/presentation/controllers/org.controller.ts`
CRUD `/branches`, `/divisions`, `/departments`, `/cost-centres`, `/positions`.

#### `src/modules/company-setup/presentation/controllers/financial.controller.ts`
Financial years CRUD, financial periods list/get/lock/close, number series CRUD + `POST /number-series/:documentType/next`.

### Module

#### `src/modules/company-setup/company-setup.module.ts`
Registers three controllers and `CompanySetupService`.

---

## Module: User Management (`src/modules/user-management/`)

Users, roles, permissions matrix, role assignment, and data scopes.

### Application

#### `src/modules/user-management/application/dtos/user-management.dtos.ts`
DTOs: `CreateUserDto`, `UpdateUserDto`, `CreateRoleDto`, `UpdateRoleDto`, `RolePermissionItemDto`, `SetRolePermissionsDto`, `AssignUserRoleDto`, `CreateDataScopeDto`, `UpdateDataScopeDto`.

#### `src/modules/user-management/application/services/user-management.service.ts`
Application service for:

- **Users:** paginated list, get, create (bcrypt password), update, soft-delete
- **User roles:** assign/revoke roles on users
- **Roles:** CRUD with optional `parentRoleId` for inheritance
- **Permissions:** list all permissions; set permission flags on a role (bulk replace)
- **Data scopes:** CRUD per `user_role` (COMPANY, BRANCH, DIVISION, DEPARTMENT, PROJECT, SELF)

### Presentation

#### `src/modules/user-management/presentation/controllers/users.controller.ts`
`CRUD /users`, `POST/DELETE /users/:id/roles`.

#### `src/modules/user-management/presentation/controllers/roles.controller.ts`
`CRUD /roles`, `PUT /roles/:id/permissions`, `GET /permissions`, data scope CRUD under `/user-roles/:userRoleId/data-scopes`.

### Module

#### `src/modules/user-management/user-management.module.ts`
Registers controllers and `UserManagementService`.

---

## Module: Audit (`src/modules/audit/`)

Immutable append-only audit trail with automatic CUD logging and read API.

### Application

#### `src/modules/audit/application/dtos/audit-log-query.dto.ts`
Query filters: `module`, `action`, `userId`, `recordType`, `recordId`, `dateFrom`, `dateTo` + pagination.

#### `src/modules/audit/application/services/audit.service.ts`
- `create()` - append-only write to `audit_log`. Swallows DB errors (never breaks the request).
- `list()` - paginated, filterable read per company.
- `buildFromRequestContext()` - enriches audit input with correlation ID, IP, user-agent from `AsyncLocalStorage`.

#### `src/modules/audit/application/services/audit.service.spec.ts`
Unit tests: create entry, error swallowing, paginated list with filters.

### Presentation

#### `src/modules/audit/presentation/interceptors/audit.interceptor.ts`
Global `APP_INTERCEPTOR`. On successful POST/PUT/PATCH/DELETE:

1. Skips GET requests and excluded paths (health, auth, docs, audit-logs, notifications)
2. Requires authenticated user
3. Maps HTTP method → action (`create`/`update`/`delete`)
4. Extracts module from URL path segment
5. Sanitizes sensitive fields (password, tokens) from `afterValue`
6. Writes audit log asynchronously via `AuditService`

Logout is excluded here; audited explicitly in `LogoutHandler` before session deletion.

#### `src/modules/audit/presentation/interceptors/audit.interceptor.spec.ts`
Unit tests: skip GET, skip auth paths, skip logout, write on CUD.

#### `src/modules/audit/presentation/controllers/audit.controller.ts`
`GET /api/audit-logs` - paginated list. Requires `audit.view` permission.

### Module

#### `src/modules/audit/audit.module.ts`
Registers `AuditController`, `AuditService`, and global `AuditInterceptor`. Exports `AuditService` (used by `AuthModule` for logout audit).

---

## Module: Notifications (`src/modules/notifications/`)

In-app notifications, email queue (BullMQ), templates, preferences, and retention cron.

### Application

#### `src/modules/notifications/application/constants/queue.constants.ts`
`NOTIFICATION_QUEUE` name, `SEND_NOTIFICATION_JOB` job name, `SendNotificationJobData` type.

#### `src/modules/notifications/application/dtos/notification.dtos.ts`
DTOs: template CRUD, preference upsert, `SendNotificationDto` (recipient, eventType, optional channel/subject/body/variables).

#### `src/modules/notifications/application/services/notification.service.ts`
- `send()` - respects user preferences and optional templates; creates in-app notification (`SENT` status) and/or queues email via BullMQ. Supports `channel: IN_APP` to skip email.
- `listInbox()`, `getUnreadCount()`, `markRead()`, `markAllRead()`
- Template CRUD (soft delete)
- Preference list/upsert
- `purgeExpired()` - hard-deletes notifications older than retention period

#### `src/modules/notifications/application/services/template-renderer.service.ts`
Replaces `{{variable}}` placeholders in notification templates.

#### `src/modules/notifications/application/processors/send-notification.processor.ts`
BullMQ worker. Sends email via `@nestjs-modules/mailer` (or JSON transport in dev). Updates notification status to `SENT` or `FAILED`.

### Presentation

#### `src/modules/notifications/presentation/controllers/notifications.controller.ts`
`GET /notifications` (inbox), `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read`, `POST /send`.

#### `src/modules/notifications/presentation/controllers/notification-admin.controller.ts`
CRUD `/notification-templates`, `GET/PUT /notification-preferences`.

#### `src/modules/notifications/presentation/cron/notification-retention.cron.ts`
Daily cron (2 AM). Purges notifications past `NOTIFICATION_RETENTION_DAYS` (default 90).

### Module

#### `src/modules/notifications/notifications.module.ts`
Dynamic module via `NotificationsModule.register()`. When `REDIS_ENABLED=true`: registers BullMQ queue, mailer, and email processor. When false: in-app notifications only (logs warning on startup). Always registers `ScheduleModule`, controllers, services, retention cron.

---

## Module: Documents (`src/modules/documents/`)

Document folders, file upload/versioning via Minio, presigned downloads, and folder-level role ACL.

### Application

#### `src/modules/documents/application/dtos/document.dtos.ts`
DTOs: folder create/update, document metadata update, version upload (changeNote), document access upsert (per role: canView/canUpload/canDownload/canDelete).

#### `src/modules/documents/application/services/document.service.ts`
- **Folders:** CRUD with path computation (`/parent/child`). System folders cannot be modified/deleted.
- **Documents:** upload to Minio (`erp-documents` bucket), create `document` + `document_version` in transaction. Validates MIME type and `max_upload_mb` from company settings.
- **Versions:** upload new file, increment version number, append `document_version` row.
- **Download:** presigned URL (15 min expiry).
- **Access:** CRUD `document_access` rules per folder + role.

File key format: `{companyId}/{folderId}/{documentId}/v{version}/{filename}`.

### Presentation

#### `src/modules/documents/presentation/controllers/document-folders.controller.ts`
`CRUD /document-folders`, `GET /:id/documents`.

#### `src/modules/documents/presentation/controllers/documents.controller.ts`
`GET/PATCH/DELETE /documents/:id`, `GET /:id/download-url`, `GET/POST /:id/versions`.

#### `src/modules/documents/presentation/controllers/document-upload.controller.ts`
`POST /document-folders/:folderId/documents` - multipart file upload (`FileInterceptor`).

#### `src/modules/documents/presentation/controllers/document-access.controller.ts`
`GET/PUT/DELETE /document-folders/:folderId/access` - folder role ACL.

### Module

#### `src/modules/documents/documents.module.ts`
Registers four controllers and `DocumentService`.

---

## Module: Reporting (`src/modules/reporting/`)

Report definitions, execution, CSV/JSON export, schedules, and role-based dashboard widgets.

### Application

#### `src/modules/reporting/application/dtos/reporting.dtos.ts`
DTOs: report definition create/update, schedule create/update, export format query (`json`|`csv`), dashboard widget create/update.

#### `src/modules/reporting/application/services/report-executor.service.ts`
Executes reports against an **allow-listed** data source (`users`, `audit_logs`, `branches`, `departments`). Projects selected fields, applies sorting. `toCsv()` converts result rows to CSV text.

#### `src/modules/reporting/application/services/reporting.service.ts`
- Report definition CRUD (owner or shared reports visible)
- `executeReport()` - runs executor
- `exportReport()` - JSON or CSV output with filename
- Schedule CRUD (metadata stored; cron execution deferred to future slice)

#### `src/modules/reporting/application/services/dashboard.service.ts`
- `listForUser()` - widgets matching current user's role IDs
- `listAll()` - admin view of all widgets
- Widget CRUD (position, size, config JSON, linked to role)

### Presentation

#### `src/modules/reporting/presentation/controllers/reports.controller.ts`
`CRUD /reports`, `POST /:id/execute`, `POST /:id/export`, schedule CRUD under `/:id/schedules`.

#### `src/modules/reporting/presentation/controllers/dashboard.controller.ts`
`GET /dashboard/widgets` (user's roles), `GET /dashboard/widgets/all` (admin), `POST/PATCH/DELETE /dashboard/widgets`.

### Module

#### `src/modules/reporting/reporting.module.ts`
Registers controllers and three services (`ReportingService`, `ReportExecutorService`, `DashboardService`).

---

## Tests (`test/` + `*.spec.ts`)

### Configuration

#### `test/jest-e2e.json`
Jest config for integration tests (`test/**/*.e2e-spec.ts`). Runs in band (sequential) to avoid DB races. Loads `setup-env.ts`.

#### `test/setup-env.ts`
Loads `backend/.env`, sets `NODE_ENV=test`, `REDIS_ENABLED=false`, provides fallback JWT secrets for CI.

### Helpers

#### `test/helpers/test-app.factory.ts`
`createTestApp()` - bootstraps full `AppModule` with global prefix and `ValidationPipe` for Supertest.

#### `test/helpers/auth.helper.ts`
`loginAs(app, email, password)` - returns tokens from API envelope. `authHeader(token)` - Bearer header object.

### Integration Tests (e2e)

#### `test/auth.e2e-spec.ts`
Tests: public health, login success/failure, token refresh rotation, logout revokes session, protected routes return 401.

#### `test/rbac.e2e-spec.ts`
Tests: admin lists users; employee views documents but cannot create users; employee denied audit logs; admin can access audit logs. Creates temporary employee user with Employee role.

#### `test/audit.e2e-spec.ts`
Tests: branch creation produces audit log entry with correct module/action/recordId; notification send path is excluded from audit.

### Unit Tests (`src/**/*.spec.ts`)

| File | Tests |
|------|-------|
| `password.service.spec.ts` | bcrypt hash/verify |
| `login.handler.spec.ts` | login success, bad user, bad password |
| `logout.handler.spec.ts` | audit before session delete, invalid session |
| `permission.service.spec.ts` | no roles, inheritance, company scoping |
| `permissions.guard.spec.ts` | public routes, permission denied/granted |
| `audit.service.spec.ts` | create, error swallow, paginated list |
| `audit.interceptor.spec.ts` | skip GET/auth/logout, write on CUD |

### Commands

```bash
npm test              # unit tests (21 tests)
npm run test:cov      # with coverage
npm run test:e2e      # integration tests (12 tests, requires DB + seed)
```

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | - | Access token signing (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | - | Refresh token signing (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `PORT` | No | `3001` | HTTP port |
| `API_PREFIX` | No | `api` | Global route prefix |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NODE_ENV` | No | `development` | Environment |
| `REDIS_ENABLED` | No | `false` | Enable BullMQ email queue |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `STORAGE_PROVIDER` | No | `minio` | Storage backend |
| `MINIO_ENDPOINT` | No | `localhost` | Minio host |
| `MINIO_PORT` | No | `9000` | Minio port |
| `MINIO_ACCESS_KEY` | No | `erp_minio` | Minio access key |
| `MINIO_SECRET_KEY` | No | - | Minio secret key |
| `MINIO_USE_SSL` | No | `false` | Minio SSL |
| `MAIL_HOST` | No | - | SMTP host (omit for JSON transport) |
| `MAIL_PORT` | No | - | SMTP port |
| `MAIL_FROM` | No | - | Sender address |
| `NOTIFICATION_RETENTION_DAYS` | No | `90` | Notification purge age |

---

## API Endpoint Summary

### Public
- `GET /api/health`
- `POST /api/auth/login|refresh|forgot-password|reset-password`

### Authenticated (JWT required)
All other endpoints require `Authorization: Bearer <accessToken>` and appropriate `@RequirePermission` where noted. See Swagger at `/api/docs` for full request/response schemas.

### Seeded Admin Credentials
- Email: `admin@company.local`
- Password: `Admin@12345`
- 12 core roles, 36 permissions, company org bootstrap, FY 2026, system document folder, sample report + dashboard widget

---

## File Count Summary

| Area | Files (excl. prisma/generated/dist) |
|------|-------------------------------------|
| Root config | 6 |
| Bootstrap (`src/`) | 3 |
| Shared platform | 28 |
| Auth module | 22 |
| Company setup | 6 |
| User management | 5 |
| Audit module | 6 |
| Notifications | 9 |
| Documents | 7 |
| Reporting | 8 |
| Tests | 8 |
| **Total** | **~108** |

---

*Last updated: Core Foundation Slices 1–6 complete.*
