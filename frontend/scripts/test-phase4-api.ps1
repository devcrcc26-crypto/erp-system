# Phase 4 API integration test - role list, permissions matrix, HR Officer grant
$base = 'http://localhost:3008/api'

Write-Host "1. Login as admin..."
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body (@{
  email = 'admin@company.local'
  password = 'Admin@12345'
} | ConvertTo-Json)
$token = $login.data.accessToken
$headers = @{ Authorization = "Bearer $token" }
Write-Host "   OK"

Write-Host "2. List roles..."
$roles = Invoke-RestMethod -Uri "$base/roles?limit=100" -Headers $headers
$hrRole = $roles.data | Where-Object { $_.name -eq 'HR Officer' } | Select-Object -First 1
if (-not $hrRole) { throw 'HR Officer role not found' }
Write-Host "   OK"

Write-Host "3. List permissions catalog..."
$permissions = Invoke-RestMethod -Uri "$base/permissions" -Headers $headers
$userPerms = $permissions.data | Where-Object { $_.module -eq 'users' }
if ($userPerms.Count -lt 3) { throw 'Expected users permissions in catalog' }
Write-Host "   OK ($($permissions.data.Count) permissions)"

Write-Host "4. Get HR Officer role detail..."
$hrDetail = Invoke-RestMethod -Uri "$base/roles/$($hrRole.id)" -Headers $headers
Write-Host "   OK ($($hrDetail.data.rolePermissions.Count) assignments before update)"

Write-Host "5. Grant users view/create/edit to HR Officer..."
$payload = @()
foreach ($perm in $userPerms) {
  if ($perm.action -in @('view','create','edit')) {
    $item = @{
      permissionId = $perm.id
      canView = $false
      canCreate = $false
      canEdit = $false
      canDelete = $false
      canApprove = $false
      canExport = $false
    }
    switch ($perm.action) {
      'view' { $item.canView = $true }
      'create' { $item.canCreate = $true }
      'edit' { $item.canEdit = $true }
    }
    $payload += $item
  }
}
$updated = Invoke-RestMethod -Uri "$base/roles/$($hrRole.id)/permissions" -Method PUT -Headers $headers -ContentType 'application/json' -Body (@{ permissions = $payload } | ConvertTo-Json -Depth 5)
$granted = ($updated.data.rolePermissions | Where-Object { $_.permission.module -eq 'users' }).Count
if ($granted -lt 3) { throw "Expected 3 users permissions, got $granted" }
Write-Host "   OK ($granted users permissions granted)"

Write-Host "6. Verify HR user list access would work (probe users endpoint as admin still)..."
$users = Invoke-RestMethod -Uri "$base/users?limit=1" -Headers $headers
Write-Host "   OK"

Write-Host ""
Write-Host "Phase 4 API tests passed."
