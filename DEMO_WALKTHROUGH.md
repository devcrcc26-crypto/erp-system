# Construction ERP — Demo Walkthrough

This guide walks through every major demo feature using the seeded data. All demo accounts share the same password: **`Admin@12345`** (unless `SEED_ADMIN_PASSWORD` was overridden during seed).

## Quick start

1. Open the login page — the **Demo accounts** panel lists every role. Click any row to fill email and password.
2. Sign in as **`admin@company.local`** for full system access, or pick a role-specific account to test permissions.
3. After deploy, run `npx prisma db seed` (or rely on Render `preDeployCommand`) to load all demo data.

---

## Demo accounts (login page)

| Email | Role | Best for testing |
|-------|------|------------------|
| `admin@company.local` | System Administrator | Users, roles, company setup, all modules |
| `pm@company.local` | Project Manager | Project dashboard, schedule, packages |
| `engineer@company.local` | Site Engineer | Daily logs, RFIs, site data |
| `docs@company.local` | Document Controller | Drawings, submittals, documents |
| `safety@company.local` | Safety Officer | Safety-related project views |
| `reviewer@company.local` | Reviewer | Review inbox — reviewer tier |
| `lead@company.local` | Discipline Lead | Lead-tier approvals |
| `owner@company.local` | Discipline Owner | Owner-tier — DEMO-001, PDR-2025-003 |
| `deptchief@company.local` | Department Chief | Dept chief tier — DEMO-002 |
| `deputychief@company.local` | Deputy Chief | Governance / deputy workflows |
| `sitecoord@company.local` | Site Coordinator | Site coordination tasks |
| `consultant@company.local` | Client Consultant | External consultant views |
| `demo.seed.designer@company.local` | Designer | Create/submit design packages — LJZ |
| `demo.seed.dispatcher@company.local` | Dispatcher | Task dispatch — LJZ |
| `demo.seed.institute@company.local` | Institute Chief | Institute tier inbox — LJZ |
| `demo.seed.gm@company.local` | General Manager | Executive-level access |

**Password (all accounts):** `Admin@12345`

---

## Seeded projects overview

### Core EPC playground (Playwright-stable IDs)

| Code | Type | Status | EPC scenario |
|------|------|--------|--------------|
| **DEMO-001** | Commercial | Active | Active owner + reviewer + lead review; 3 design packages; comments; EDV revisions A/B |
| **DEMO-002** | Infrastructure | Active | Dept-chief governance tier; closed approved package |
| **DEMO-003** | Residential | Mobilization | Issued design submittal; early-stage owner review |

### Rich construction demos (full PM + EPC depth)

| Code | Type | Status | Highlights |
|------|------|--------|------------|
| **ZMC-2023-002** | Commercial | Closed | Complete lifecycle — all tiers approved, revisions resolved, closeout |
| **LJZ-2024-001** | Commercial | Active | Mid-stage — multiple packages, all 5 approval tiers, comment threads, revision chains |
| **PDR-2025-003** | Residential | Mobilization | Early mobilization — owner review in progress |

### Showcase projects (one per remaining project type)

Codes `TYPE-IND-001` through `TYPE-OTH-001` cover: Industrial, Road (42.6 km), Railway (68.4 km), Urban Rail (12.8 km), Building, Bridge, Tunnel, Water & Drainage, Port, Airport, Power & Energy, Mixed Use, Other.

Each includes type-specific export fields where applicable (km lengths, GFA m², design stage, design properties).

---

## Feature-by-feature testing

### 1. Authentication

- **Login:** Use demo panel on `/login`.
- **Forgot password:** `/forgot-password` — demo `@company.local` addresses show a warning; no email is sent (by design). Use a real employee email to test Resend delivery.
- **Profile → Change email:** Same fake-email warning for demo domains.

### 2. Project portfolio

1. Sign in as **admin** or **pm**.
2. Go to **Projects**.
3. Confirm **16+ project types** appear in the list/filter.
4. **Export Excel** (toolbar) — bilingual project register with columns:
   - Standard: name, code, client, commission mode, dates, type, department, design properties/stage, on-site person
   - **Type-specific:** railway km, urban rail km, road km, gross floor area m², contract amount
