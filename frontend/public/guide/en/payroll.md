# Payroll (HR)

Payroll is run once a month. HR creates a payroll run for the pay period, the system calculates each employee's pay from contracts, attendance, overtime and leave, HR reviews and submits it, and then HR and the General Manager approve it. Once the run is approved and paid, payslips are generated and released to employees. This guide is for HR users.

**Where to find it**
- Sidebar → **Pay & Travel** → **Payroll & Expenses** → **Payroll** (the list of runs).
- Each run opens a detail page with its entries, totals and steps.
- Company payroll settings open from the **Payroll** page.

> **Important:** Salary figures are confidential. Only users with payroll access can open this module.

---

## How to create a payroll run

*(HR with the payroll create permission)*

1. Go to **Payroll** and click **New run**.
2. In **New payroll run**, choose the **Pay period** (month and year).
3. Optionally add notes.
4. Click **Create & generate**.

> **What happens next:** A run is created in **Draft** status and the system generates one entry per employee on the payroll roster for that month. Only one run can exist per month. If a run for the month was cancelled, the system reuses it.


---

## How to review a run

*(HR with payroll access)*

1. Open the run from the **Payroll** list.
2. Check the summary: number of employees, total gross, total net, total tax, pension figures and bonus top-ups.
3. Use **Show flagged only** and the filters (**Department**, **Discipline**, search) to find entries that need attention.
4. Open an entry to see its breakdown: **Days**, **Paid days** (on a 30-day month basis), earnings, overtime (**OT breakdown**), **Tax**, net, and **Bank**.
5. Check any **Flag** on an entry. Each flag has a reason, and you can read the **Flag note**.

### Flags you may see

| Flag | Meaning |
|---|---|
| Missing attendance | No attendance record for the month. |
| Missing contract | No contract covers the month. |
| Overtime not approved | Overtime for the month is not approved. |
| Zero salary | The salary is zero. |
| Manual override | A figure was changed by hand. |
| Leaver - final month | The employee leaves this month. |
| Login disabled, still employed | The login is disabled but the employee is still employed. |
| Inactive in month | The employee was inactive for part of the month. |
| Contract ended - not renewed | The contract ended and was not renewed. |

### Employment review

Before a run can move on, HR must review employees with employment flags. The **Employment review** panel lists them. Check each one, then tick **I've reviewed these employees** to continue.

---

## How to add a bonus or a net top-up to an employee

*(HR with the payroll edit permission; the run must be **Draft** or **Reviewed**)*

1. Open the run, find the employee, and click **Edit bonus / net top-up**.
2. Enter the **Bonus top-up (ETB)** or the **Net top-up (ETB)**. Values must be zero or greater.
3. Enter the **Bonus top-up reason** or **Net top-up reason**. A reason is required when the amount is not zero.
4. Optionally add a **Notes** entry.
5. Save.

> **What happens next:** The top-up is added to the entry and the totals update. A recalculation keeps your top-ups and notes.

---

## How to add or remove a freelancer

*(HR)*

Freelancers are never added automatically.

1. Open the run and click **Add freelancer**.
2. Choose the freelancer from the list. Only active freelancers on the payroll roster who are not yet in the run appear.
3. Click **Add to payroll**.

To remove a freelancer, click **Remove from payroll** on the freelancer's entry. Regular employees cannot be removed this way.

> **Note:** If the run is already in approval, adding or removing a freelancer sends it back to **Draft**. It must then be reviewed and approved again.

---

## How to recalculate a run

*(HR)*

Use **Recalculate** after you change contracts, attendance, overtime or leave for the month.

1. Click **Recalculate** and confirm.

> **What happens next:** All entries are recalculated from current contracts, attendance, overtime and leave. Bonus top-ups, notes and added freelancers are kept. If the run was already submitted or approved, it goes back to **Draft**. It must be reviewed, submitted and approved again, and any generated payslips are removed.

When an attendance record changes after a run was generated, the run shows **Attendance changed after this run was generated** (regenerate or review as shown). When an HR policy changes after approval, the run shows a *policy review required* notice. These are not recalculated automatically.

---

## How to approve a payroll run

Approval moves through these steps in order. Each step is a button on the run.

1. **Mark reviewed** (HR). Locks the **Draft** for HR review before submission. The confirm dialog says: *Lock this draft for HR review before submission.*
2. **Submit for approval** (HR). Sends the reviewed run to the HR Manager. If any entries are flagged, tick **I've reviewed the flagged entries** to submit.
3. **Approve (HR)** (HR Manager or System Administrator). Confirms HR approval. The run moves to **HR approved**.
4. **GM approve** (General Manager or System Administrator). Confirms general manager approval. The run moves to **GM approved**.
5. **Mark as paid** (HR). Confirms that salaries for the run have been paid. The run moves to **Paid**.

> **Rules:**
> - A run must be **Reviewed** before it can be submitted.
> - A run must be **Submitted** before HR approval, and **HR approved** before GM approval.
> - Changes after submission send the run back to **Draft**.
> - A run can be cancelled only before it is GM approved or paid.

---

## How to cancel a payroll run

1. Open the run that is not yet **GM approved** or **Paid**.
2. Click **Cancel run** and confirm.

> **What happens next:** The run is cancelled, so the month can be processed again with a new run.

---

## How to generate and release payslips

*(HR)*

Payslips can be generated only when the run is **GM approved** or **Paid**.

1. Open the run and go to **Payslips**.
2. Click **Generate payslips**.
3. Check the list. Open an employee's payslip to view its PDF.
4. Click **Release to employees** and confirm **Release payslips to employees?**.
5. To download all payslips together, click **Download all (ZIP)**.

> **What happens next:** Each employee who receives a payslip is notified. Employees see their payslips in **My Profile** → payslips. Employees can view only their own.

---

## How to export payroll

*(HR)*

Open the **Export** menu on the run:

- **Salary sheet (Excel)**: exports the run's salary sheet.
- **Bank letter (Word)**: exports the bank transfer letter. A warning is shown first if something needs checking. Continue only after you have checked it.

---

## Who can do what

| Action | Who |
|---|---|
| Create a run, edit top-ups, recalculate, mark reviewed, submit, mark paid, cancel, payslips, exports | HR with payroll permissions |
| Approve (HR) | HR Manager or System Administrator |
| GM approve | General Manager or System Administrator |
| View own payslips | Every employee |

---

## Tips

- Lock attendance and overtime for the month before you create the run, so the figures do not change.
- Review flagged entries early, especially **Missing attendance** and **Missing contract**.
- Enter a clear reason for every bonus or top-up. The system requires it.
- Generate payslips only after the run is approved. Release them only after you have checked them.
