# Overtime flow map and screenshot checklist

Read-only mapping from the OT module, approvals service, and English locale strings. Intended for writing a Word user guide and taking screenshots.

Privacy: do not print real names, credentials, or HR records in screenshots. Use roles (“employee”, “supervisor”) and IDs only.

---

# Part 1: The overtime flow

## Opening a sheet

| Item | Exact label / path |
| --- | --- |
| Sidebar (employee) | **New Request** → **Overtime Application** |
| URL | `/approvals/new/overtime` |
| Page title | **Add Overtime Sheet** |
| Description (employee) | **Open your overtime sheet for the current month.** |
| Month section | **Current month** — *Employees can only submit overtime for the current month. The sheet below is for this month.* |
| Primary button | **Open sheet** |
| If draft exists | Alert: *You have a draft sheet for {period}. Continue editing it.* → **Continue draft** |
| If already submitted | Alert: *A sheet for {period} has already been submitted.* → **Open it** |
| After open | Navigates to `/hr/overtime/{sheetId}` with status **Draft** |

**Rules (backend):**

- One sheet per employee per calendar month (`company + employee + month + year`).
- Future months blocked: *Cannot open a sheet for a future month*.
- Plain employees: current month only (*Employees can only open an overtime sheet for the current month*).
- Past months allowed if the user has `overtime.manage`, `hr.view`, or on-behalf eligibility (supervisor/HR filing for someone else). Then UI shows **Select Month** / **Month** picker and **Open sheet**.

HR/team list (if permitted): **Time & Attendance** → **Overtime** → `/hr/overtime` (**Overtime Sheets**).

---

## OT entry fields

Open sheet → **Add entry** (drawer title **Add entry**; edit = **Edit entry**).

| Field | Required | Options / behaviour | Validation / messages |
| --- | --- | --- | --- |
| **Date** | Yes | Days in sheet month; employees cannot pick future dates | *Select date*; *Must fall within {period}.*; server: *Entry date must fall in sheet period YYYY-MM*; *Overtime cannot be recorded for future dates* |
| **Start** / **End** | Yes (per period) | Only times in selectable OT windows for that day; **End** can be **24:00** | *Start time is required*; *End time is required*; *Start and end time cannot be the same*; *Time periods must not overlap*; *Add at least one time period* |
| **Task Description** | Yes | Free text per period | *Describe the work performed* |
| Multiple periods | Optional | **Add period**; overnight across days: **Add next-day entry** | Next day outside month/future: *The next day is outside this sheet's month or is in the future.* |
| Hours preview | Read-only | **Normal OT**, **Evening OT**, **Weekend**, **Holiday**, **Total**; rate tags **Normal × 1.5**, **Evening × 1.75**, **Weekend × 2.0**, **Holiday × 2.5** | Section: **Hours preview** / **Hour classification preview** |

**Not a manual “OT category” picker** — categories are calculated from schedule/holiday/weekend/night (22:00–06:00).

Other messages you may see:

- *No overtime times are available for this day.*
- *You're on approved leave this day.*
- *These hours are within your normal working hours.*
- *OT cannot be submitted during the lunch break (12:30–13:30 on weekdays)*
- *Overlapping overtime entry on {date}…*
- *Attendance has no scans for this day.* (warning; still savable — pill **Attendance check**)
- Site day info: site assignment chips / *Within scheduled hours — site*

Hint text: *Record overtime worked during {period}. Add one or more time periods on the same day (they must not overlap)…*

Drawer actions: **Cancel**, **Save**.

---

## Draft

- Status badge: **Draft**.
- Saving an entry toast: **Entry added** / **{n} overtime periods added** / **Entry updated**.
- Entries under **Entries**; KPI tiles: **Normal OT**, **Evening OT**, **Weekend**, **Holiday**, **Total**.
- Empty: **No entries yet**.
- Edit/delete: row **⋯** → **Update** / **Delete**; delete confirm **Delete entry?** / *This entry will be removed and sheet totals recalculated.*
- Attachments: **Attach files** / **Remove** (confirm **Remove attachment?**).
- Optional: **Cancel Sheet** → **Cancel overtime sheet?**
- No approval chain yet; sheet stays editable until submit or cancel.

