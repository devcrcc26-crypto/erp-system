# Employee Management

HR keeps a record for every employee: their account, personal details, job, leave policy, documents and contract. This topic covers adding employees, keeping their records up to date, contracts, and what to do when someone takes a long break, leaves or comes back.

*(This guide is for HR and System Administrators. Employees see their own details under **My Profile**.)*

**Where to find it**
- Employees: in the left menu, go to **People** → **Employees**.
- Contracts: **People** → **Employee Contracts**.

---

## How to add an employee

*(HR)*

1. In the left menu, go to **People** → **Employees**.
2. Click **Add employee**. The form has six steps: **Account & Access**, **Personal Information**, **Employment Details**, **Education & Experience**, **Leave Policy & Documents** and **Review & Submit**.


## Step 1 — Account & Access

*(HR)*

1. **First Name** (required), **Middle Name**, **Last Name**, **Gender** and **Chinese Name**.
2. **Email**: the employee gets an activation link at this address. Leave it blank for someone who will not sign in. They are then saved as a record only, with no login access.
3. **Phone**, **Secondary phone** and **Login name**. Click **Use full name** to fill in the login name.
4. **Roles** (required): assign at least one role, and mark exactly one as primary. Each role can be added only once.
5. **Active Account**: **Active** or **Inactive**.
6. **Approver only - excluded from HR processes**: tick this for people who only approve requests, such as an external director, and enter the **Reason**.
7. Click **Next**.

## Step 2 — Personal Information

*(HR)*

1. **Date of Birth** and **National ID**.
2. The address: **Country**, **Region**, **City**, **Subcity / Zone**, **Woreda** and **House Number**.
3. The emergency contacts.
4. Click **Next**.

## Step 3 — Employment Details

*(HR)*

1. **Employee ID**, **Nationality**, **Employee Type** (**Permanent**, **Contract**, **Temporary** or **Freelancer**) and **Employment date**.
2. Under **Organization Assignment**, choose the **Department**, **Position**, **Seniority**, **Discipline** and **Reports To** (the manager).
3. Click **Next**.

> **Important:** **Reports To**, **Department** and **Discipline** decide who approves this person's requests. Keep them up to date.

## Step 4 — Education & Experience

*(HR)*

1. **Education Level**, **Field of Study** and **Years of Experience**.
2. Click **Next**.

## Step 5 — Leave Policy & Documents

*(HR)*

1. **Leave Policy** and **Work Schedule**.
2. **Include in payroll** and **Attendance mode** (**Scanner** or **Exempt**).
3. The bank details: **Bank Name**, **Bank Branch**, **Bank Account Number** and **TIN**.
4. **Profile picture** and **Documents**: upload education documents, certificates, licences and the CV.
5. Click **Next**.

## Step 6 — Review & Submit

*(HR)*

1. Check every section.
2. Click **Back** to change anything, then submit.

> **Note:** For an employee with an email, you can tick **Create with temporary password** in Step 1 instead of sending an activation link. They must change the password the first time they sign in.

> **After you submit:** The employee appears in **Employees**. If you entered an email, they get an activation link. Until they use it, they are counted under **Pending Activation**, and you can click **Resend verification** to send the link again.

---

## How to find and update an employee

*(HR)*

1. On **Employees**, the counters show **Total Employees**, **Active**, **Pending Activation** and **Inactive**.
2. Search by name, email or ID. Filter by **Department**, **Status**, **Employment status**, **Discipline**, **Position**, **Employee Type** or **Nationality** under **More filters**. Tick **Show employees with no role** to find accounts that are not set up.
3. Open the employee. The tabs show their **Overview**, **Leave**, **Attendance**, **Work Schedule**, **Payroll**, **Per Diem** and **Evaluations**.
4. Click **Edit** to change their details.

To add many employees at once, click **Import from Excel** on **Employees**. Each row is checked and marked **Ready**, **Warning**, **Invalid** or **Duplicate** before anything is saved.

---

## How to record an employee contract

*(HR)*

1. In the left menu, go to **People** → **Employee Contracts**. The counters show **Total**, **Active**, **Expiring soon** and **Ended**.
2. Click **New Contract**. The form has four steps.
3. **Contract Details**: the **Employee**, **Contract Type** (**Fixed Term**, **Open-ended**, **Probation** or **Renewal**), **Signed Date**, **Start Date**, **End Date** and **Notes**.
4. **Compensation**: **Basic Salary**, **Transportation Allowance** and **Monthly Bonus**, and whether **Pension applicable** and **Tax applicable** are ticked. The preview shows the **Estimated net** for a normal month. Use **Calculate from target net** to work out the basic salary from the net pay you want.
5. **Supporting Documents**: attach the signed contract.
6. **Review & Submit**: click **Create Contract**.


> **After you save:** You see *"Employee contract created"*. Payroll uses the active contract's pay.

To end a contract early, open it, click **Terminate**, enter the **Termination Date** and **Termination Reason**, and confirm **Terminate contract?**. To correct the date later, open the terminated contract and click **Edit termination date**.

---

## How to set someone inactive for a while

*(HR)*

Use this for long unpaid leave, suspension or similar breaks. The employee stays on the payroll list.

1. Open the employee and click **More actions** → **Set inactive**.
2. Choose the **Type** (**Suspended**, **Long leave** or **Other**), the **From** date, and the **To (optional)** date. Leave **To** empty if the end date is not known yet.
3. Enter the **Reason** and confirm.

> **After you confirm:** Days in the period show as **Inactive** in attendance, not absent. Pay and login follow the HR policy for the chosen type.

To end it, click **Reactivate**, set the **Last inactive day (optional)**, and confirm. Attendance and payroll are recalculated.

---

## How to process someone leaving

*(HR)*

1. Open the employee and click **More actions** → **Separate employee**.
2. **Leaving date (last working day)**: login is turned off and the contract ends the day after this date. Until then the employee keeps working and signing in.
3. **Separation type**: **Resignation**, **Termination**, **Contract end**, **Death** or **Other**.
4. **Reason** (required).
5. Read the warnings. They show the contract that will end, approvals waiting on this person, requests they submitted that are still pending, and any payroll already approved for the month.
6. If they hold anything, click **Next: handover**. For each pending approval and each leader or approver role, choose the **Replacement**, or **Skip** with a reason. For each request they submitted, choose **Keep** or **Cancel request**.
7. Click **Separate**.


> **Note:** To change the leaving date later, click **Edit leaving date** on the banner. To undo a separation, click **Cancel separation**. Employment, the contract end date and login go back to how they were.

> **Note:** If payroll for the month is already approved, tick *"I understand: mark the payroll stale and notify payroll."* Final settlement items such as leave payout or severance are only calculated in payroll when they are switched on in the HR policy settings.

---

## How to rehire someone

*(HR)*

1. Open the separated employee and click **Rehire**.
2. Enter the **New start date**, **Contract signed on**, **Contract type**, **Contract end date**, **Basic salary** (required), **Transport allowance**, **Monthly bonus**, **Pension applies** and the **Reason**.
3. Click **Rehire**.

> **After you rehire:** A new employment period and contract are created, and earlier periods are kept under **Employment history**. Login is turned back on with a **Temporary password (shown once)**. Give it to the employee. They must change it the first time they sign in.

---

## Things HR should know

*(HR)*

- **Deleting.** **Delete employee** deactivates the account, so they can no longer sign in. Some protected accounts cannot be deactivated.
- **Approvers.** Before someone leaves, finish the handover so their pending approvals do not get stuck.
