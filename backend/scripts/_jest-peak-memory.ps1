# Measures peak WorkingSet64 (MB) of node.exe while Jest runs. Usage: .\scripts\_jest-peak-memory.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$jestArgs = @('jest', '--no-coverage')
if ($args.Count -gt 0) {
  $jestArgs = $args
}

$peakMb = 0
$nodeArgs = @('node_modules/jest/bin/jest.js') + $jestArgs
$proc = Start-Process -FilePath 'node' -ArgumentList $nodeArgs -WorkingDirectory (Get-Location) -PassThru -NoNewWindow
try {
  while (-not $proc.HasExited) {
    Start-Sleep -Milliseconds 400
    $nodes = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($nodes) {
      $max = ($nodes | Measure-Object -Property WorkingSet64 -Maximum).Maximum
      if ($max -gt 0) {
        $mb = [math]::Round($max / 1MB, 0)
        if ($mb -gt $peakMb) { $peakMb = $mb }
      }
    }
  }
} finally {
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}

$exit = $proc.ExitCode
Write-Output "JEST_EXIT=$exit"
Write-Output "PEAK_NODE_WORKING_SET_MB=$peakMb"
exit $exit