---

## Submitting

| Item | Label |
| --- | --- |
| Button | **Submit Sheet** (needs ≥1 entry) |
| Confirm | **Submit overtime sheet?** — *This will start the approval workflow. If you change any entries later, the sheet will be sent for approval again.* |
| Success toast | **Overtime sheet submitted for approval** |
| Resulting sheet status | **Submitted** |
| Redirect | `/approvals` |

**Note:** Confirm copy is stricter than the app: submitted/approved sheets *can* still be edited until payroll lock; that edit restarts approval (see below).

**Approver chain (runtime `buildOrgApprovalChain`, not the dead seed “hours > 4” rules):**

| Submitter | Typical chain |
| --- | --- |
| Standard employee | Tier 1 **Reports to** (required) → Tier 2 **HR Manager** |
| Discipline Lead | **Department Head** (if assigned) → **HR Manager** |
| Department Head | **General Manager** → **HR Manager** |
| HR Officer / HR Manager | **General Manager** |
| GM / Managing Director / System Admin | Empty → sheet auto-**Approved** |

Title of request: `Overtime sheet - YYYY-MM ({hours}h)`.

**Who is notified on submit:** current-tier approver(s). For HR Manager tier, all active HR Manager / Local HR Manager / HR Officer seats get the pending notice.

**Channels:** approval code sends **in-app only** (`channel: 'IN_APP'`). Email exists in the notification service but is not used for these approval events. **Telegram is not implemented** for OT/approvals.

| Event | Subject | Body (typical) |
| --- | --- | --- |
| Pending | `Approval required - {requestNumber}` | `{title} ({requestNumber}) is awaiting your approval.` |

---

## Approver’s view

| Item | Label / path |
| --- | --- |
| Notification | Subject **Approval required - {requestNumber}** |
| Inbox | **Approvals** → tab **Pending My Action** (`/approvals`) |
| Detail | `/approvals/{requestId}` |
| Body | Sheet #, employee, period; columns **Date**, **Time**, **Hours**, **Task Description**; hour pills; totals |
| Warnings | **Attendance check**; unregistered holiday banner; **Edited** + **This request was edited after approval** (**Previously** / **Now**) |
| Timeline | Tier cards (e.g. **Reports to**, **HR Manager**), decisions, comments, **Conditions** |
| Actions menu | **Approve**, **Conditionally Approve**, **Return**, **Reject** |

---

## Each decision

### Approve

| | |
| --- | --- |
| Comment | **Note (optional)** — optional |
| Dialog | **Approve tier** → confirm **Approve** |
| Sheet status | If last tier: **Approved**. If more tiers: sheet stays **Submitted**; next tier notified |
| Workflow | Advances to next pending tier, or ends as fully approved |
| Notify | Next tier: `Approval required - {requestNumber}`; employee on final: `Approved - {requestNumber}` |
| Employee sees | Status **Approved**; toast path via notification |
| Employee next | Nothing required; can still edit until payroll lock (restarts approval) |
| Payroll | Only **Approved** unclaimed entries are payable |
| Purpose | Accept hours as submitted for this tier / whole chain |

### Conditionally Approve

| | |
| --- | --- |
| Condition | **Condition** — **required** (*Enter a condition before continuing*) |
| Note | **Note (optional)** |
| Dialog | **Conditionally approve** — *Add a condition that must be resolved before the chain advances.* → **Submit** |
| Sheet status | Still **Submitted** (tier = **Conditionally Approved**; request stays open) |
| Workflow | Does **not** advance. Employee must **Submit response** (note and/or files). Approver then **Resolve**. When all conditions resolved → treated as tier approved and advances |
| Notify | On employee response: `Condition response - {requestNumber}` to approver. On final resolve/advance: same as Approve |
| Employee sees | Condition panel: **Condition**, **Your response**, **Attach files**, **Submit response**; then *Response submitted - awaiting review* |
| Employee next | Respond; cannot treat it as a returned editable sheet |
| Payroll | No pay until fully **Approved** |
| Purpose | Hold the chain with a condition the employee must answer, without sending the sheet back to draft |