5. Open **DEMO-001** or **LJZ-2024-001** for deep EPC testing.

### 3. Schedule & task list export

1. Open **LJZ-2024-001** → project dashboard.
2. Click **Export task list** — Excel with ~96 columns (standard task fields + 13 disciplines × 5 roles + trailing financial/completion columns).

### 4. Design packages & approval tiers

**As `demo.seed.designer@company.local` on LJZ-2024-001:**

1. Navigate to **Schedule** → select a task discipline.
2. View **Design packages** — multiple packages with different `requiredTiers`.
3. Open a package in **IN_REVIEW** — see EDV attachments and revision labels.

**Tier inbox testing (sign in separately per tier):**

| Account | Tier | Project | What to do |
|---------|------|---------|------------|
| `owner@company.local` | Discipline Owner | DEMO-001, PDR | Open Review Inbox → approve or return with comment |
| `reviewer@company.local` | Reviewer | DEMO-001, LJZ | Review assigned sessions |
| `lead@company.local` | Discipline Lead | DEMO-001, LJZ | Lead-tier decisions |
| `deptchief@company.local` | Department Chief | DEMO-002, LJZ | Dept chief governance |
| `demo.seed.institute@company.local` | Institute Chief | LJZ | Final institute tier |

**Comment & revision flow (LJZ or DEMO-001):**

1. Open an active **review session**.
2. View existing **comments** (open/resolved) on EDVs.
3. **Return for revision** — designer uploads new EDV revision (Rev B).
4. Re-submit package — watch tier status reset and workflow events in audit trail.

### 5. ZMC closed project (ZMC-2023-002)

Sign in as **pm** or **admin**:

- Status **Closed** — verify closeout checklist, punch items resolved.
- Design packages show **APPROVED** across tiers.
- Review sessions **CLOSED** with outcomes.
- Documents folder tree populated with seed PDFs (if MinIO/Supabase storage is configured).

### 6. Document management

As **docs@company.local**:

- Project **Documents** — nested folders per project.
- Drawings, submittals, RFIs seeded on DEMO and rich projects.

### 7. Site operations

As **engineer@company.local** on DEMO-001:

- **Daily logs**, **RFIs**, **Issues**, **Meetings** — seeded PM submodule data.

### 8. Users & invitations

As **admin**:

- **Settings → Users** — list shows all demo accounts.
- Invite flow: use a **real email** (not `@company.local`) to test activation email via Resend.

### 9. Notifications & audit

As **admin**:

- **Audit trail** — filter by project code (e.g. `LJZ-2024-001`).
- Notifications seeded per rich project.

---

## Re-seeding

```bash
cd backend
npx prisma db seed
```

This runs:

1. Foundation (company, roles, permissions, admin)
2. PM demo (DEMO-001/002/003 + EPC)
3. All project type showcase projects
4. Rich demos (ZMC, LJZ, PDR) with full EPC depth

To run **only** the rich 3-project seed (clears all projects first):

```bash
cd backend
npx ts-node --transpile-only prisma/seed-demo-projects.ts
```

---

## Storage note

Rich demo PDFs upload to object storage (MinIO locally, Supabase S3 on Render). If upload fails during seed, data still loads but file downloads may be empty — check `MINIO_*` env vars and bucket configuration.

---

## Suggested demo narrative (30 minutes)

1. **Login panel** — show role variety (2 min)
2. **admin** — project list + **Excel export** with type columns (5 min)
3. **designer** — LJZ packages, submit for review (5 min)
4. **reviewer** → **lead** → **deptchief** — tier progression (10 min)
5. **owner** — return with comment; **designer** — revision upload (5 min)
6. **ZMC** — closed project walkthrough (3 min)

---

## Environment

| Variable | Demo note |
|----------|-----------|
| `SEED_ADMIN_PASSWORD` | Default `Admin@12345` |
| `SEED_PM_DEMO=false` | Skips all PM/EPC demo data |
| `RESEND_API_KEY` | Required for real-email password reset / activation |
| Demo emails `@company.local` | Never receive outbound email (silent skip) |
