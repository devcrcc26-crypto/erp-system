# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-hr-review.spec.ts >> 02 �?HR review page >> Mark as Reviewed button changes status to REVIEWED
- Location: tests\attendance\02-hr-review.spec.ts:181:7

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.isEnabled: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /mark as reviewed/i })

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e5]:
    - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "Main navigation" [ref=f1e7]:
      - generic [ref=f1e8]:
        - link "CCECC workspace" [ref=f1e10] [cursor=pointer]:
          - /url: /
          - img "CCECC" [ref=f1e12]
          - generic [ref=f1e13]: CCECC
        - generic [ref=f1e15]:
          - generic [ref=f1e16]: Find a module
          - generic [ref=f1e17]:
            - searchbox "Find a module" [ref=f1e18]
            - generic: Ctrl K
          - paragraph [ref=f1e19]
        - list [ref=f1e21]:
          - listitem [ref=f1e22]:
            - link "Dashboard" [ref=f1e23] [cursor=pointer]:
              - /url: /
          - listitem [ref=f1e29]:
            - link "New Request" [ref=f1e30] [cursor=pointer]:
              - /url: /approvals/new
          - listitem [ref=f1e36]:
            - button "Human Resources" [expanded] [ref=f1e37] [cursor=pointer]
            - group "Human Resources" [ref=f1e48]:
              - generic [ref=f1e49]:
                - button "People" [expanded] [ref=f1e50] [cursor=pointer]
                - list [ref=f1e55]:
                  - listitem [ref=f1e56]:
                    - link "Users" [ref=f1e57] [cursor=pointer]:
                      - /url: /users
                    - button "Pin Users to favorites" [ref=f1e66] [cursor=pointer]
                  - listitem [ref=f1e69]:
                    - link "Employee Contracts" [ref=f1e70] [cursor=pointer]:
                      - /url: /hr/employee-contract
                    - button "Pin Employee Contracts to favorites" [ref=f1e78] [cursor=pointer]
              - generic [ref=f1e81]:
                - button "Time & Leave" [expanded] [ref=f1e82] [cursor=pointer]
                - list [ref=f1e87]:
                  - listitem [ref=f1e88]:
                    - link "Leave Requests" [ref=f1e89] [cursor=pointer]:
                      - /url: /hr/leave-requests
                    - button "Pin Leave Requests to favorites" [ref=f1e95] [cursor=pointer]
                  - listitem [ref=f1e98]:
                    - link "Overtime" [ref=f1e99] [cursor=pointer]:
                      - /url: /hr/overtime
                    - button "Pin Overtime to favorites" [ref=f1e106] [cursor=pointer]
                  - listitem [ref=f1e109]:
                    - link "Attendance" [ref=f1e110] [cursor=pointer]:
                      - /url: /hr/attendance
                    - button "Pin Attendance to favorites" [ref=f1e117] [cursor=pointer]
                  - listitem [ref=f1e120]:
                    - link "Field Movement Logs" [ref=f1e121] [cursor=pointer]:
                      - /url: /hr/field-movement-logs
                    - button "Pin Field Movement Logs to favorites" [ref=f1e128] [cursor=pointer]
                  - listitem [ref=f1e131]:
                    - link "Work Schedules" [ref=f1e132] [cursor=pointer]:
                      - /url: /hr/work-schedules
                    - button "Pin Work Schedules to favorites" [ref=f1e140] [cursor=pointer]
                  - listitem [ref=f1e143]:
                    - link "Public Holidays" [ref=f1e144] [cursor=pointer]:
                      - /url: /hr/public-holidays
                    - button "Pin Public Holidays to favorites" [ref=f1e152] [cursor=pointer]
                  - listitem [ref=f1e155]:
                    - link "Leave Policy" [ref=f1e156] [cursor=pointer]:
                      - /url: /hr/leave-policy
                    - button "Pin Leave Policy to favorites" [ref=f1e163] [cursor=pointer]
              - generic [ref=f1e166]:
                - button "Travel & Expenses" [expanded] [ref=f1e167] [cursor=pointer]
                - list [ref=f1e172]:
                  - listitem [ref=f1e173]:
                    - link "Expense Claims" [ref=f1e174] [cursor=pointer]:
                      - /url: /hr/expense-claims
                    - button "Pin Expense Claims to favorites" [ref=f1e181] [cursor=pointer]
                  - listitem [ref=f1e184]:
                    - link "Flight Applications" [ref=f1e185] [cursor=pointer]:
                      - /url: /hr/flight-applications
                    - button "Pin Flight Applications to favorites" [ref=f1e191] [cursor=pointer]
                  - listitem [ref=f1e194]:
                    - link "Business Trips" [ref=f1e195] [cursor=pointer]:
                      - /url: /hr/business-trips
                    - button "Pin Business Trips to favorites" [ref=f1e203] [cursor=pointer]
                  - listitem [ref=f1e206]:
                    - link "Per Diem" [ref=f1e207] [cursor=pointer]:
                      - /url: /hr/per-diem
                    - button "Pin Per Diem to favorites" [ref=f1e214] [cursor=pointer]
                  - listitem [ref=f1e217]:
                    - link "Employee Per Diem Rates" [ref=f1e218] [cursor=pointer]:
                      - /url: /hr/employee-per-diem-rates
                    - button "Pin Employee Per Diem Rates to favorites" [ref=f1e225] [cursor=pointer]
              - generic [ref=f1e228]:
                - button "Procurement" [expanded] [ref=f1e229] [cursor=pointer]
                - list [ref=f1e234]:
                  - listitem [ref=f1e235]:
                    - link "Purchase Requests" [ref=f1e236] [cursor=pointer]:
                      - /url: /hr/purchase-requests
                    - button "Pin Purchase Requests to favorites" [ref=f1e244] [cursor=pointer]
                  - listitem [ref=f1e247]:
                    - link "Material Requisition" [ref=f1e248] [cursor=pointer]:
                      - /url: /hr/material-requisition
                    - button "Pin Material Requisition to favorites" [ref=f1e256] [cursor=pointer]
                  - listitem [ref=f1e259]:
                    - link "Consumables" [ref=f1e260] [cursor=pointer]:
                      - /url: /hr/consumables
                    - button "Pin Consumables to favorites" [ref=f1e268] [cursor=pointer]
              - generic [ref=f1e271]:
                - button "Fleet & Assets" [expanded] [ref=f1e272] [cursor=pointer]
                - list [ref=f1e277]:
                  - listitem [ref=f1e278]:
                    - link "Vehicle Applications" [ref=f1e279] [cursor=pointer]:
                      - /url: /hr/vehicle-applications
                    - button "Pin Vehicle Applications to favorites" [ref=f1e287] [cursor=pointer]
                  - listitem [ref=f1e290]:
                    - link "Vehicle Refueling" [ref=f1e291] [cursor=pointer]:
                      - /url: /hr/vehicle-refueling
                    - button "Pin Vehicle Refueling to favorites" [ref=f1e298] [cursor=pointer]
                  - listitem [ref=f1e301]:
                    - link "Inspection & Repair" [ref=f1e302] [cursor=pointer]:
                      - /url: /hr/inspection-repair
                    - button "Pin Inspection & Repair to favorites" [ref=f1e308] [cursor=pointer]
                  - listitem [ref=f1e311]:
                    - link "Company Assets" [ref=f1e312] [cursor=pointer]:
                      - /url: /hr/company-asset
                    - button "Pin Company Assets to favorites" [ref=f1e318] [cursor=pointer]
              - generic [ref=f1e321]:
                - button "Administration" [expanded] [ref=f1e322] [cursor=pointer]
                - list [ref=f1e327]:
                  - listitem [ref=f1e328]:
                    - link "Official Seal Usage" [ref=f1e329] [cursor=pointer]:
                      - /url: /hr/official-seal
                    - button "Pin Official Seal Usage to favorites" [ref=f1e336] [cursor=pointer]
                  - listitem [ref=f1e339]:
                    - link "Project Seal Usage" [ref=f1e340] [cursor=pointer]:
                      - /url: /hr/project-seal
                    - button "Pin Project Seal Usage to favorites" [ref=f1e347] [cursor=pointer]
                  - listitem [ref=f1e350]:
                    - link "Exit Permit" [ref=f1e351] [cursor=pointer]:
                      - /url: /hr/equipment-and-materials-exit-permit
                    - button "Pin Exit Permit to favorites" [ref=f1e359] [cursor=pointer]
                  - listitem [ref=f1e362]:
                    - link "HR Reports" [ref=f1e363] [cursor=pointer]:
                      - /url: /hr/reports
                    - button "Pin HR Reports to favorites" [ref=f1e369] [cursor=pointer]
          - listitem [ref=f1e372]:
            - button "Organization" [ref=f1e373] [cursor=pointer]
        - list [ref=f1e383]:
          - listitem [ref=f1e384]:
            - link "Approvals 36 pending approvals" [ref=f1e385] [cursor=pointer]:
              - /url: /approvals
              - generic [ref=f1e390]: Approvals
              - generic [ref=f1e391]:
                - generic [ref=f1e392]: "36"
                - generic [ref=f1e393]: 36 pending approvals
          - listitem [ref=f1e394]:
            - link "My Profile" [ref=f1e395] [cursor=pointer]:
              - /url: /profile
          - listitem [ref=f1e402]:
            - link "Settings" [ref=f1e403] [cursor=pointer]:
              - /url: /settings
        - button "Collapse sidebar" [ref=f1e410] [cursor=pointer]
    - main [ref=f1e416]:
      - generic [ref=f1e417]:
        - generic [ref=f1e418]:
          - heading "Human Resources" [level=1] [ref=f1e421]
          - generic [ref=f1e423]:
            - button "Switch to 中文" [ref=f1e425] [cursor=pointer]:
              - img "global" [ref=f1e427]
              - generic [ref=f1e430]: EN
            - button "Open notifications" [ref=f1e431]:
              - generic [ref=f1e432]:
                - img "bell" [ref=f1e433]
                - superscript [ref=f1e436]:
                  - generic [ref=f1e437]:
                    - generic [ref=f1e438]: "3"
                    - generic [ref=f1e439]: "9"
            - button "Open profile" [ref=f1e440]:
              - generic [ref=f1e441]: J
              - generic [ref=f1e443]:
                - paragraph [ref=f1e444]: Jinxia Dong (董锦霞)
                - paragraph [ref=f1e445]: HR Officer
        - navigation "Breadcrumb" [ref=f1e447]:
          - navigation [ref=f1e448]:
            - list [ref=f1e449]:
              - listitem [ref=f1e450]:
                - link "Dashboard" [ref=f1e452] [cursor=pointer]:
                  - /url: /
              - listitem [ref=f1e458]: /
              - listitem [ref=f1e459]:
                - generic [ref=f1e460]: Human Resources
              - listitem [ref=f1e461]: /
              - listitem [ref=f1e462]:
                - generic [ref=f1e463]: Human Resources
      - generic [ref=f1e466]:
        - generic [ref=f1e467]:
          - link "Attendance" [ref=f1e468] [cursor=pointer]:
            - /url: /hr/attendance
          - generic [ref=f1e469]: /
          - generic [ref=f1e470]: Review August 2026
        - generic [ref=f1e473]:
          - button "Back" [ref=f1e475] [cursor=pointer]:
            - img "arrow-left" [ref=f1e477]
          - heading "Review August 2026" [level=3] [ref=f1e481]
        - alert [ref=f1e482]:
          - img "exclamation-circle" [ref=f1e484]
          - generic [ref=f1e487]: No monthly approval record for this period. Re-import attendance to create one.
        - generic [ref=f1e489]:
          - generic [ref=f1e490]:
            - img "team" [ref=f1e492]
            - generic [ref=f1e495]:
              - paragraph [ref=f1e496]: Total Employees
              - paragraph [ref=f1e497]: "65"
          - generic [ref=f1e498]:
            - img "warning" [ref=f1e500]
            - generic [ref=f1e503]:
              - paragraph [ref=f1e504]: Employees with Flags
              - paragraph [ref=f1e505]: "0"
          - generic [ref=f1e506]:
            - img "warning" [ref=f1e508]
            - generic [ref=f1e511]:
              - paragraph [ref=f1e512]: Total Flagged Days
              - paragraph [ref=f1e513]: "0"
          - generic [ref=f1e514]:
            - img "check-circle" [ref=f1e516]
            - generic [ref=f1e520]:
              - paragraph [ref=f1e521]: Resolved Flags
              - paragraph [ref=f1e522]: "2"
        - generic [ref=f1e528]:
          - table [ref=f1e532]:
            - rowgroup [ref=f1e542]:
              - row [ref=f1e543]:
                - columnheader "Employee" [ref=f1e544]
                - columnheader "Scheduled Days" [ref=f1e545]
                - columnheader "Present Days" [ref=f1e546]
                - columnheader "Absent Days" [ref=f1e547]
                - columnheader "Flagged Days" [ref=f1e548]
                - columnheader "Resolved" [ref=f1e549]
                - columnheader "Status" [ref=f1e550]
                - columnheader "Actions" [ref=f1e551]
            - rowgroup [ref=f1e552]:
              - row [ref=f1e553]:
                - cell [ref=f1e554]
                - cell [ref=f1e555]
                - cell [ref=f1e556]
                - cell [ref=f1e557]
                - cell [ref=f1e558]
                - cell [ref=f1e559]
                - cell [ref=f1e560]
                - cell [ref=f1e561]
              - row [ref=f1e562]:
                - cell "AA Abenezer Abadi EM-003" [ref=f1e563]:
                  - generic [ref=f1e564]:
                    - generic [ref=f1e565]: AA
                    - generic [ref=f1e567]:
                      - paragraph [ref=f1e568]: Abenezer Abadi
                      - generic [ref=f1e569]: EM-003
                - cell "22.5" [ref=f1e570]
                - cell "20" [ref=f1e571]
                - cell "2.5" [ref=f1e572]
                - cell "0" [ref=f1e573]
                - cell "0/0" [ref=f1e575]
                - cell "No Flags" [ref=f1e577]
                - cell [ref=f1e579]:
                  - button "View Daily Logs" [ref=f1e580] [cursor=pointer]
              - row [ref=f1e582]:
                - cell "EA Eskender Abebaw EM-030" [ref=f1e583]:
                  - generic [ref=f1e584]:
                    - generic [ref=f1e585]: EA
                    - generic [ref=f1e587]:
                      - paragraph [ref=f1e588]: Eskender Abebaw
                      - generic [ref=f1e589]: EM-030
                - cell "22.5" [ref=f1e590]
                - cell "22.5" [ref=f1e591]
                - cell "0" [ref=f1e592]
                - cell "0" [ref=f1e593]
                - cell "0/0" [ref=f1e595]
                - cell "No Flags" [ref=f1e597]
                - cell [ref=f1e599]:
                  - button "View Daily Logs" [ref=f1e600] [cursor=pointer]
              - row [ref=f1e602]:
                - cell "HA Helen Abebaw EM-045" [ref=f1e603]:
                  - generic [ref=f1e604]:
                    - generic [ref=f1e605]: HA
                    - generic [ref=f1e607]:
                      - paragraph [ref=f1e608]: Helen Abebaw
                      - generic [ref=f1e609]: EM-045
                - cell "22.5" [ref=f1e610]
                - cell "21" [ref=f1e611]
                - cell "1.5" [ref=f1e612]
                - cell "0" [ref=f1e613]
                - cell "0/0" [ref=f1e615]
                - cell "No Flags" [ref=f1e617]
                - cell [ref=f1e619]:
                  - button "View Daily Logs" [ref=f1e620] [cursor=pointer]
              - row [ref=f1e622]:
                - cell "SA Sony Aboye EM-103" [ref=f1e623]:
                  - generic [ref=f1e624]:
                    - generic [ref=f1e625]: SA
                    - generic [ref=f1e627]:
                      - paragraph [ref=f1e628]: Sony Aboye
                      - generic [ref=f1e629]: EM-103
                - cell "22.5" [ref=f1e630]
                - cell "1" [ref=f1e631]
                - cell "21.5" [ref=f1e632]
                - cell "0" [ref=f1e633]
                - cell "0/0" [ref=f1e635]
                - cell "No Flags" [ref=f1e637]
                - cell [ref=f1e639]:
                  - button "View Daily Logs" [ref=f1e640] [cursor=pointer]
              - row [ref=f1e642]:
                - cell "MA Mestawet Adam EM-068" [ref=f1e643]:
                  - generic [ref=f1e644]:
                    - generic [ref=f1e645]: MA
                    - generic [ref=f1e647]:
                      - paragraph [ref=f1e648]: Mestawet Adam
                      - generic [ref=f1e649]: EM-068
                - cell "22.5" [ref=f1e650]
                - cell "21.5" [ref=f1e651]
                - cell "1" [ref=f1e652]
                - cell "0" [ref=f1e653]
                - cell "0/0" [ref=f1e655]
                - cell "No Flags" [ref=f1e657]
                - cell [ref=f1e659]:
                  - button "View Daily Logs" [ref=f1e660] [cursor=pointer]
              - row [ref=f1e662]:
                - cell "SA Samrawit Adane EM-091" [ref=f1e663]:
                  - generic [ref=f1e664]:
                    - generic [ref=f1e665]: SA
                    - generic [ref=f1e667]:
                      - paragraph [ref=f1e668]: Samrawit Adane
                      - generic [ref=f1e669]: EM-091
                - cell "22.5" [ref=f1e670]
                - cell "20.5" [ref=f1e671]
                - cell "2" [ref=f1e672]
                - cell "0" [ref=f1e673]
                - cell "0/0" [ref=f1e675]
                - cell "No Flags" [ref=f1e677]
                - cell [ref=f1e679]:
                  - button "View Daily Logs" [ref=f1e680] [cursor=pointer]
              - row [ref=f1e682]:
                - cell "MA Mihret Alemayehu EM-069" [ref=f1e683]:
                  - generic [ref=f1e684]:
                    - generic [ref=f1e685]: MA
                    - generic [ref=f1e687]:
                      - paragraph [ref=f1e688]: Mihret Alemayehu
                      - generic [ref=f1e689]: EM-069
                - cell "22.5" [ref=f1e690]
                - cell "1" [ref=f1e691]
                - cell "21.5" [ref=f1e692]
                - cell "0" [ref=f1e693]
                - cell "0/0" [ref=f1e695]
                - cell "No Flags" [ref=f1e697]
                - cell [ref=f1e699]:
                  - button "View Daily Logs" [ref=f1e700] [cursor=pointer]
              - row [ref=f1e702]:
                - cell "NA Nahom Alemayehu EM-078" [ref=f1e703]:
                  - generic [ref=f1e704]:
                    - generic [ref=f1e705]: NA
                    - generic [ref=f1e707]:
                      - paragraph [ref=f1e708]: Nahom Alemayehu
                      - generic [ref=f1e709]: EM-078
                - cell "22.5" [ref=f1e710]
                - cell "22.5" [ref=f1e711]
                - cell "0" [ref=f1e712]
                - cell "0" [ref=f1e713]
                - cell "0/0" [ref=f1e715]
                - cell "No Flags" [ref=f1e717]
                - cell [ref=f1e719]:
                  - button "View Daily Logs" [ref=f1e720] [cursor=pointer]
              - row [ref=f1e722]:
                - cell "NA Netsihit Alemayehu EM-086" [ref=f1e723]:
                  - generic [ref=f1e724]:
                    - generic [ref=f1e725]: NA
                    - generic [ref=f1e727]:
                      - paragraph [ref=f1e728]: Netsihit Alemayehu
                      - generic [ref=f1e729]: EM-086
                - cell "22.5" [ref=f1e730]
                - cell "20.5" [ref=f1e731]
                - cell "2" [ref=f1e732]
                - cell "0" [ref=f1e733]
                - cell "0/0" [ref=f1e735]
                - cell "No Flags" [ref=f1e737]
                - cell [ref=f1e739]:
                  - button "View Daily Logs" [ref=f1e740] [cursor=pointer]
              - row [ref=f1e742]:
                - cell "EA Eden Alemu EM-027" [ref=f1e743]:
                  - generic [ref=f1e744]:
                    - generic [ref=f1e745]: EA
                    - generic [ref=f1e747]:
                      - paragraph [ref=f1e748]: Eden Alemu
                      - generic [ref=f1e749]: EM-027
                - cell "22.5" [ref=f1e750]
                - cell "20" [ref=f1e751]
                - cell "2.5" [ref=f1e752]
                - cell "0" [ref=f1e753]
                - cell "0/0" [ref=f1e755]
                - cell "No Flags" [ref=f1e757]
                - cell [ref=f1e759]:
                  - button "View Daily Logs" [ref=f1e760] [cursor=pointer]
              - row [ref=f1e762]:
                - cell "BA Biruk Alemu EM-016" [ref=f1e763]:
                  - generic [ref=f1e764]:
                    - generic [ref=f1e765]: BA
                    - generic [ref=f1e767]:
                      - paragraph [ref=f1e768]: Biruk Alemu
                      - generic [ref=f1e769]: EM-016
                - cell "22.5" [ref=f1e770]
                - cell "15" [ref=f1e771]
                - cell "7.5" [ref=f1e772]
                - cell "0" [ref=f1e773]
                - cell "0/0" [ref=f1e775]
                - cell "No Flags" [ref=f1e777]
                - cell [ref=f1e779]:
                  - button "View Daily Logs" [ref=f1e780] [cursor=pointer]
              - row [ref=f1e782]:
                - cell "NA Natnael Argaw EM-081" [ref=f1e783]:
                  - generic [ref=f1e784]:
                    - generic [ref=f1e785]: NA
                    - generic [ref=f1e787]:
                      - paragraph [ref=f1e788]: Natnael Argaw
                      - generic [ref=f1e789]: EM-081
                - cell "22.5" [ref=f1e790]
                - cell "21.5" [ref=f1e791]
                - cell "1" [ref=f1e792]
                - cell "0" [ref=f1e793]
                - cell "0/0" [ref=f1e795]
                - cell "No Flags" [ref=f1e797]
                - cell [ref=f1e799]:
                  - button "View Daily Logs" [ref=f1e800] [cursor=pointer]
              - row [ref=f1e802]:
                - cell "MA Mekides Asfaw EM-066" [ref=f1e803]:
                  - generic [ref=f1e804]:
                    - generic [ref=f1e805]: MA
                    - generic [ref=f1e807]:
                      - paragraph [ref=f1e808]: Mekides Asfaw
                      - generic [ref=f1e809]: EM-066
                - cell "22.5" [ref=f1e810]
                - cell "2.5" [ref=f1e811]
                - cell "20" [ref=f1e812]
                - cell "0" [ref=f1e813]
                - cell "0/0" [ref=f1e815]
                - cell "No Flags" [ref=f1e817]
                - cell [ref=f1e819]:
                  - button "View Daily Logs" [ref=f1e820] [cursor=pointer]
              - row [ref=f1e822]:
                - cell "YA Yisak Assefa EM-129" [ref=f1e823]:
                  - generic [ref=f1e824]:
                    - generic [ref=f1e825]: YA
                    - generic [ref=f1e827]:
                      - paragraph [ref=f1e828]: Yisak Assefa
                      - generic [ref=f1e829]: EM-129
                - cell "22.5" [ref=f1e830]
                - cell "22.5" [ref=f1e831]
                - cell "0" [ref=f1e832]
                - cell "0" [ref=f1e833]
                - cell "0/0" [ref=f1e835]
                - cell "No Flags" [ref=f1e837]
                - cell [ref=f1e839]:
                  - button "View Daily Logs" [ref=f1e840] [cursor=pointer]
              - row [ref=f1e842]:
                - cell "SB Shimelis Bacha EM-098" [ref=f1e843]:
                  - generic [ref=f1e844]:
                    - generic [ref=f1e845]: SB
                    - generic [ref=f1e847]:
                      - paragraph [ref=f1e848]: Shimelis Bacha
                      - generic [ref=f1e849]: EM-098
                - cell "22.5" [ref=f1e850]
                - cell "0" [ref=f1e851]
                - cell "22.5" [ref=f1e852]
                - cell "0" [ref=f1e853]
                - cell "0/0" [ref=f1e855]
                - cell "No Flags" [ref=f1e857]
                - cell [ref=f1e859]:
                  - button "View Daily Logs" [ref=f1e860] [cursor=pointer]
              - row [ref=f1e862]:
                - cell "MB Medhanit Berhanu EM-064" [ref=f1e863]:
                  - generic [ref=f1e864]:
                    - generic [ref=f1e865]: MB
                    - generic [ref=f1e867]:
                      - paragraph [ref=f1e868]: Medhanit Berhanu
                      - generic [ref=f1e869]: EM-064
                - cell "22.5" [ref=f1e870]
                - cell "0" [ref=f1e871]
                - cell "22.5" [ref=f1e872]
                - cell "0" [ref=f1e873]
                - cell "0/0" [ref=f1e875]
                - cell "No Flags" [ref=f1e877]
                - cell [ref=f1e879]:
                  - button "View Daily Logs" [ref=f1e880] [cursor=pointer]
              - row [ref=f1e882]:
                - cell "MB Mizen Beyene EM-073" [ref=f1e883]:
                  - generic [ref=f1e884]:
                    - generic [ref=f1e885]: MB
                    - generic [ref=f1e887]:
                      - paragraph [ref=f1e888]: Mizen Beyene
                      - generic [ref=f1e889]: EM-073
                - cell "22.5" [ref=f1e890]
                - cell "0" [ref=f1e891]
                - cell "22.5" [ref=f1e892]
                - cell "0" [ref=f1e893]
                - cell "0/0" [ref=f1e895]
                - cell "No Flags" [ref=f1e897]
                - cell [ref=f1e899]:
                  - button "View Daily Logs" [ref=f1e900] [cursor=pointer]
              - row [ref=f1e902]:
                - cell "SB Selamawit Beyene EM-095" [ref=f1e903]:
                  - generic [ref=f1e904]:
                    - generic [ref=f1e905]: SB
                    - generic [ref=f1e907]:
                      - paragraph [ref=f1e908]: Selamawit Beyene
                      - generic [ref=f1e909]: EM-095
                - cell "22.5" [ref=f1e910]
                - cell "17.5" [ref=f1e911]
                - cell "5" [ref=f1e912]
                - cell "0" [ref=f1e913]
                - cell "0/0" [ref=f1e915]
                - cell "No Flags" [ref=f1e917]
                - cell [ref=f1e919]:
                  - button "View Daily Logs" [ref=f1e920] [cursor=pointer]
              - row [ref=f1e922]:
                - cell "TB Tewele Brhane EM-112" [ref=f1e923]:
                  - generic [ref=f1e924]:
                    - generic [ref=f1e925]: TB
                    - generic [ref=f1e927]:
                      - paragraph [ref=f1e928]: Tewele Brhane
                      - generic [ref=f1e929]: EM-112
                - cell "22.5" [ref=f1e930]
                - cell "22" [ref=f1e931]
                - cell "0.5" [ref=f1e932]
                - cell "0" [ref=f1e933]
                - cell "0/0" [ref=f1e935]
                - cell "No Flags" [ref=f1e937]
                - cell [ref=f1e939]:
                  - button "View Daily Logs" [ref=f1e940] [cursor=pointer]
              - row [ref=f1e942]:
                - cell "DD Dame Daba EM-022" [ref=f1e943]:
                  - generic [ref=f1e944]:
                    - generic [ref=f1e945]: DD
                    - generic [ref=f1e947]:
                      - paragraph [ref=f1e948]: Dame Daba
                      - generic [ref=f1e949]: EM-022
                - cell "22.5" [ref=f1e950]
                - cell "0" [ref=f1e951]
                - cell "22.5" [ref=f1e952]
                - cell "0" [ref=f1e953]
                - cell "0/0" [ref=f1e955]
                - cell "No Flags" [ref=f1e957]
                - cell [ref=f1e959]:
                  - button "View Daily Logs" [ref=f1e960] [cursor=pointer]
          - list [ref=f1e962]:
            - listitem "Previous Page" [ref=f1e963]:
              - button [disabled] [ref=f1e964]:
                - img "left" [ref=f1e965]
            - listitem "1" [ref=f1e968] [cursor=pointer]
            - listitem "2" [ref=f1e970] [cursor=pointer]
            - listitem "3" [ref=f1e972] [cursor=pointer]
            - listitem "4" [ref=f1e974] [cursor=pointer]
            - listitem "Next Page" [ref=f1e976] [cursor=pointer]:
              - button [ref=f1e977]:
                - img "right" [ref=f1e978]
            - listitem [ref=f1e981]:
              - generic [ref=f1e982]:
                - generic "20 / page" [ref=f1e983]:
                  - text: 20 / page
                  - combobox "Page Size" [ref=f1e984]
                - img "down" [ref=f1e986]
  - button "Open Next.js Dev Tools" [ref=f1e994] [cursor=pointer]
  - alert [ref=f1e998]