**vs Approve:** Approve advances/completes; Conditional holds the same tier until condition + resolve.

**vs Return:** Return sets sheet **Returned** and lets the employee change entries and **Submit Sheet** again; Conditional keeps the sheet submitted and uses the condition/response UI.

### Return

| | |
| --- | --- |
| Comment | **Note for submitter** — **required**, min 5 characters (*Enter a reason so the submitter knows what to change.*) |
| Dialog | **Return request** → **Return** |
| Sheet status | **Returned** |
| Workflow | Ends current cycle; does not go to next tier |
| Notify | `Approval returned - {requestNumber}` (body = note or default revision text) |
| Employee sees | Banner **This request was returned**; sheet status **Returned**; OT detail may say to edit on the sheet and submit again |
| Employee next | Edit entries → **Submit Sheet** (no separate Approvals **Resubmit** for OT) |
| Resubmit behaviour | If entries changed since return → restart from **tier 1** (Edited / Previously–Now). If entries unchanged (e.g. attachment only) → resume at the **tier that returned** |
| Payroll | Not payable |
| Purpose | Ask for corrections, then re-review |

**vs Reject:** Return is recoverable; Reject closes permanently.

### Reject

| | |
| --- | --- |
| Comment | **Rejection reason** — **required**, min 5 characters (*Enter a reason so the submitter knows what to change.*) |
| Dialog | **Reject request** — *This will reject the request permanently…* → **Reject** |
| Sheet status | **Rejected** |
| Workflow | Terminal; no next tier |
| Notify | `Rejected - {requestNumber}` |
| Employee sees | Banner **This request was rejected** |
| Employee next | Nothing on that sheet (cancelled/rejected not editable). New month = new sheet |
| Payroll | Not payable |
| Purpose | Refuse the claim permanently |

---

## Editing after approval

- On **Submitted** / **Approved** (and enum **In Review** if ever set), owner can still **Add entry** / **Update** / **Delete** until payroll lock.
- On save: toast **Your overtime request has been updated and sent for approval again**; approval restarted from the **first** approver (`restartChainAfterEdit`).
- Sheet shows **Resubmitted**; approver sees **Edited** and **This request was edited after approval** with **Previously** / **Now**.
- Payroll: until re-approved, entries are not payable as approved OT; after re-approval they can be claimed again if not already locked by a run.

---

## Locked in payroll

**When:** a payroll run for that month/year is **GM Approved** or **Paid** → sheet `payrollLocked`.

| Actor | Sees |
| --- | --- |
| Anyone | Banner **This OT is locked in the current payroll run and cannot be edited** |
| Per entry claimed by a run | Lock icon / **Locked in payroll ({runNumber})** |

Employees and supervisors cannot edit/delete locked content. Paid entries stay locked even if someone could add new entries in edge cases; month lock blocks sheet edits.

---

## Multi-tier

1. Tier 1 (**Reports to**) sees the request in **Pending My Action**, decides.
2. On Approve → Tier 2 (**HR Manager**) gets `Approval required…` and sees prior tier as approved in the sidebar.
3. If Tier 2 **Returns** / **Rejects** → sheet **Returned** / **Rejected**; employee notified. On return + resubmit, review resumes at Tier 2 (Tier 1 stays approved).
4. Conditional at any tier holds **that** tier until resolve.

---

## Status badges (English)

**Draft** · **Submitted** · **In Review** · **Approved** · **Rejected** · **Returned** · **Cancelled** · plus **Resubmitted** / **Edited** chips.

