# Construction ERP — Backend

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
