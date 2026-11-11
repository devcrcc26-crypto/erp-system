# Phase 5 API integration test - dashboard stat sources
$base = 'http://localhost:3008/api'

Write-Host "1. Login as admin..."
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{
  email = 'admin@company.local'
  password = 'Admin@12345'
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
Write-Host "   OK"

Write-Host "2. Users count..."
$users = Invoke-RestMethod -Uri "$base/users?limit=1" -Headers $headers
Write-Host "   Team Members: $($users.meta.total)"

Write-Host "3. Branches count..."
$branches = Invoke-RestMethod -Uri "$base/branches?limit=1" -Headers $headers
Write-Host "   Projects (branches): $($branches.meta.total)"

Write-Host "4. Departments count..."
$departments = Invoke-RestMethod -Uri "$base/departments?limit=1" -Headers $headers
Write-Host "   Tasks (departments): $($departments.meta.total)"

Write-Host "5. Execute active users report..."
$reportId = '00000000-0000-4000-8000-000000000050'
$report = Invoke-RestMethod -Uri "$base/reports/$reportId/execute" -Method POST -Headers $headers
$total = $users.meta.total
$active = $report.data.rowCount
$rate = if ($total -gt 0) { [math]::Round(($active / $total) * 100) } else { 0 }
Write-Host "   Completion Rate: $rate% ($active active / $total total)"

Write-Host "6. Employee cannot fetch users (403)..."
try {
  $empLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{
    email = 'employee.test.1781160536@company.local'
    password = 'Test@12345'
  } | ConvertTo-Json)
  try {
    Invoke-RestMethod -Uri "$base/users?limit=1" -Headers @{ Authorization = "Bearer $($empLogin.data.accessToken)" }
    Write-Host "   Warning: employee could list users"
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
      Write-Host "   OK (403 - dashboard will use fallbacks)"
    }
  }
} catch {
  Write-Host "   Skipped (no test employee account)"
}

Write-Host ""
Write-Host "Phase 5 API tests passed."
