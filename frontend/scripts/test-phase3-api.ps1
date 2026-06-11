# Phase 3 API integration test - user create + role assign flow
$base = 'http://localhost:3008/api'
$testEmail = "employee.test.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@company.local"

Write-Host "1. Login as admin..."
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{
  email = 'admin@company.local'
  password = 'Admin@12345'
} | ConvertTo-Json)
$token = $login.data.accessToken
$headers = @{ Authorization = "Bearer $token" }
Write-Host "   OK"

Write-Host "2. List users..."
$users = Invoke-RestMethod -Uri "$base/users?limit=5" -Headers $headers
if (-not $users.success) { throw 'List users failed' }
Write-Host "   OK ($($users.meta.total) users)"

Write-Host "3. List roles..."
$roles = Invoke-RestMethod -Uri "$base/roles?limit=100" -Headers $headers
$employeeRole = $roles.data | Where-Object { $_.name -eq 'Employee' } | Select-Object -First 1
if (-not $employeeRole) { throw 'Employee role not found' }
Write-Host "   OK (Employee role: $($employeeRole.id))"

Write-Host "4. Create user $testEmail..."
$created = Invoke-RestMethod -Uri "$base/users" -Method POST -Headers $headers -ContentType 'application/json' -Body (@{
  email = $testEmail
  firstName = 'Test'
  lastName = 'Employee'
  password = 'Test@12345'
  isActive = $true
} | ConvertTo-Json)
$userId = $created.data.id
Write-Host "   OK (id: $userId)"

Write-Host "5. Assign Employee role..."
Invoke-RestMethod -Uri "$base/users/$userId/roles" -Method POST -Headers $headers -ContentType 'application/json' -Body (@{
  roleId = $employeeRole.id
} | ConvertTo-Json) | Out-Null
Write-Host "   OK"

Write-Host "6. Verify user detail has role..."
$detail = Invoke-RestMethod -Uri "$base/users/$userId" -Headers $headers
$roleNames = ($detail.data.userRoles | ForEach-Object { $_.role.name }) -join ', '
if ($roleNames -notlike '*Employee*') { throw "Expected Employee role, got: $roleNames" }
Write-Host "   OK (roles: $roleNames)"

Write-Host "7. Test employee login..."
$empLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{
  email = $testEmail
  password = 'Test@12345'
} | ConvertTo-Json)
if (-not $empLogin.data.accessToken) { throw 'Employee login failed' }
Write-Host "   OK"

Write-Host "8. Employee cannot list users (403 expected)..."
try {
  Invoke-RestMethod -Uri "$base/users?limit=1" -Headers @{ Authorization = "Bearer $($empLogin.data.accessToken)" }
  throw 'Employee should not list users'
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw $_ }
  Write-Host "   OK (403 Forbidden)"
}

Write-Host ""
Write-Host "Phase 3 API tests passed."
