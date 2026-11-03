$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$monitorPort = if ($env:HASIMIO_TV_MONITOR_PORT) { [int]$env:HASIMIO_TV_MONITOR_PORT } else { 11477 }
$monitorUrl = "http://127.0.0.1:$monitorPort"
$ready = $false
try { $ready = (Invoke-RestMethod "$monitorUrl/health" -TimeoutSec 2).app -eq 'hasimio-tv-monitor' } catch {}
if (-not $ready) {
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $logDirectory = Join-Path $projectRoot '.cache\tv-monitor'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $monitorScript = Join-Path $PSScriptRoot 'tv-monitor.mjs'
    Start-Process -FilePath $nodeCommand -ArgumentList @('"' + $monitorScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'console.log') -RedirectStandardError (Join-Path $logDirectory 'error.log') | Out-Null
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Milliseconds 300
        try { $ready = (Invoke-RestMethod "$monitorUrl/health" -TimeoutSec 1).app -eq 'hasimio-tv-monitor' } catch {}
        if ($ready) { break }
    }
    if (-not $ready) { throw "The TV monitor could not start. See $logDirectory\error.log." }
}
Start-Process -FilePath $monitorUrl
