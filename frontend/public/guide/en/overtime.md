# Overtime (OT)

Overtime is recorded on a **monthly overtime sheet**. You open one sheet per month, add the overtime entries (date and start/end times), then submit the sheet for approval. Hours are split automatically into categories, and the sheet's totals update as you add entries.

**Where to find it**
- Sidebar → **Time & Attendance** → **Schedules & Overtime** → **Overtime**. This is the sheet list (HR sees all sheets; everyone else sees their own).
- Your own history: sidebar → **My Profile** → overtime history (**View all**).

---

## Important rules

- **Overtime is outside scheduled working hours.** Time inside your scheduled morning and afternoon work hours does not count as overtime. Only time before or after your shift, on weekends and on public holidays is counted.
- **Weekday lunch (12:30–13:30) is never overtime.** On Monday to Friday, the lunch break is excluded. An entry that runs into it is capped at 12:30 (the end) or starts at 13:30 (the start). The form shows *"Lunch break (12:30–13:30) is not counted as OT"*. Saturday has no lunch exclusion. Sundays, public holidays and site-assignment days are not affected by this rule.
- **Approved leave removes its hours from overtime.** If you have approved leave on a day, the scheduled hours covered by that leave cannot be claimed as overtime. The form shows *"You're on approved leave this day."* A half-day leave excludes only its own half.
- **Site-assignment days.** If you are on an approved site assignment, the normal scheduled hours that day are claimable as overtime. The form shows *"On site assignment — full day OT eligible (regular schedule does not apply)."*
- **No future dates.** You cannot record overtime for a date that has not happened yet. You also cannot open a sheet for a future month.
- **Entries must stay inside the sheet's month.** The entry date must fall in the sheet's month.
- **No overlaps.** Two entries on the same day cannot overlap in time. An entry with the same date and the same start and end time as an existing one is rejected.
- **Locked after payroll.** Once the payroll run for that month is finalized, overtime entries for that month are locked and cannot be changed.

---

## How to open an overtime sheet for the month

*(All employees)*

1. Go to **Time & Attendance** → **Schedules & Overtime** → **Overtime**.
2. Click **Add Overtime Sheet**.
3. Choose the **Month**. Pick the month you worked.
4. Click **Open sheet**. If a sheet for that month already exists as a draft, the form offers **Continue draft** instead. If it has already been submitted, it offers **Open it**.

> **What happens next:** The sheet opens in **Draft** status. You can now add entries.


---

## How to add an overtime entry

*(The employee who owns the sheet, while it is Draft or Returned)*

1. Open the sheet from the **Overtime** list.
2. Click **Add entry** (or **Add next-day entry** for an overnight shift that runs past midnight).
3. Fill in **Date**. Choose a date in the sheet's month that is not in the future.
4. Fill in **Start** and **End**. The time pickers show only the times that are available that day. If none are available, the form says *"No overtime times are available for this day."*
5. Fill in **Task Description** (what you did during the overtime). This is required.
6. Optionally attach supporting files (for example, a signed time record).
7. Check the **Hours preview**. It shows the hours in each category:
   - **Normal OT** (weekday hours outside scheduled work time), shown with the rate *Normal × 1.5*.
   - **Evening OT** (22:00–06:00), shown with the rate *Evening × 1.75*.
   - **Weekend**, shown with the rate *Weekend × 2.0*.
   - **Holiday**, shown with the rate *Holiday × 2.5*.
   - **Total**: the sum of all categories.

   The rates are shown for reference on the form.
8. Click **Save**.

> **What happens next:** The entry is added and the sheet totals are recalculated. The entry may show an **Attendance check** flag if the times do not match your attendance scans for that day. The flag is a warning for review; it does not stop you saving.


---

## How to edit an overtime entry

*(The employee who owns the sheet, or HR, while the sheet is Draft or Returned)*

1. Open the sheet.
2. Click the entry (or its edit control) to open **Edit entry**.
3. Change the date, times, task description or attachments.
4. Click **Save**.

> **What happens next:** The hour categories are recalculated, and the sheet totals update. Entries cannot be changed once the sheet is **Submitted**, **Approved**, **Rejected** or **Cancelled**, or once payroll for the month is final.

---

## How to delete an overtime entry

*(Requires delete permission: HR)*

1. Open the sheet.
2. Click **Delete** on the entry.
3. Confirm in the dialog. It says the entry will be removed and the sheet totals recalculated.