**Build note:** OT sheets are set to **Submitted** on submit and jump to **Approved** / **Rejected** / **Returned** on final decision. Runtime code does **not** currently set sheet status to **In Review** (the label exists; you may not see it on OT sheets).

---

# Part 2: Screenshot checklist

## Test setup (minimal overwrite)

| Role | Needs |
| --- | --- |
| **Employee A–D** | Role Employee; `overtime.create`; each has **Reports to** = same **Supervisor**; current-month sheets |
| **Supervisor** | Tier-1 approver; `approvals` access / Pending My Action |
| **HR Manager** (or Officer seat used as HR Manager) | Tier-2; for multi-tier + one path |
| Optional **Employee E** | For edit-after-approval |
| Optional past month + payroll | Month where run is **GM Approved** or **Paid** (HR opens past month) for lock screens |

Use **four current-month sheets** (Employees A–D), one decision each, so paths don’t overwrite each other. Fifth sheet (E) for edit-after-approval. Multi-tier demos: let Supervisor approve A’s sheet, then HR acts.

## Order to shoot (fewest resets)

1. Employee open / empty / add / draft / edit-delete / submit / notifications (Employee A).
2. Supervisor: notification → inbox → review (A).
3. Capture all **four decision dialogs** on A–D (fill fields; on A take Approve through to done, or shoot dialogs first then execute each on a different sheet).
4. Employee views after each decision (B Conditional → respond; C Return → edit/resubmit; D Reject; A Approved).
5. Edit-after-approval (E): employee edit → supervisor **Edited** / diff.
6. Multi-tier: approve at Tier 1, then Return/Reject at Tier 2 on a dedicated sheet.
7. Payroll lock last (needs GM-approved/paid run).

## Checklist table

