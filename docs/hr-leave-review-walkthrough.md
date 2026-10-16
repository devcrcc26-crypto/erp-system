# HR Leave Module - Review Walkthrough

**Purpose:** End-to-end review of Users, Leave Policy, Leave Balances, Leave Requests, and Approvals.  
**App URL:** http://localhost:3000 (local)  
**Default password for all seeded accounts:** `Admin@12345`

---

## 1. Actors & credentials

Use **separate browsers or incognito windows** so you can stay logged in as multiple people.

| Role in this walkthrough | Who | Email | Password | Notes |
|---|---|---|---|---|
| **System / HR setup** | System Administrator | `admin@company.local` | `Admin@12345` | Full access - users, policies, balances, approvals |
| **HR Officer** | Jinxia Dong (董锦霞) | `jinxia.dong@company.local` | `Admin@12345` | Leave policy, balances, company leave list, **tier 2 approval** |
| **Employee (submitter)** | Wei Chen | `demo.seed.designer@company.local` | `Admin@12345` | Must have a **discipline + leader** for leave submit |
| **Immediate supervisor** *(Discipline Lead)* | Xiaoming Li (李晓铭) | `xiaoming.li@company.local` | `Admin@12345` | Leader of Structure(Building) - **tier 1 approval** |
| Alternate employee | Mihret Moges | `mihret.moges@company.local` | `Admin@12345` | Also under Xiaoming Li |

### Leave approval chain (current)

All leave requests (any length):

**Discipline Lead → HR Officer → Approved**

General Manager is **not** in the leave chain.

---

## 2. Part A - Login & shell

1. Open http://localhost:3000/login  
2. Sign in as `admin@company.local` / `Admin@12345`  
3. Confirm you land on the dashboard with the left navigation (Organization / HR / Approvals, etc.)  
4. Optional: use the **globe / EN · 中文** control in the header to switch language

---

## 3. Part B - User list

**Actor:** Admin or HR Officer (`jinxia.dong@company.local`)

1. Go to **Organization → Users** (`/users`)  
2. Confirm:
   - Title, description, KPI cards  
   - Search / filters  
   - Table with employees  
   - **⋮** actions column → **Update** / **Delete**  
3. Click a row to open **employee detail**  
4. From detail, use **Update** / **Delete** as needed (do not delete seeded demo users during review)

---

## 4. Part C - Add employee (with leave policy)

**Actor:** Admin or HR Officer

1. On Users, click **Add employee** (`/users/new`)  
2. Complete the stepper (or sections):
   - Account / login  
   - Personal  
   - Employment / organization  
   - Education (if shown)  
   - **Leave policy + documents** - assign one of:
     - **Standard Staff**
     - **Site Workers**
     - **Management**
     - **Probation Entry**  
3. Submit / send invitation  
4. Return to **Users** and confirm the new employee appears  
5. Open the employee and confirm **leave policy** is assigned  

> Balances are initialized from the assigned policy. Without a policy, balance rows may be empty or default.  
> For leave **submit**, the employee also needs an **engineering discipline with a leader** (supervisor).

---

## 5. Part D - Leave policy

**Actor:** HR Officer or Admin

1. Go to **HR → Leave Policy** (`/hr/leave-policy`)  
2. Confirm seeded policies (search works client-side):
   - Standard Staff - progressive annual 16 days  
   - Site Workers - flat annual 14 days  
   - Management - progressive annual 20 days  
   - Probation Entry - reduced annual until probation ends  
3. Open a policy **detail** (row click) - Back / Update / Delete  
4. Click **New Leave Policy** (`/hr/leave-policy/new`):
   - Multi-section form (not a stepper): details + ANNUAL / MATERNITY / SICK  
   - **Cancel** in header; **Save** in sticky footer  
5. Optionally edit an existing policy and save  

---

## 6. Part E - Leave balances

**Actor:** HR Officer or Admin

1. Go to **HR → Leave Requests** (`/hr/leave-requests`)  
2. Open the **Leave Balances** tab  
3. Confirm:
   - Year filter  
   - **Search by name or employee ID** (frontend filter)  
   - Columns: Annual / Maternity / Sick (remaining / entitled, used, pending)  
