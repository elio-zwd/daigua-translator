[CmdletBinding()]
param([string]$CodePath = 'code.cmd', [string]$VsixPath = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$taskDirectory = Join-Path ([IO.Path]::GetTempPath()) ('daigua-host-' + [guid]::NewGuid().ToString('N'))
$testWorkspace = Join-Path $taskDirectory 'workspace'
$settingsDirectory = Join-Path $testWorkspace '.vscode'
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
'{"daiguaTranslate.bingEnabled":false,"daiguaTranslate.hoverFallback":"off","update.mode":"none","extensions.autoUpdate":false,"telemetry.telemetryLevel":"off"}' | Set-Content -LiteralPath (Join-Path $settingsDirectory 'settings.json') -Encoding utf8
$profileSettings = Join-Path $taskDirectory 'profile/User'
New-Item -ItemType Directory -Path $profileSettings -Force | Out-Null
'{"update.mode":"none","extensions.autoUpdate":false,"telemetry.telemetryLevel":"off","chat.disableAIFeatures":true}' | Set-Content -LiteralPath (Join-Path $profileSettings 'settings.json') -Encoding utf8
$reportFile = Join-Path $taskDirectory 'report.json'
# Receive evidence over loopback so enterprise per-application file encryption cannot
# make a report written by Code unreadable by the invoking PowerShell process.
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$oldPort = $env:DAIGUA_HOST_PORT
$env:DAIGUA_HOST_PORT = [string]$listener.LocalEndpoint.Port
try {
    $developmentPath = Join-Path $repositoryRoot 'plugin'
    $extensionFlags = @('--disable-extensions')
    if ($VsixPath) {
        $packagePath = (Resolve-Path -LiteralPath $VsixPath).Path
        & $CodePath '--user-data-dir' (Join-Path $taskDirectory 'profile') '--extensions-dir' (Join-Path $taskDirectory 'extensions') `
            '--install-extension' $packagePath '--force'
        if ($LASTEXITCODE -ne 0) { throw "VSIX installation failed. Inspect $taskDirectory" }
        # Develop only a minimal test driver, so the product's manifest is scanned as an installed extension.
        $developmentPath = Join-Path $taskDirectory 'driver'
        New-Item -ItemType Directory -Path $developmentPath -Force | Out-Null
        '{"name":"daigua-host-driver","publisher":"daigua-tests","version":"0.0.0","engines":{"vscode":"^1.85.0"},"main":"./index.js"}' | Set-Content -LiteralPath (Join-Path $developmentPath 'package.json') -Encoding utf8
        'exports.activate = function () {};' | Set-Content -LiteralPath (Join-Path $developmentPath 'index.js') -Encoding utf8
        $extensionFlags = @()
    }
    # --extensionTestsPath closes the isolated host after run(); existing profiles are not used.
    & $CodePath '--new-window' '--wait' @extensionFlags '--disable-workspace-trust' '--skip-welcome' '--skip-release-notes' `
        '--user-data-dir' (Join-Path $taskDirectory 'profile') '--extensions-dir' (Join-Path $taskDirectory 'extensions') `
        "--extensionDevelopmentPath=$developmentPath" `
        "--extensionTestsPath=$(Join-Path $repositoryRoot 'plugin/host-tests/run.cjs')" $testWorkspace
    if ($LASTEXITCODE -ne 0) { throw "VS Code host failed with exit code $LASTEXITCODE. Inspect $taskDirectory" }
    $pendingClient = $listener.AcceptTcpClientAsync()
    if (-not $pendingClient.Wait(5000)) { throw "VS Code did not return test evidence. Inspect $taskDirectory" }
    $client = $pendingClient.Result
    try {
        $client.ReceiveTimeout = 5000
        $reader = [IO.StreamReader]::new($client.GetStream(), [Text.Encoding]::UTF8)
        try { $reportText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally { $client.Dispose() }
    $reportText | Set-Content -LiteralPath $reportFile -Encoding utf8
    $result = $reportText | ConvertFrom-Json
    if (-not $result.passed) { throw "VS Code host checks failed. Inspect $reportFile" }
    Get-Content -LiteralPath $reportFile -Raw
    Write-Host "Host evidence retained at $reportFile"
}
finally {
    $listener.Stop()
    $env:DAIGUA_HOST_PORT = $oldPort
}