```

# Test source

```ts
  85  | 
  86  |   test('weekend days show as WEEKEND status', async ({ page }) => {
  87  |     await openDailyLogsForEmployee(page, /samuel/i);
  88  |     const weekendRow = page
  89  |       .locator('.ant-drawer .ant-table-row')
  90  |       .filter({ hasText: /weekend/i })
  91  |       .first();
  92  |     await expect(weekendRow).toBeVisible({ timeout: 15_000 });
  93  |   });
  94  | 
  95  |   test('flagged days show correct flag chips', async ({ page }) => {
  96  |     await openDailyLogsForEmployee(page, /samuel/i);
  97  |     await expect(
  98  |       page
  99  |         .locator('.ant-drawer')
  100 |         .getByText(/missing clock out/i)
  101 |         .first(),
  102 |     ).toBeVisible({ timeout: 15_000 });
  103 |   });
  104 | 
  105 |   test('last export day (Aug 31) shows no MISSING_CLOCK_OUT flag', async ({
  106 |     page,
  107 |   }) => {
  108 |     await openDailyLogsForEmployee(page, /samuel/i);
  109 |     const aug31 = page
  110 |       .locator('.ant-drawer .ant-table-row')
  111 |       .filter({ hasText: /31/ })
  112 |       .first();
  113 |     await expect(aug31).toBeVisible({ timeout: 15_000 });
  114 |     const flagText = await aug31.innerText();
  115 |     expect(flagText.toLowerCase()).not.toMatch(/missing clock out/);
  116 |   });
  117 | 
  118 |   test('clock times show in local Ethiopia time not machine time', async ({
  119 |     page,
  120 |   }) => {
  121 |     await openDailyLogsForEmployee(page, /samuel/i);
  122 |     const drawer = page.locator('.ant-drawer');
  123 |     const times = await drawer.locator('td').allInnerTexts();
  124 |     const hasMorning = times.some((t) => /^0[6-9]:\d{2}$/.test(t.trim()));
  125 |     const hasMachineNoon = times.some((t) => /^1[2-4]:\d{2}$/.test(t.trim()));
  126 |     expect(hasMorning || !hasMachineNoon).toBeTruthy();
  127 |   });
  128 | 
  129 |   test('HR can correct a daily log entry', async ({ page }) => {
  130 |     await openDailyLogsForEmployee(page, /samuel/i);
  131 |     const correctBtn = page
  132 |       .locator('.ant-drawer')
  133 |       .getByRole('button', { name: /^correct$/i })
  134 |       .first();
  135 |     await correctBtn.click();
  136 | 
  137 |     await page.getByLabel(/corrected clock in/i).fill('08:30');
  138 |     await page.getByLabel(/corrected clock out/i).fill('17:30');
  139 |     await page
  140 |       .getByLabel(/correction note/i)
  141 |       .fill('Machine recorded wrong time');
  142 |     await page.getByRole('button', { name: /save correction/i }).click();
  143 | 
  144 |     await expect(page.getByText(/daily log corrected/i)).toBeVisible({
  145 |       timeout: 15_000,
  146 |     });
  147 |     await expect(
  148 |       page.locator('.ant-drawer').getByText('08:30').first(),
  149 |     ).toBeVisible();
  150 |   });
  151 | 
  152 |   test('correction note is required �?empty note shows error', async ({
  153 |     page,
  154 |   }) => {
  155 |     await openDailyLogsForEmployee(page, /samuel/i);
  156 |     await page
  157 |       .locator('.ant-drawer')
  158 |       .getByRole('button', { name: /^correct$/i })
  159 |       .first()
  160 |       .click();
  161 |     await page.getByRole('button', { name: /save correction/i }).click();
  162 |     await expect(
  163 |       page.getByText(/correction note is required/i),
  164 |     ).toBeVisible();
  165 |   });
  166 | 
  167 |   test('correction note minimum 10 characters enforced', async ({ page }) => {
  168 |     await openDailyLogsForEmployee(page, /samuel/i);
  169 |     await page
  170 |       .locator('.ant-drawer')
  171 |       .getByRole('button', { name: /^correct$/i })
  172 |       .first()
  173 |       .click();
  174 |     await page.getByLabel(/correction note/i).fill('too short');
  175 |     await page.getByRole('button', { name: /save correction/i }).click();
  176 |     await expect(
  177 |       page.locator('.ant-form-item-explain-error').first(),
  178 |     ).toBeVisible();
  179 |   });
  180 | 
  181 |   test('Mark as Reviewed button changes status to REVIEWED', async ({
  182 |     page,
  183 |   }) => {
  184 |     const markBtn = page.getByRole('button', { name: /mark as reviewed/i });
> 185 |     if (await markBtn.isEnabled()) {
      |                       ^ Error: locator.isEnabled: Test timeout of 45000ms exceeded.
  186 |       await markBtn.click();
  187 |     }
  188 |     await expect(
  189 |       page.getByText(/reviewed �?ready for approval|reviewed/i).first(),
  190 |     ).toBeVisible({ timeout: 20_000 });
  191 |   });
  192 | });
  193 | 
```