> **What happens next:** The entry is removed and the sheet totals update.

---

## How to attach files to an entry

1. Open the entry in **Edit entry**.
2. Click **Attach files** and choose PDF, image, Word or Excel files.
3. Confirm the upload. You can remove an attachment later with its remove control.

> **Note:** Attachments are checked for file type. Files of an unsupported type are rejected.

---

## How to import overtime from Excel

*(HR only)*

1. Go to **Time & Attendance** → **Schedules & Overtime** → **Overtime**. Click **Import from Excel** to import across sheets, or open a specific sheet and click **Import from Excel** to import into that sheet.
2. In the import drawer, step **Upload**: click **Download template** first so the column names match. Keep the header row as it is.
3. Each row needs an employee email or employee ID, a date, a start time, an end time and a task description. Rows with blanks in those fields are marked invalid.
4. Drop your `.xlsx` file into the drop area (or click to browse). The file must be no larger than 5 MB and contain no more than 500 data rows.
5. Step **Review**: check the rows marked **Ready** and **Invalid**. Fix the invalid rows in your file and upload again if needed.
6. Step **Done**: the **Import complete** message confirms what was written.

> **Rules:** Rows can be imported only into sheets that are **Draft** or **Returned**. Only `.xlsx` files are accepted. A missing required column stops the import, and the error names the column.

---

## How to submit an overtime sheet for approval

*(The employee who owns the sheet)*

1. Open the sheet while it is **Draft** or **Returned**.
2. Check that at least one entry is on the sheet. The button needs at least one entry.
3. Click **Submit Sheet**.
4. Confirm. The dialog says the approval workflow starts and that you cannot edit entries until the sheet is returned.

> **What happens next:**
> - The sheet becomes **Submitted**, and the approval chain starts (see below).
> - If you have no approver above you (for example, General Manager or Managing Director), the sheet is **Approved** immediately.
> - If you resubmit a **Returned** sheet, it goes back to the first approver with the same approval request. You do not start a new one.

---

## How to cancel an overtime sheet

*(The employee who owns the sheet)*

1. Open the sheet while it is **Draft** or **Submitted**.
2. Click **Cancel Sheet**.
3. Confirm. The dialog says the cancellation also cancels any linked approval request.

> **What happens next:** The sheet becomes **Cancelled**. You cannot cancel a sheet that is **Approved**, **Rejected** or **Returned**.

---

## How to delete an overtime sheet (HR only)

1. Open the sheet.
2. Click **Delete**.
3. Confirm. This permanently removes the sheet and cancels any linked approval request.

---

## How to check your sheet's status

1. Go to the **Overtime** list. Use the stats (**Total**, **Pending**, **Approved**, **Rejected**) and search by sheet number.
2. Click a sheet to see its status, totals per category, entries and approval chain.
3. Open **Approvals** to see the approval steps and any notes.

---

## How approval works

*(Read-only for everyone; approvers act from the **Approvals** inbox. See the Approvals guide.)*

The overtime approval chain is the same as leave:

1. **Standard employee:** the **Reports to** manager, then the **HR Manager**.
2. **Discipline Lead:** the **Department Head** (if assigned), then the **HR Manager**.
3. **Department Head:** the **General Manager**, then the **HR Manager**.
4. **HR staff:** the **HR Manager**.
5. **HR Manager:** the **General Manager**.
6. **General Manager, Managing Director and System Administrator:** no approval; the sheet is approved on submit.

**Statuses:**

| Status | Meaning |
|---|---|
| Draft | Being prepared. You can edit it. |
| Submitted | Sent for approval. Entries are locked. |
| Returned | An approver sent it back. Edit it, then **Submit Sheet** again. |
| Approved | Fully approved. |
| Rejected | Refused. The sheet is closed. |
| Cancelled | Cancelled by the owner or HR. |

**Notifications:**
- Approver: *"Approval required"* when a sheet reaches their tier.
- Owner: *"Approved"* when fully approved, *"Rejected"* when rejected, and *"Approval returned"* when returned, with the approver's note.

---

## Tips

- Enter overtime on the same day or the following day, while the times are fresh.
- Check the **Hours preview** before you save, so the categories are what you expect.
- Attach a note or record for overtime that is outside the normal pattern.
- Submit the sheet once, at the end of the month, after all entries are added.
- If the **Attendance check** flag appears, compare the times with your attendance record before you submit.
