# Attendance (HR)

Attendance is built from the monthly export of the attendance machine (Deli e+). HR imports the file, matches each device identity to an employee, reviews the flagged days, and then approves the month. Once a month is approved it is locked. This guide is for HR users.

**Where to find it**
- Sidebar → **Time & Attendance** → **Attendance** → **Attendance** (the monthly list for everyone; HR sees the whole company).
- **Attendance** → **Attendance Identities** (the device-to-employee mapping).
- **Attendance** → **Field Movement Logs** (employee explanations for flagged days). See the Field Movement guide.
- **Attendance** → **Work From Home** (WFH days). See the Work From Home guide.
- Monthly review: open a month from the Attendance list (**Review**). The review page URL is by month and year.

---

## How to import a monthly attendance file

*(HR only; needs the create permission for attendance)*

1. Export the monthly summary from the attendance machine. It must be the Deli e+ **Monthly summary export** (月度汇总表) in `.xlsx` format.
2. Go to **Attendance** and click **Import Attendance**.
3. In step **Upload File**, drop the file into the drop area, or click to browse. Only `.xlsx` files up to 10 MB are accepted.
4. Wait for the preview. The system reads the file and matches each row to an employee.
5. Step **Review & Confirm** shows four sections:
   - **Matched**: rows matched to an employee. The match type is shown: *Saved identity*, *ID Match*, *Name Match*, or *Manual*.
   - **Needs Review**: rows the system is not sure about. Check the suggested employee.
   - **Not Matched**: rows that could not be matched. For each one, click **Assign Employee +** to choose the ERP employee, click **Ignore** (with a reason of at least 3 characters) if the person has left the company, or leave it blank to skip the row.
   - **Not in Attendance File**: active scanner employees with no row in the file. For each one, choose to mark them as exempt, mark them *present this month* (a reason is required), or note that they still need enrolment on the machine.
6. Click **Confirm Import**.
7. If the month was already imported, you will be asked **Replace existing data?**. Confirm to replace it.
8. Step **Done** shows **Import Complete**. Click **Import Another Month** to start again.

> **What happens next:** The daily logs and monthly summaries are built for each employee. The month is set to **Pending Review** and stays unlocked until it is approved. Your mapping choices are saved, so the next import matches those people automatically.

[SCREENSHOT: attendance-import-upload.png]

[SCREENSHOT: attendance-import-review.png]

### Rules the import enforces

- Only `.xlsx` files are accepted. Other files are rejected.
- A preview is kept for 10 minutes. If you wait longer, upload the file again.
- An ignored identity can be restored from the preview with **Undo**.

---

## How to map attendance identities

*(HR only)*

The machine records people by a device name and ID. An identity links that device record to an ERP employee.

1. Go to **Attendance** → **Attendance Identities**.
2. Use the status filter: **All**, **Mapped**, or **Ignored**. Search by name or device ID.
3. For an unmapped row, click **Map to employee**. For a mapped row, click **Change employee**.
4. Type to search the employee, pick the right person, and save.
5. To ignore an identity (for example, a former employee), choose to ignore it and enter a reason.

> **What happens next:** The mapping is used for every future import. Changes take effect on the next import or re-import.

---

## How to review a month

*(HR users with the approve permission)*

1. Go to **Attendance**, find the month, and click its **Review** button (labelled *Review* with the month and year).
2. Read the summary: **Employees**, **Total Flagged Days**, **Employees with Flags** and **Resolved Flags**.
3. Use the banner to see the state:
   - **Pending Review**: review all employee records before approving.
   - **Reviewed**: ready for approval.
   - A *schedule changed* warning appears when a site, WFH or leave change was approved after the month was locked. Unlock the month so those changes are applied to the attendance figures.
4. Open an employee to see the **Daily logs**. Each day shows its status and any deduction.
5. Flag columns:
   - **Forgot to clock**: a missing clock-in or clock-out.
   - **Early departure**: left before the scheduled end. Shows *Early departure - approval pending* while it is under review.
   - **Field movements**: an explanation has been submitted through a field movement log.
6. To correct a day, click **Correct**, enter the corrected clock-in or clock-out time, add a **Correction Note**, and click **Save Correction**. Corrections are allowed only while the month is open.
7. When every record is checked, click **Mark as Reviewed**.

> **What happens next:** The month moves from **Pending Review** to **Reviewed**.

---

## How to approve a month

*(HR users with the approve permission)*

1. Open the month in **Review**. The month must be **Reviewed** first.
2. Click **Approve Month**.
3. Read the dialog: it locks the attendance for the month and notifies employees who have flagged days to submit explanations.
4. Click **Approve** to confirm.

> **What happens next:**
> - The month is locked. Daily corrections are no longer possible.
> - Each employee with unresolved flagged days receives a notification to submit an explanation (a field movement log).
> - The month's figures are used for payroll.

---

## How to unlock an approved month

*(HR users with the approve permission)*

Unlock only when a correction must be made after approval, or when a site, WFH or leave change needs to be applied.

1. Open the approved month in **Review**.
2. Click **Unlock Month**.
3. Enter the **Unlock reason**. It is required.
4. Click **Unlock**.

> **What happens next:** The month reopens. Corrections are allowed again. Approve the month once the corrections are complete. Payroll for the month may need to be reviewed too (see the Payroll guide).

---

## How to handle employees awaiting enrolment

*(HR only)*

Some new employees are not yet enrolled on the attendance machine. They are counted as present, and the system tracks them on the **Awaiting enrolment** list.

1. From **Attendance**, open **Awaiting enrolment**.
2. Review the list. Each employee is listed while they have no scan in any later import.
3. Enrol the employee on the attendance machine when possible.

> **What happens next:** Once an import contains a scan for the employee, they leave this list automatically.

---

## How to check the attendance of an employee

*(Employees see their own record; HR sees everyone)*

1. Go to **Attendance** → **Attendance**. HR can search by employee and month. Employees see only their own month.
2. Click a row to open the employee's year profile or daily logs.
3. The columns show:
   - **Days attended**: the actual attendance days.
   - **Absent**, **Late Days** and **Leave Days**.
   - **Paid days (30-day basis)**: the paid days used for the month.
   - **Unpaid leave**.
   - **Site / WFH**: days covered by site assignments or work from home.

---

## Tips

- Import each month as soon as the export is ready, and before the payroll run.
- Clear the **Not Matched** rows before confirming. A person left unmatched will have no attendance for the month.
- Use **Mark as Reviewed** only after you have checked the flagged days.
- Unlock a month only for a real correction, and record the reason.
