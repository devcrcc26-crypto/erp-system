# Leave Requests

This guide covers requesting leave, tracking it, editing or cancelling it, and how approval works. Leave balances are shown on the same screens.

**Where to find it**
- Sidebar → **Time & Attendance** → **Leave** → **Leave Requests** (company list; HR sees everyone, others see their own).
- Sidebar → **New Request** → **Leave** (the form to create a request).
- Your own balances and history: sidebar → **My Profile** → **Leave** tab. Use **View all** for the full history.

---

## How to submit a leave request

*(All employees)*

1. Go to **New Request** → **Leave**, or open **Time & Attendance** → **Leave** → **Leave Requests** and click **New Leave Request**.
2. Fill in **Leave Type**: choose one of Annual, Sick, Unpaid, Maternity, Paternity, Emergency, Compassionate, Study Leave or Exam Leave. Maternity only appears for employees whose gender on record is female.
3. Fill in **Leave periods**: pick a **date range** for each period. Set the **day portion** for each period to *Full day*, *Morning* or *Afternoon*. Use **Add period** to add more ranges (for example, a split leave). Periods may not overlap.
4. Wait for **Remaining after request** to update. The system counts only working days from your work schedule. Weekends, public holidays and non-working days are not charged. The preview shows the total days and what was excluded.
5. Optionally fill in **Reason**.
6. Click **Next**.
7. On **Supporting Documents**, optionally attach files (PDF, JPG, PNG, DOC, DOCX). Attach a medical certificate for sick leave if you have one.
8. Click **Next** to reach **Review & Submit**. Check the summary.
9. Click **Submit Request**.



> **What happens next:** If you have a line manager, the request enters the approval chain (see *How approval works* below). You are taken to the request's detail page. If the request is auto-approved (for example, an HR manager submitting for themselves), it is approved immediately and the leave is recorded straight away.

### Things that stop a submission

- **Insufficient balance.** If the days requested are more than the **Remaining** balance for the leave year, the form shows *"Insufficient leave balance for the selected dates"* (with the remaining and requested days) and will not submit. Unpaid leave has no balance and is not blocked by this.
- **No working days.** If the periods contain only weekends or public holidays, the form says there are no working days to charge.
- **Overlapping periods.** Two periods in the same request cannot overlap.
- **Conflicting schedule.** A full day cannot already be covered by another approved or requested item: leave, site assignment, work from home, or a field movement. For a half day, only site assignment, work from home and field movement block it, so a half day can sit next to another half-day leave.

---

## How to check your leave balance

*(All employees)*

1. Open the leave form (**New Request** → **Leave**). The **Leave Balance** panel on the right updates to match the dates you choose.
2. The balance shows these figures for the leave type:
   - **Entitled**: days you are allowed in this leave year.
   - **Brought Forward**: days carried in from the previous year.
   - **Used**: days already taken and approved.
   - **Pending**: days in requests still waiting for approval.
   - **Remaining**: Entitled + Brought Forward − Used − Pending.
3. Leave years follow your **employment anniversary**, not the calendar year. The panel shows which year it is using.

> **Note:** Unpaid leave has no balance row, so the balance panel says so.

---

## How to view your leave requests and history

*(All employees)*

1. Go to **Time & Attendance** → **Leave** → **Leave Requests**.
2. Use the status cards at the top (Total, Draft, Pending, Approved, Rejected) to see how many requests are in each state.
3. Use the search box or filters to find a request by number, leave type or status.
4. Click a row to open its detail page. It shows the dates, days, periods, reason, attachments, balance at the time, and the approval chain.

---

## How to edit a leave request

*(The requester while the request is Draft or Returned. HR may also edit.)*

1. Open the request from **Leave Requests** (or from **Approvals**).
2. Click **Update** (the pencil button). The button is visible only when the request is **Draft** or **Returned**.
3. The edit form is one page, not a stepper. Change the leave type, periods, day portions or reason. The same rules as submitting apply.
4. Click **Save Changes**.

> **What happens next:** The changes are saved and the request keeps its current status. A **Draft** stays a draft until you submit it. A **Returned** request is not sent again by saving; see *How to respond to a returned leave request* below. Requests that are **Submitted**, **In Review**, **Approved**, **Rejected** or **Cancelled** cannot be edited. To change those, cancel the request (if allowed) and submit a new one.

