$ErrorActionPreference = 'Stop'
$resultPath = Join-Path $PSScriptRoot '../.cache/lan-firewall-result.json'
try {
    $ruleName = 'Hasimio-Home-LAN-5176'
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Hasimio Home LAN TCP 5176' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5176 -LocalAddress 192.168.100.10 -RemoteAddress 192.168.100.0/24 -Program 'C:\Program Files\nodejs\node.exe' -InterfaceAlias Ethernet -Profile Private,Public -EdgeTraversalPolicy Block | Out-Null
    }
    @{ success = $true; port = 5176; address = '192.168.100.10'; subnet = '192.168.100.0/24' } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
} catch {
    @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath $resultPath
    throw
}
