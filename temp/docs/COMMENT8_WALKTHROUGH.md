# Comment 8 Walkthrough - Demo Accounts & Features

**Password for every account:** `Admin@12345`

Run the database seed first:

```bash
cd backend
npx prisma db seed
```

This layers Comment 8 data on top of the existing PM / EPC demo projects. The flagship project is **LJZ-2024-001** (Lujiazui Mixed-Use Tower).

---

## Quick reference - which account for what

| Login | Person | Primary walkthrough |
|-------|--------|---------------------|
| `admin@company.local` | Admin User | Settings → Departments (MTD/ADD), Engineering Disciplines, all modules |
| `pm@company.local` | Ahmed Hassan | LJZ project hub, schedule, task detail, exports |
| `demo.seed.designer@company.local` | Wei Chen | **My Work** (subtask designer), create/edit subtasks on LJZ |
| `demo.seed.dispatcher@company.local` | Jun Wang | **My Work** (dispatcher), LJZ flagship task |
| `lead@company.local` | Khalid Nasser | **My Work** (discipline lead), LJZ discipline rows |
| `reviewer@company.local` | Nadia Saleh | Review inbox, subtask reviewer role |
| `owner@company.local` | Hassan Al-Rashid | Owner-tier review on **PDR-2025-003**; ADD department leader |
| `deptchief@company.local` | Rania Aziz | Dept-chief tier on **DEMO-002**; **MTD department leader** (sees LJZ, not PDR) |
| `deputychief@company.local` | Youssef Hamdan | Deputy-chief subtask role on LJZ packages |
| `demo.seed.institute@company.local` | Li Zhang | Institute-tier inbox on LJZ; supervising chief on flagship task |
| `demo.seed.gm@company.local` | David Wu | Executive portfolio view, LJZ team member |
| `engineer@company.local` | Sara Khalil | RFIs, daily logs, site data on LJZ |
| `docs@company.local` | Layla Mansour | Document folders, submittals |
| `safety@company.local` | Omar Farouk | Safety inspections |
| `sitecoord@company.local` | Maya Fahad | Site coordination on DEMO projects |
| `consultant@company.local` | Elena Petrova | Client consultant on project teams |

---

## Seeded data map

| Project | Code | Department | Comment 8 highlights |
|---------|------|------------|----------------------|
| Lujiazui Mixed-Use Tower | `LJZ-2024-001` | MTD (Municipal Transportation) | Flagship task `OS-LJZ-2024-8842`, 5 subtasks with all 7 role FKs, discipline catalog links |
| Podium & Retail Development | `PDR-2025-003` | ADD (Architectural Design) | Owner-tier (Hassan) review scenarios |
| Airport Expansion Phase 2 | `DEMO-002` | ADD | Dept-chief tier (Rania) - EPC inbox from seed-epc-demo |
| Marina Tower Construction | `DEMO-001` | MTD | Baseline PM demo project |
| Zhongshan Medical Centre | `ZMC-2023-002` | MTD | Completed / closed EPC reference |

**Department leaders (scoping):**

- **Rania** (`deptchief@company.local`) → leader of **MTD** → project list scoped to MTD projects (LJZ, DEMO-001, ZMC).
- **Hassan** (`owner@company.local`) → leader of **ADD** → sees ADD projects (PDR, DEMO-002).

---

## Walkthrough 1 - Settings & catalog (Admin, 10 min)

1. Sign in as **System Administrator** (`admin@company.local`).
2. Open **Settings → Departments**.
3. Confirm **Municipal Transportation Department (MTD)** - leader: Rania Aziz.
4. Confirm **Architectural Design Department (ADD)** - leader: Hassan Al-Rashid.
5. Open **Settings → Engineering Disciplines** - 17 standard disciplines (Highway, Architecture, Structure(Building), etc.).
6. Open **Settings → Users** - verify Wei Chen and Khalid Nasser have engineering discipline assigned.

---

## Walkthrough 2 - Task detail & Comment 8 fields (PM, 15 min)

1. Sign in as **Project Manager** (`pm@company.local`).
2. Open **Projects → LJZ-2024-001**.
3. Open **Schedule** → click task **Foundation and piling** (`LJZ2024001-T100`).
4. On task detail, verify:
   - Overseas task number: `OS-LJZ-2024-8842`
   - Commission mode: Contract
   - Urgency: Very urgent
   - Supervising chief: Li Zhang
   - Dispatcher: Jun Wang
   - Assigned person: Wei Chen
   - Approval level: Design institute review
   - Task attributes, contact form, on-site / HQ assignment dates
5. Open **Disciplines** tab - Civil, Structural, MEP, Architecture linked to catalog.
6. Open **Subtasks** - five packages with designer, reviewer, discipline lead, deputy chief, institute chief, owner roles.

---

## Walkthrough 3 - My Work (per role, 20 min)

Sign out between each account. Open **My Work** from the main nav (or project-scoped **My Work** inside LJZ).

| Account | Expected My Work items |
|---------|------------------------|
| `lead@company.local` | LJZ disciplines where Khalid is discipline lead |
| `demo.seed.designer@company.local` | LJZ subtasks where Wei is designer |
| `demo.seed.dispatcher@company.local` | LJZ flagship task (dispatcher) |
| `deputychief@company.local` | LJZ subtasks (deputy chief role) |
| `reviewer@company.local` | Review inbox items + subtask reviewer assignments |

---

## Walkthrough 4 - Department scoping (10 min)

1. Sign in as **Department Chief** (`deptchief@company.local` / Rania).
2. Open **Projects** - you should see MTD projects (LJZ, DEMO-001, ZMC) and **not** ADD-only projects like PDR.
3. Sign out; sign in as **Discipline Owner** (`owner@company.local` / Hassan).
4. Open **Projects** - you should see ADD projects (PDR, DEMO-002).

---

## Walkthrough 5 - Review workflow (30 min)

Follow the tier chain on **LJZ-2024-001** (see also `DEMO_WALKTHROUGH.md` Walkthrough 3):

1. **Designer** - subtasks tab, draft packages.
2. **Reviewer** - Review inbox, structural package.
3. **Discipline Lead** - MEP package pending lead.
4. **Department Chief** - DEMO-002 dept-chief inbox.
5. **Institute Chief** - LJZ institute-tier items.
6. **Discipline Owner** - PDR-2025-003 owner tier.

---

## Walkthrough 6 - Excel export (Admin, 5 min)

1. Sign in as **admin@company.local**.
2. **Projects → Export Excel**.
3. Open the file - confirm columns include supervising chief, assigned person, dispatcher, department.

---

## Re-seed / troubleshoot

```bash
cd backend
npx prisma db seed
```

If rich demo projects fail, check `taskAttributes` uses enum values (`CHINA`, `ETHIOPIA`, `COMBINE1`, `COMBINE2`) - fixed in `seed-demo-projects.ts`.

For a clean PM demo only:

```bash
SEED_PM_DEMO=false npx prisma db seed   # foundation only
```

---

## Related docs

- [`DEMO_WALKTHROUGH.md`](../DEMO_WALKTHROUGH.md) - full ERP demo (RFIs, submittals, EPC tiers).
- [`docs/COMMENT8_PHASE7_VERIFICATION.md`](COMMENT8_PHASE7_VERIFICATION.md) - phase 7 test ledger.