---

## How to cancel a leave request

*(The requester, or HR)*

1. Open the request.
2. Click **Cancel Request**.
3. Confirm in the dialog. The dialog states that the cancellation cannot be undone.

> **What happens next:** The request becomes **Cancelled**, and any pending balance is released. The linked approval request is cancelled too.
>
> **Rules:**
> - A **Draft**, **Submitted** or **In Review** request can be cancelled by the requester or HR.
> - An **Approved** request can be cancelled **only by HR**. Cancelling it gives the days back to the balance and recalculates the attendance for those dates.
> - **Rejected**, **Returned** and already **Cancelled** requests cannot be cancelled.

---

## How to delete a leave request (HR only)

1. Open the request.
2. Click **Delete** (the trash button). It appears only for HR.
3. Confirm in the dialog.

> **What happens next:** The request is removed from the register (it is a soft delete) and its effect on the balance is reversed. This cannot be undone from the screen.

---

## How to view and track all leave requests (HR)

*(HR only)*

1. Go to **Time & Attendance** → **Leave** → **Leave Requests**.
2. Choose the **Requests** tab or the **Balances** tab.
3. Filter by **Employee**, **Leave Type** or **Status**. Search by request number.
4. Open the **Balances** tab to see every employee's balance per leave type and year. Use **Edit Balances** to adjust balances through the leave ledger (opening balance, adjustment or snapshot). Every change is recorded in the balance history.

---

## How to submit leave on behalf of an employee

*(HR Manager, General Manager, Managing Director, System Administrator, and Department Heads and Discipline Leads within their own scope)*

1. Open **New Request** → **Leave** (or the leave form).
2. In the **Submission details** section, switch on **Submit on behalf of another employee**, then choose the employee this request belongs to.
3. Complete the form as normal.
4. Submit.

> **Rules:**
> - A **Department Head** can submit only for employees in the same department.
> - A **Discipline Lead** can submit only for employees in a discipline they lead.
> - Others cannot submit for other people.
>
> **What happens next:** The request belongs to the employee. The approval chain is built from the employee's manager, not from you.

---

## How approval works

*(Read-only for everyone; approvers act from the **Approvals** inbox. See the Approvals guide.)*

**Standard employee:**
1. The employee's **Reports to** manager approves first.
2. The **HR Manager** approves second.
3. When the final approver approves, the request becomes **Approved** and the days move from *Pending* to *Used* in the balance.

**Discipline Lead:** the **Department Head** (if assigned), then the **HR Manager**.

**Department Head:** the **General Manager**, then the **HR Manager**.

**HR staff:** the **HR Manager**.

**HR Manager:** the **General Manager**.

**General Manager, Managing Director and System Administrator:** no approval chain. The request is approved on submit.

**Notifications the requester and approvers see:**
- Approver: *"Approval required"* when a request arrives at their tier.
- Requester: *"Approved"* when the request is fully approved, *"Rejected"* when rejected, and *"Approval returned"* when returned for revision. The approver's note (if any) is shown in the notification.

**Statuses you will see:**

| Status | Meaning |
|---|---|
| Draft | Saved, not sent. |
| Submitted | Sent; waiting for the first approver. |
| In Review | Being reviewed by an approver. |
| Returned | An approver sent it back. Edit and resubmit. |
| Approved | Fully approved. Days are used. |
| Rejected | Refused. The request is closed. |
| Cancelled | Cancelled by the requester or HR. |

---

## How to respond to a returned leave request

*(The requester)*

1. You receive a notification *"Approval returned"*, and the request shows **Returned** with the approver's note.
2. Open the request and click **Update** to change what was asked. Click **Save Changes**.
3. Open **Approvals**, find the request, and in the **Resubmit** panel add a short note and attach files if needed. Click **Resubmit**.

> **What happens next:** The request restarts at the first approver, who receives *"Resubmitted for approval"*. Saving the edit alone does not send the request back into the chain.

---

## Tips

- Submit leave early so the approval chain has time to act.
- Check **Remaining after request** before you submit. A request that exceeds the balance will not go through.
- If you see *"Approval required"* for a leave request that is not yours, open it from **Approvals** to decide.
- If your request is stuck, check the approval chain on the detail page to see which approver is waiting.
