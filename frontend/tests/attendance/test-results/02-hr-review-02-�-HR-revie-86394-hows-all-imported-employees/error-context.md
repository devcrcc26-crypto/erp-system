# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-hr-review.spec.ts >> 02 �?HR review page >> employee table shows all imported employees
- Location: tests\attendance\02-hr-review.spec.ts:40:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 20
Received:   20
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
            - link "Approvals" [ref=f1e385] [cursor=pointer]:
              - /url: /approvals
          - listitem [ref=f1e391]:
            - link "My Profile" [ref=f1e392] [cursor=pointer]:
              - /url: /profile
          - listitem [ref=f1e399]:
            - link "Settings" [ref=f1e400] [cursor=pointer]:
              - /url: /settings
        - button "Collapse sidebar" [ref=f1e407] [cursor=pointer]
    - main [ref=f1e413]:
      - generic [ref=f1e414]:
        - generic [ref=f1e415]:
          - heading "Human Resources" [level=1] [ref=f1e418]
          - generic [ref=f1e420]:
            - button "Switch to 中文" [ref=f1e422] [cursor=pointer]:
              - img "global" [ref=f1e424]
              - generic [ref=f1e427]: EN
            - button "Open notifications" [ref=f1e428]:
              - generic [ref=f1e429]:
                - img "bell" [ref=f1e430]
                - superscript [ref=f1e433]:
                  - generic [ref=f1e434]:
                    - generic [ref=f1e435]: "3"
                    - generic [ref=f1e436]: "9"
            - button "Open profile" [ref=f1e437]:
              - generic [ref=f1e438]: J
              - generic [ref=f1e440]:
                - paragraph [ref=f1e441]: Jinxia Dong (董锦霞)
                - paragraph [ref=f1e442]: HR Officer
        - navigation "Breadcrumb" [ref=f1e444]:
          - navigation [ref=f1e445]:
            - list [ref=f1e446]:
              - listitem [ref=f1e447]:
                - link "Dashboard" [ref=f1e449] [cursor=pointer]:
                  - /url: /
              - listitem [ref=f1e455]: /
              - listitem [ref=f1e456]:
                - generic [ref=f1e457]: Human Resources
              - listitem [ref=f1e458]: /
              - listitem [ref=f1e459]:
                - generic [ref=f1e460]: Human Resources
      - generic [ref=f1e463]:
        - generic [ref=f1e464]:
          - link "Attendance" [ref=f1e465] [cursor=pointer]:
            - /url: /hr/attendance
          - generic [ref=f1e466]: /
          - generic [ref=f1e467]: Review August 2026
        - generic [ref=f1e470]:
          - button "Back" [ref=f1e472] [cursor=pointer]:
            - img "arrow-left" [ref=f1e474]
          - heading "Review August 2026" [level=3] [ref=f1e478]
        - alert [ref=f1e479]:
          - img "exclamation-circle" [ref=f1e481]
          - generic [ref=f1e484]: No monthly approval record for this period. Re-import attendance to create one.
        - generic [ref=f1e486]:
          - generic [ref=f1e487]:
            - img "team" [ref=f1e489]
            - generic [ref=f1e492]:
              - paragraph [ref=f1e493]: Total Employees
              - paragraph [ref=f1e494]: "65"
          - generic [ref=f1e495]:
            - img "warning" [ref=f1e497]
            - generic [ref=f1e500]:
              - paragraph [ref=f1e501]: Employees with Flags
              - paragraph [ref=f1e502]: "0"
          - generic [ref=f1e503]:
            - img "warning" [ref=f1e505]
            - generic [ref=f1e508]:
              - paragraph [ref=f1e509]: Total Flagged Days
              - paragraph [ref=f1e510]: "0"
          - generic [ref=f1e511]:
            - img "check-circle" [ref=f1e513]
            - generic [ref=f1e517]:
              - paragraph [ref=f1e518]: Resolved Flags
              - paragraph [ref=f1e519]: "2"
        - generic [ref=f1e525]:
          - table [ref=f1e529]:
            - rowgroup [ref=f1e539]:
              - row [ref=f1e540]:
                - columnheader "Employee" [ref=f1e541]
                - columnheader "Scheduled Days" [ref=f1e542]
                - columnheader "Present Days" [ref=f1e543]
                - columnheader "Absent Days" [ref=f1e544]
                - columnheader "Flagged Days" [ref=f1e545]
                - columnheader "Resolved" [ref=f1e546]
                - columnheader "Status" [ref=f1e547]
                - columnheader "Actions" [ref=f1e548]
            - rowgroup [ref=f1e549]:
              - row [ref=f1e550]:
                - cell [ref=f1e551]
                - cell [ref=f1e552]
                - cell [ref=f1e553]
                - cell [ref=f1e554]
                - cell [ref=f1e555]
                - cell [ref=f1e556]
                - cell [ref=f1e557]
                - cell [ref=f1e558]
              - row [ref=f1e559]:
                - cell "AA Abenezer Abadi EM-003" [ref=f1e560]:
                  - generic [ref=f1e561]:
                    - generic [ref=f1e562]: AA
                    - generic [ref=f1e564]:
                      - paragraph [ref=f1e565]: Abenezer Abadi
                      - generic [ref=f1e566]: EM-003
                - cell "22.5" [ref=f1e567]
                - cell "20" [ref=f1e568]
                - cell "2.5" [ref=f1e569]
                - cell "0" [ref=f1e570]
                - cell "0/0" [ref=f1e572]
                - cell "No Flags" [ref=f1e574]
                - cell [ref=f1e576]:
                  - button "View Daily Logs" [ref=f1e577] [cursor=pointer]
              - row [ref=f1e579]:
                - cell "EA Eskender Abebaw EM-030" [ref=f1e580]:
                  - generic [ref=f1e581]:
                    - generic [ref=f1e582]: EA
                    - generic [ref=f1e584]:
                      - paragraph [ref=f1e585]: Eskender Abebaw
                      - generic [ref=f1e586]: EM-030
                - cell "22.5" [ref=f1e587]
                - cell "22.5" [ref=f1e588]
                - cell "0" [ref=f1e589]
                - cell "0" [ref=f1e590]
                - cell "0/0" [ref=f1e592]
                - cell "No Flags" [ref=f1e594]
                - cell [ref=f1e596]:
                  - button "View Daily Logs" [ref=f1e597] [cursor=pointer]
              - row [ref=f1e599]:
                - cell "HA Helen Abebaw EM-045" [ref=f1e600]:
                  - generic [ref=f1e601]:
                    - generic [ref=f1e602]: HA
                    - generic [ref=f1e604]:
                      - paragraph [ref=f1e605]: Helen Abebaw
                      - generic [ref=f1e606]: EM-045
                - cell "22.5" [ref=f1e607]
                - cell "21" [ref=f1e608]
                - cell "1.5" [ref=f1e609]
                - cell "0" [ref=f1e610]
                - cell "0/0" [ref=f1e612]
                - cell "No Flags" [ref=f1e614]
                - cell [ref=f1e616]:
                  - button "View Daily Logs" [ref=f1e617] [cursor=pointer]
              - row [ref=f1e619]:
                - cell "SA Sony Aboye EM-103" [ref=f1e620]:
                  - generic [ref=f1e621]:
                    - generic [ref=f1e622]: SA
                    - generic [ref=f1e624]:
                      - paragraph [ref=f1e625]: Sony Aboye
                      - generic [ref=f1e626]: EM-103
                - cell "22.5" [ref=f1e627]
                - cell "1" [ref=f1e628]
                - cell "21.5" [ref=f1e629]
                - cell "0" [ref=f1e630]
                - cell "0/0" [ref=f1e632]
                - cell "No Flags" [ref=f1e634]
                - cell [ref=f1e636]:
                  - button "View Daily Logs" [ref=f1e637] [cursor=pointer]
              - row [ref=f1e639]:
                - cell "MA Mestawet Adam EM-068" [ref=f1e640]:
                  - generic [ref=f1e641]:
                    - generic [ref=f1e642]: MA
                    - generic [ref=f1e644]:
                      - paragraph [ref=f1e645]: Mestawet Adam
                      - generic [ref=f1e646]: EM-068
                - cell "22.5" [ref=f1e647]
                - cell "21.5" [ref=f1e648]
                - cell "1" [ref=f1e649]
                - cell "0" [ref=f1e650]
                - cell "0/0" [ref=f1e652]
                - cell "No Flags" [ref=f1e654]
                - cell [ref=f1e656]:
                  - button "View Daily Logs" [ref=f1e657] [cursor=pointer]
              - row [ref=f1e659]:
                - cell "SA Samrawit Adane EM-091" [ref=f1e660]:
                  - generic [ref=f1e661]:
                    - generic [ref=f1e662]: SA
                    - generic [ref=f1e664]:
                      - paragraph [ref=f1e665]: Samrawit Adane
                      - generic [ref=f1e666]: EM-091
                - cell "22.5" [ref=f1e667]
                - cell "20.5" [ref=f1e668]
                - cell "2" [ref=f1e669]
                - cell "0" [ref=f1e670]
                - cell "0/0" [ref=f1e672]
                - cell "No Flags" [ref=f1e674]
                - cell [ref=f1e676]:
                  - button "View Daily Logs" [ref=f1e677] [cursor=pointer]
              - row [ref=f1e679]:
                - cell "MA Mihret Alemayehu EM-069" [ref=f1e680]:
                  - generic [ref=f1e681]:
                    - generic [ref=f1e682]: MA
                    - generic [ref=f1e684]:
                      - paragraph [ref=f1e685]: Mihret Alemayehu
                      - generic [ref=f1e686]: EM-069
                - cell "22.5" [ref=f1e687]
                - cell "1" [ref=f1e688]
                - cell "21.5" [ref=f1e689]
                - cell "0" [ref=f1e690]
                - cell "0/0" [ref=f1e692]
                - cell "No Flags" [ref=f1e694]
                - cell [ref=f1e696]:
                  - button "View Daily Logs" [ref=f1e697] [cursor=pointer]
              - row [ref=f1e699]:
                - cell "NA Nahom Alemayehu EM-078" [ref=f1e700]:
                  - generic [ref=f1e701]:
                    - generic [ref=f1e702]: NA
                    - generic [ref=f1e704]:
                      - paragraph [ref=f1e705]: Nahom Alemayehu
                      - generic [ref=f1e706]: EM-078
                - cell "22.5" [ref=f1e707]
                - cell "22.5" [ref=f1e708]
                - cell "0" [ref=f1e709]
                - cell "0" [ref=f1e710]
                - cell "0/0" [ref=f1e712]
                - cell "No Flags" [ref=f1e714]
                - cell [ref=f1e716]:
                  - button "View Daily Logs" [ref=f1e717] [cursor=pointer]
              - row [ref=f1e719]:
                - cell "NA Netsihit Alemayehu EM-086" [ref=f1e720]:
                  - generic [ref=f1e721]:
                    - generic [ref=f1e722]: NA
                    - generic [ref=f1e724]:
                      - paragraph [ref=f1e725]: Netsihit Alemayehu
                      - generic [ref=f1e726]: EM-086
                - cell "22.5" [ref=f1e727]
                - cell "20.5" [ref=f1e728]
                - cell "2" [ref=f1e729]
                - cell "0" [ref=f1e730]
                - cell "0/0" [ref=f1e732]
                - cell "No Flags" [ref=f1e734]
                - cell [ref=f1e736]:
                  - button "View Daily Logs" [ref=f1e737] [cursor=pointer]
              - row [ref=f1e739]:
                - cell "EA Eden Alemu EM-027" [ref=f1e740]:
                  - generic [ref=f1e741]:
                    - generic [ref=f1e742]: EA
                    - generic [ref=f1e744]:
                      - paragraph [ref=f1e745]: Eden Alemu
                      - generic [ref=f1e746]: EM-027
                - cell "22.5" [ref=f1e747]
                - cell "20" [ref=f1e748]
                - cell "2.5" [ref=f1e749]
                - cell "0" [ref=f1e750]
                - cell "0/0" [ref=f1e752]
                - cell "No Flags" [ref=f1e754]
                - cell [ref=f1e756]:
                  - button "View Daily Logs" [ref=f1e757] [cursor=pointer]
              - row [ref=f1e759]:
                - cell "BA Biruk Alemu EM-016" [ref=f1e760]:
                  - generic [ref=f1e761]:
                    - generic [ref=f1e762]: BA
                    - generic [ref=f1e764]:
                      - paragraph [ref=f1e765]: Biruk Alemu
                      - generic [ref=f1e766]: EM-016
                - cell "22.5" [ref=f1e767]
                - cell "15" [ref=f1e768]
                - cell "7.5" [ref=f1e769]
                - cell "0" [ref=f1e770]
                - cell "0/0" [ref=f1e772]
                - cell "No Flags" [ref=f1e774]
                - cell [ref=f1e776]:
                  - button "View Daily Logs" [ref=f1e777] [cursor=pointer]
              - row [ref=f1e779]:
                - cell "NA Natnael Argaw EM-081" [ref=f1e780]:
                  - generic [ref=f1e781]:
                    - generic [ref=f1e782]: NA
                    - generic [ref=f1e784]:
                      - paragraph [ref=f1e785]: Natnael Argaw
                      - generic [ref=f1e786]: EM-081
                - cell "22.5" [ref=f1e787]
                - cell "21.5" [ref=f1e788]
                - cell "1" [ref=f1e789]
                - cell "0" [ref=f1e790]
                - cell "0/0" [ref=f1e792]
                - cell "No Flags" [ref=f1e794]
                - cell [ref=f1e796]:
                  - button "View Daily Logs" [ref=f1e797] [cursor=pointer]
              - row [ref=f1e799]:
                - cell "MA Mekides Asfaw EM-066" [ref=f1e800]:
                  - generic [ref=f1e801]:
                    - generic [ref=f1e802]: MA
                    - generic [ref=f1e804]:
                      - paragraph [ref=f1e805]: Mekides Asfaw
                      - generic [ref=f1e806]: EM-066
                - cell "22.5" [ref=f1e807]
                - cell "2.5" [ref=f1e808]
                - cell "20" [ref=f1e809]
                - cell "0" [ref=f1e810]
                - cell "0/0" [ref=f1e812]
                - cell "No Flags" [ref=f1e814]
                - cell [ref=f1e816]:
                  - button "View Daily Logs" [ref=f1e817] [cursor=pointer]
              - row [ref=f1e819]:
                - cell "YA Yisak Assefa EM-129" [ref=f1e820]:
                  - generic [ref=f1e821]:
                    - generic [ref=f1e822]: YA
                    - generic [ref=f1e824]:
                      - paragraph [ref=f1e825]: Yisak Assefa
                      - generic [ref=f1e826]: EM-129
                - cell "22.5" [ref=f1e827]
                - cell "22.5" [ref=f1e828]
                - cell "0" [ref=f1e829]
                - cell "0" [ref=f1e830]
                - cell "0/0" [ref=f1e832]
                - cell "No Flags" [ref=f1e834]
                - cell [ref=f1e836]:
                  - button "View Daily Logs" [ref=f1e837] [cursor=pointer]
              - row [ref=f1e839]:
                - cell "SB Shimelis Bacha EM-098" [ref=f1e840]:
                  - generic [ref=f1e841]:
                    - generic [ref=f1e842]: SB
                    - generic [ref=f1e844]:
                      - paragraph [ref=f1e845]: Shimelis Bacha
                      - generic [ref=f1e846]: EM-098
                - cell "22.5" [ref=f1e847]
                - cell "0" [ref=f1e848]
                - cell "22.5" [ref=f1e849]
                - cell "0" [ref=f1e850]
                - cell "0/0" [ref=f1e852]
                - cell "No Flags" [ref=f1e854]
                - cell [ref=f1e856]:
                  - button "View Daily Logs" [ref=f1e857] [cursor=pointer]
              - row [ref=f1e859]:
                - cell "MB Medhanit Berhanu EM-064" [ref=f1e860]:
                  - generic [ref=f1e861]:
                    - generic [ref=f1e862]: MB
                    - generic [ref=f1e864]:
                      - paragraph [ref=f1e865]: Medhanit Berhanu
                      - generic [ref=f1e866]: EM-064
                - cell "22.5" [ref=f1e867]
                - cell "0" [ref=f1e868]
                - cell "22.5" [ref=f1e869]
                - cell "0" [ref=f1e870]
                - cell "0/0" [ref=f1e872]
                - cell "No Flags" [ref=f1e874]
                - cell [ref=f1e876]:
                  - button "View Daily Logs" [ref=f1e877] [cursor=pointer]
              - row [ref=f1e879]:
                - cell "MB Mizen Beyene EM-073" [ref=f1e880]:
                  - generic [ref=f1e881]:
                    - generic [ref=f1e882]: MB
                    - generic [ref=f1e884]:
                      - paragraph [ref=f1e885]: Mizen Beyene
                      - generic [ref=f1e886]: EM-073
                - cell "22.5" [ref=f1e887]
                - cell "0" [ref=f1e888]
                - cell "22.5" [ref=f1e889]
                - cell "0" [ref=f1e890]
                - cell "0/0" [ref=f1e892]
                - cell "No Flags" [ref=f1e894]
                - cell [ref=f1e896]:
                  - button "View Daily Logs" [ref=f1e897] [cursor=pointer]
              - row [ref=f1e899]:
                - cell "SB Selamawit Beyene EM-095" [ref=f1e900]:
                  - generic [ref=f1e901]:
                    - generic [ref=f1e902]: SB
                    - generic [ref=f1e904]:
                      - paragraph [ref=f1e905]: Selamawit Beyene
                      - generic [ref=f1e906]: EM-095
                - cell "22.5" [ref=f1e907]
                - cell "17.5" [ref=f1e908]
                - cell "5" [ref=f1e909]
                - cell "0" [ref=f1e910]
                - cell "0/0" [ref=f1e912]
                - cell "No Flags" [ref=f1e914]
                - cell [ref=f1e916]:
                  - button "View Daily Logs" [ref=f1e917] [cursor=pointer]
              - row [ref=f1e919]:
                - cell "TB Tewele Brhane EM-112" [ref=f1e920]:
                  - generic [ref=f1e921]:
                    - generic [ref=f1e922]: TB
                    - generic [ref=f1e924]:
                      - paragraph [ref=f1e925]: Tewele Brhane
                      - generic [ref=f1e926]: EM-112
                - cell "22.5" [ref=f1e927]
                - cell "22" [ref=f1e928]
                - cell "0.5" [ref=f1e929]
                - cell "0" [ref=f1e930]
                - cell "0/0" [ref=f1e932]
                - cell "No Flags" [ref=f1e934]
                - cell [ref=f1e936]:
                  - button "View Daily Logs" [ref=f1e937] [cursor=pointer]
              - row [ref=f1e939]:
                - cell "DD Dame Daba EM-022" [ref=f1e940]:
                  - generic [ref=f1e941]:
                    - generic [ref=f1e942]: DD
                    - generic [ref=f1e944]:
                      - paragraph [ref=f1e945]: Dame Daba
                      - generic [ref=f1e946]: EM-022
                - cell "22.5" [ref=f1e947]
                - cell "0" [ref=f1e948]
                - cell "22.5" [ref=f1e949]
                - cell "0" [ref=f1e950]
                - cell "0/0" [ref=f1e952]
                - cell "No Flags" [ref=f1e954]
                - cell [ref=f1e956]:
                  - button "View Daily Logs" [ref=f1e957] [cursor=pointer]
          - list [ref=f1e959]:
            - listitem "Previous Page" [ref=f1e960]:
              - button [disabled] [ref=f1e961]:
                - img "left" [ref=f1e962]
            - listitem "1" [ref=f1e965] [cursor=pointer]
            - listitem "2" [ref=f1e967] [cursor=pointer]
            - listitem "3" [ref=f1e969] [cursor=pointer]
            - listitem "4" [ref=f1e971] [cursor=pointer]
            - listitem "Next Page" [ref=f1e973] [cursor=pointer]:
              - button [ref=f1e974]:
                - img "right" [ref=f1e975]
            - listitem [ref=f1e978]:
              - generic [ref=f1e979]:
                - generic "20 / page" [ref=f1e980]:
                  - text: 20 / page
                  - combobox "Page Size" [ref=f1e981]
                - img "down" [ref=f1e983]
  - button "Open Next.js Dev Tools" [ref=f1e991] [cursor=pointer]
  - alert [ref=f1e995]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { loginAs } from './helpers/auth';
  3   | import {
  4   |   REVIEW_URL,
  5   |   openDailyLogsForEmployee,
  6   | } from './helpers/attendance.helpers';
  7   | 
  8   | test.describe('02 �?HR review page', () => {
  9   |   test.beforeEach(async ({ page }) => {
  10  |     await loginAs(
  11  |       page,
  12  |       'jinxia.dong@company.local',
  13  |       'Admin@12345',
  14  |       REVIEW_URL,
  15  |     );
  16  |     if (!page.url().includes('/hr/attendance/review/')) {
  17  |       await page.goto(REVIEW_URL);
  18  |     }
  19  |     await expect(page.getByText(/review august 2026|august 2026|pending review|reviewed|approved/i).first()).toBeVisible({
  20  |       timeout: 30_000,
  21  |     });
  22  |   });
  23  | 
  24  |   test('review page loads at /hr/attendance/review/8/2026', async ({ page }) => {
  25  |     await expect(page).toHaveURL(/\/hr\/attendance\/review\/8\/2026/);
  26  |   });
  27  | 
  28  |   test('status banner shows PENDING_REVIEW', async ({ page }) => {
  29  |     await expect(page.getByText(/pending review/i).first()).toBeVisible();
  30  |   });
  31  | 
  32  |   test('summary cards show correct employee and flagged day counts', async ({
  33  |     page,
  34  |   }) => {
  35  |     await expect(page.getByText(/total employees/i)).toBeVisible();
  36  |     await expect(page.getByText(/employees with flags/i)).toBeVisible();
  37  |     await expect(page.getByText(/total flagged days/i)).toBeVisible();
  38  |   });
  39  | 
  40  |   test('employee table shows all imported employees', async ({ page }) => {
  41  |     const rows = page.locator('.ant-table-tbody .ant-table-row');
  42  |     await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  43  |     const count = await rows.count();
> 44  |     expect(count).toBeGreaterThan(20);
      |                   ^ Error: expect(received).toBeGreaterThan(expected)
  45  |   });
  46  | 
  47  |   test('employees with flagged days show amber badge', async ({ page }) => {
  48  |     await expect(
  49  |       page.getByText(/has flags/i).first(),
  50  |     ).toBeVisible({ timeout: 20_000 });
  51  |   });
  52  | 
  53  |   test('employees with no flagged days show green badge', async ({ page }) => {
  54  |     await expect(
  55  |       page.getByText(/no flags/i).first(),
  56  |     ).toBeVisible({ timeout: 20_000 });
  57  |   });
  58  | 
  59  |   test('View Daily Logs button opens drawer for an employee', async ({
  60  |     page,
  61  |   }) => {
  62  |     await page.getByRole('button', { name: /view daily logs/i }).first().click();
  63  |     await expect(page.getByText(/daily logs/i).first()).toBeVisible({
  64  |       timeout: 15_000,
  65  |     });
  66  |   });
  67  | 
  68  |   test('daily logs drawer shows all days for the month', async ({ page }) => {
  69  |     await page.getByRole('button', { name: /view daily logs/i }).first().click();
  70  |     const dayRows = page.locator('.ant-drawer .ant-table-row');
  71  |     await expect(dayRows.first()).toBeVisible({ timeout: 15_000 });
  72  |     const count = await dayRows.count();
  73  |     expect(count).toBeGreaterThanOrEqual(28);
  74  |   });
  75  | 
  76  |   test('holidays show correctly �?Aug 25 shows as HOLIDAY', async ({ page }) => {
  77  |     await openDailyLogsForEmployee(page, /samuel/i);
  78  |     const holidayRow = page
  79  |       .locator('.ant-drawer .ant-table-row')
  80  |       .filter({ hasText: /25/ })
  81  |       .filter({ hasText: /holiday/i });
  82  |     await expect(holidayRow.first()).toBeVisible({ timeout: 15_000 });
  83  |     await expect(holidayRow.first().getByText(/missing clock/i)).toHaveCount(0);
  84  |   });
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
```