# Attendance (HR)

Each month you import the attendance machine's export (Deli e+), match each machine record to an employee, review the month, and approve it. An approved month is locked and is used for payroll.

*(This guide is for HR: HR Manager, HR Assistant, HR Specialist.)*

**Where to find it**
- Monthly attendance: in the left menu, go to **Time & Attendance** → **Attendance**.
- Machine-to-employee mapping: **Time & Attendance** → **Attendance Identities**.

---

## How to import a month of attendance

1. Export the **monthly summary** (月度汇总表) from the Deli e+ attendance machine as an .xlsx file.
2. In the left menu, go to **Time & Attendance** → **Attendance**.
3. Click **Import Attendance**. The **Import Attendance** window opens with three steps: **Upload File**, **Review & Confirm** and **Done**.


## Step 1 — Upload File

1. Drop the .xlsx file into **Upload Deli e+ Monthly Export**, or click to browse.
2. Wait while the system reads the file (*"Reading attendance file…"*).

> **Note:** If the month was imported before, you see *"Attendance data for … has already been imported."* Confirming later replaces all the existing records for that month.

## Step 2 — Review & Confirm

The review shows four sections. Work through each one.

1. **Matched**: rows matched to an employee. **Match Type** shows how: **Saved identity**, **ID Match**, **Name Match** or **Manual**. Untick **Include** to leave a row out.
2. **Needs Review**: rows the system is not sure about. Check the **Best Match** and its **Score**. Click **Change →** to pick a different employee.
3. **Not Matched**: rows with no matching employee (*"No matching employee found in ERP"*). For each one:
   - Click **Assign Employee +** and choose the employee, or
   - Click **Ignore - left company**, write why in the box (at least 3 characters), and click **Ignore**, or
   - Leave it blank to skip the row.
4. **Not in Attendance File**: active employees who have no row in the file. Under **Presence**, choose one:
   - **Set as exempt**
   - **Present this month**: write a **Reason (required)**.
   - **Needs enrolment**: they are not yet set up on the machine.
   - If the employee was on site or working from home, click **Submit site assignment** (or **Submit work from home**) to file it for them. Employees fully covered by leave or a schedule are imported automatically (*"Fully covered - imported automatically"*).
5. Check the summary at the bottom: how many records will be imported, skipped and not matched.
6. Click **Confirm Import**. If the month was imported before, confirm **Replace existing data?** with **Yes, Replace**.


## Step 3 — Done

**Import Complete** shows how many rows were matched automatically, assigned by hand, skipped and not matched. Open **Employees not imported** to see who was left out. Click **Import Another Month** or **Close**.

> **After you import:** The month's status is **Pending Review**. Your matching choices are saved, so the same people match automatically next month. Ignored identities can be restored with **Undo** in the **Ignored** section of a later import.

---

## How to review a month

1. Go to **Time & Attendance** → **Attendance**, choose the **Month** and **Year**, and click **Review [month] [year]**.
2. The banner shows the state, for example *"Pending Review - Review all employee records before approving"*.
3. The counters show **Total Employees**, **Employees with Flags**, **Total Flagged Days**, **Resolved Flags** and **On Leave**.
4. The table shows each employee's **Days attended**, **Absent**, **Late Days**, **Leave Days**, **Unpaid leave**, **Paid days (30-day basis)**, **Site / WFH**, **Early departure**, **Field movements**, **Forgot to clock** and **Flagged Days**.
5. Click **View Daily Logs** on an employee to see each day's **Status**, **Clock In (Local)**, **Clock Out (Local)**, **Flag** and **Deduction**, and any explanation the employee submitted.
6. When every record is checked, click **Mark as Reviewed**. The banner changes to *"Reviewed - Ready for approval"*.


> **Note:** *"Would deduct … (not applied)"* shows a deduction that would apply but has not been applied.

---

## How to correct a day's clock times

*(Only while the month is not locked)*

1. On the review page, click **View Daily Logs** for the employee.
2. Click **Correct** on the day. The **Correct clock times** window opens.
3. Enter **Corrected Clock In** and/or **Corrected Clock Out**. At least one is required.
4. **Correction Note** (required): say why.
5. Click **Save Correction**. The day shows *"Corrected from …"*.

> **Note:** If the month is locked, you see *"Attendance is locked. Unlock the month before making corrections."*

---

## How to review late scans

Some employees only scan once a day. If their first scan was after the latest allowed time, they appear under **Scans after the latest scan time**. This has no effect on pay.

1. On the review page, find **Scans after the latest scan time**. Filter by **Pending** or **Reviewed**.
2. On each row, click **Excuse** or **Mark late**, add an optional note, and click **Save**.

---

## How to approve a month

1. Open the month's review page. Its status must be **Pending Review** or **Reviewed**.
2. Click **Approve Month**.
3. Read **Approve [month] [year] Attendance?**: approving locks the month and notifies every employee with flagged days to submit explanations.
4. Click **Approve**.


> **After you approve:** You see *"Attendance month approved and locked."* No corrections are possible. The banner shows who approved and when.

---

## How to unlock an approved month

Unlock only to make a real correction, or when the banner says *"Schedule approved after this month was locked - unlock the month to apply site / WFH / leave to attendance figures"*.

1. Open the approved month's review page.
2. Click **Unlock Month**.
3. **Unlock reason** (required): write why.
4. Click **Unlock**. The banner shows when it was unlocked and why.
5. Make the corrections, then approve the month again.

---

## How to map machine records to employees

1. Go to **Time & Attendance** → **Attendance Identities**.
2. The counters show **All identities**, **Mapped** and **Ignored**. Search by machine name, ID or employee.
3. For a row that is **Not mapped**, click **Map to employee**. For a mapped row, click **Change employee**.
4. Type at least 2 letters of the employee's name, choose them, and save.

> **After you save:** You see *"Identity updated."* The mapping is used in every future import.

---

## How to handle employees awaiting enrolment

**Awaiting enrolment** lists employees who are not yet set up on the attendance machine. They are counted as present. Each shows *"Since [month] [year]"*.

1. Enrol the employee on the attendance machine.
2. They leave the list automatically once an import contains a scan for them.