| # | Logged in as | Page / URL | Setup needed before the screenshot | What must be visible | What to highlight | Caption for the guide |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Employee | Sidebar | Limited/full nav as for employees | **New Request**, **Overtime Application** | Path to OT | Finding Overtime Application in the menu |
| 2 | Employee | `/approvals/new/overtime` | No sheet for current month yet | **Add Overtime Sheet**, **Current month**, **Open sheet** | **Open sheet** | Opening this month’s overtime sheet |
| 3 | Employee | `/hr/overtime/{id}` | Just opened | Status **Draft**, **Entries**, **No entries yet**, **Add entry** | Empty sheet + **Draft** | Empty draft sheet |
| 4 | Employee | Same + drawer | Click **Add entry**; fill Date, Start, End, Task Description | Drawer **Add entry**, fields, **Hours preview**, **Save** | Filled form + preview | Adding an overtime entry |
| 5 | Employee | Sheet detail | Saved ≥1 entry | Entry row(s), hour tiles, still **Draft**, **Submit Sheet** | Saved entries + totals | Draft sheet with entries |
| 6 | Employee | Sheet detail | Open **⋯** on a day | Menu **Update**, **Delete** | Row actions | Editing or deleting an entry |
| 7 | Employee | Confirm dialog | Click **Submit Sheet** | **Submit overtime sheet?** | Confirm dialog | Confirming submission |
| 8 | Employee | After submit | Confirmed | Toast **Overtime sheet submitted for approval**; status **Submitted** (or Approvals list) | **Submitted** | Sheet after submitting |
| 9 | Employee | Notifications / Approvals **My Requests** | After submit | Request title `Overtime sheet - YYYY-MM…` | Own submitted request | Tracking the submitted request |
| 10 | Supervisor | Notification panel | Employee A submitted | **Approval required - {requestNumber}** | Notification text | Approver notification |
| 11 | Supervisor | `/approvals` | Tab **Pending My Action** | OT row: **Request #**, **Title**, **Status**, **Action needed** | Inbox row | Approvals inbox – Pending My Action |
| 12 | Supervisor | `/approvals/{id}` | Open A’s request | Entries table, totals, tier sidebar, decision menu | Review screen | Reviewing an overtime sheet |
| 13 | Supervisor | Same | Open **Approve** | **Approve tier**, **Note (optional)**, **Approve** | Approve dialog (filled optional note) | Approve decision |
| 14 | Supervisor | Same (Employee B) | Open **Conditionally Approve** | **Conditionally approve**, **Condition**, **Note (optional)**, **Submit** | Condition filled | Conditionally Approve decision |
| 15 | Supervisor | Same (Employee C) | Open **Return** | **Return request**, **Note for submitter**, **Return** | Note filled | Return decision |
| 16 | Supervisor | Same (Employee D) | Open **Reject** | **Reject request**, **Rejection reason**, **Reject** | Reason filled | Reject decision |
| 17 | Employee A | Sheet or Approvals | After final Approve (both tiers if needed) | Status **Approved**; notification `Approved - …` | **Approved** badge | After Approve – employee view |
| 18 | Employee B | `/approvals/{id}` | After Conditional | **Condition**, **Your response**, **Submit response** | Condition + response UI | After Conditional Approval – respond |
| 19 | Employee B | Same | After submitting response | *Response submitted - awaiting review* | Waiting state | Waiting for the approver to resolve |
| 20 | Employee C | Sheet `/hr/overtime/{id}` | After Return | **Returned**, returned banner/note, editable entries, **Submit Sheet** | **Returned** + edit | After Return – fix and resubmit |
| 21 | Employee C | After resubmit | Resubmitted | Status **Submitted** again | Resubmit via **Submit Sheet** | Resubmitting a returned sheet |
| 22 | Employee D | Approvals detail | After Reject | **This request was rejected**, status **Rejected** | Rejected banner | After Reject – closed sheet |
| 23 | Employee E | Approved sheet | Sheet previously fully approved; edit an entry | Toast **Your overtime request has been updated and sent for approval again**; **Resubmitted** | Edit + toast | Editing an approved sheet |
| 24 | Supervisor | `/approvals/{id}` for E | Pending again | **Edited**, **This request was edited after approval**, **Previously** / **Now** | Diff banner | What the approver sees after an edit |
| 25 | Supervisor → HR | Two accounts | Multi-tier sheet; Tier 1 approved | Tier 1 approved; Tier 2 **Pending My Action** | Second-tier inbox | Second approver’s turn |
| 26 | HR Manager | Detail | Tier 2 Return or Reject | Decision + employee outcome | Later-tier Return/Reject | When a later tier returns or rejects |
| 27 | Employee or Supervisor | Locked month sheet | Payroll run **GM Approved** or **Paid** for that month | Banner **This OT is locked…**; lock on paid entries | Lock banner / icon | Locked in payroll |

---

## Screens / behaviours that differ from a “simple” guide

1. **No Telegram** for OT approvals; approval notifies **in-app only** (email path not used by `notifySafe`).
2. Sheet status **In Review** is unlikely to appear for OT in this build (stays **Submitted** until terminal).
3. Post-submit/approved edit is allowed and **restarts** approval (confirm copy now says so).
4. Return/Reject notes are **required** (min 5 characters) for all approval types.
5. Conditional Approval does **not** change sheet status to a special OT state; use Approvals condition UI.
6. Returned OT has **no** Approvals **Resubmit** button — use sheet **Submit Sheet**. Entry changes restart from tier 1; unchanged entries resume at the returning tier.
7. Edit-after-approval always restarts from the **first** approver.
8. OT “categories” are calculated, not chosen.
9. Overnight as a single spanning entry is restricted; prefer end **24:00** + next-day entry.
10. Payroll lock screenshot needs a **GM Approved/Paid** run for that month — may need HR/payroll setup outside the OT screens.

---

Once screenshots are taken, drop them into the Word guide in checklist order. Parallel end-user wording also lives in `frontend/public/guide/en/overtime.md`.