4. Find an employee who has a leave policy and confirm balances look reasonable  
5. If needed: on Leave Policy list, use **Refresh balances** after policy changes  

---

## 7. Part F - Employee submits leave

**Actor:** Wei Chen - `demo.seed.designer@company.local` / `Admin@12345`  
*(Log out admin / open a private window)*

1. Login as the employee  
2. Open **Approvals → New → Leave Request**  
   - Or from HR Leave Requests → **New Leave Request** if the employee has access  
   - Route: `/approvals/new/leave-request`  
3. Fill:
   - **Leave type:** Annual  
   - **Dates:** any valid range with enough balance  
   - Confirm **days** auto-calculates  
   - Reason: e.g. `Family trip - HR review demo`  
   - Optional attachment  
4. Click **Submit** (sticky footer)  
5. Note the new **request number** (e.g. `LR-…`) and status (**Submitted** / **In review**)  
6. Open the request detail - approval timeline should show pending **Discipline Lead**, then **HR Officer**  

---

## 8. Part G - Immediate supervisor approval (Tier 1)

**Actor:** Xiaoming Li - `xiaoming.li@company.local` / `Admin@12345`

1. Login as Discipline Lead  
2. Go to **Approvals** (`/approvals`) - inbox / pending for me  
3. Open the leave request from Wei Chen  
4. Review dates, days, reason, balance if shown  
5. **Approve** (optionally add a comment)  
6. Confirm tier 1 is approved; next pending tier is **HR Officer**  

---

## 9. Part H - HR approval (Tier 2) - final

**Actor:** Jinxia Dong - `jinxia.dong@company.local` / `Admin@12345`

1. Login as HR Officer  
2. **Approvals** → open the same request  
3. Confirm Discipline Lead already approved  
4. **Approve** as HR  
5. Final status: **Approved** (no General Manager step)

---

## 10. Part I - HR verifies request & balances after approval

**Actor:** HR Officer or Admin

1. **HR → Leave Requests** - find the request by **name or request #** (frontend search)  
2. Open detail - status **Approved**, approval timeline complete  
3. **Leave Balances** tab - confirm the employee’s **annual used / remaining** updated  

---

## 11. Suggested happy-path checklist

| # | Step | Actor | Pass? |
|---|---|---|---|
| 1 | Login works | Admin | ☐ |
| 2 | Users list + ⋮ Update/Delete | HR / Admin | ☐ |
| 3 | Add employee + leave policy | HR / Admin | ☐ |
| 4 | Leave policy list / create / edit | HR / Admin | ☐ |
| 5 | Leave balances search + year | HR / Admin | ☐ |
| 6 | Employee submits leave | Wei Chen | ☐ |
| 7 | Discipline Lead (supervisor) approves | Xiaoming | ☐ |
| 8 | HR Officer approves → Approved | Jinxia | ☐ |
| 9 | Request shows Approved; balance updated | HR | ☐ |

---

## 12. Quick reference - routes

| Screen | Path |
|---|---|
| Login | `/login` |
| Users | `/users` |
| Add employee | `/users/new` |
| Leave policy | `/hr/leave-policy` |
| Leave requests + balances | `/hr/leave-requests` |
| New leave request | `/approvals/new/leave-request` |
| Approvals inbox | `/approvals` |

---

## 13. Notes for reviewers

- **Search** on leave requests and balances is **client-side** (name / request # / employee id).  
- Leave policy form uses a **sticky Save footer** (same idea as Add Employee).  
- List **actions** use a **⋮** menu (Update / Delete).  
- Leave submit requires the employee to have an **engineering discipline with an active leader**.  
- Approvers get `approval.pending` when leave is waiting on them.  
- The employee gets `approval.returned` if leave is returned.  
- The employee gets `approval.approved` / `approval.rejected` on final decision.  
- Prefer dedicated accounts above rather than `admin@company.local` for approvals, because admin holds many roles and may appear as multiple approvers.
