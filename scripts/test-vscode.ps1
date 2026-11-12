[CmdletBinding()]
param([string]$CodePath = 'code.cmd', [string]$VsixPath = '', [switch]$SchemaRecovery,
    [string]$StateDirectory = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ($SchemaRecovery) {
    if (-not $VsixPath) { throw '-SchemaRecovery requires the packaged VSIX under test.' }
    $recoveryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('daigua-recovery-' + [guid]::NewGuid().ToString('N'))
    $stagingDirectory = Join-Path $recoveryDirectory 'staged'
    [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $VsixPath).Path, $stagingDirectory)
    $stagedProduct = Join-Path $stagingDirectory 'extension'
    $manifestFile = Join-Path $stagedProduct 'package.json'
    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    foreach ($group in $manifest.contributes.configuration) { $group.properties.PSObject.Properties.Remove('daiguaTranslate.libraryDirectory') }
    $manifest | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $manifestFile -Encoding utf8
    $stalePackage = Join-Path $recoveryDirectory 'stale-schema.vsix'
    [IO.Compression.ZipFile]::CreateFromDirectory($stagingDirectory, $stalePackage)
    $previousPhase = $env:DAIGUA_SCHEMA_RECOVERY_PHASE
    try {
        $env:DAIGUA_SCHEMA_RECOVERY_PHASE = 'missing'
        & pwsh.exe -NoProfile -File $PSCommandPath -CodePath $CodePath -StateDirectory $recoveryDirectory -VsixPath $stalePackage
        if ($LASTEXITCODE -ne 0) { throw "Missing-schema recovery failed. Inspect $recoveryDirectory" }
        $env:DAIGUA_SCHEMA_RECOVERY_PHASE = 'restored'
        & pwsh.exe -NoProfile -File $PSCommandPath -CodePath $CodePath -StateDirectory $recoveryDirectory -VsixPath (Resolve-Path -LiteralPath $VsixPath).Path
        if ($LASTEXITCODE -ne 0) { throw "Restored-schema persistence failed. Inspect $recoveryDirectory" }
        Write-Host "Schema recovery and restart evidence retained at $recoveryDirectory"
    } finally { $env:DAIGUA_SCHEMA_RECOVERY_PHASE = $previousPhase }
    return
}
if ($StateDirectory) {
    $resolvedStateDirectory = [IO.Path]::GetFullPath($StateDirectory).TrimEnd('\')
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if ([IO.Path]::GetDirectoryName($resolvedStateDirectory) -ine $expectedParent -or
        [IO.Path]::GetFileName($resolvedStateDirectory) -notmatch '^daigua-recovery-[0-9a-f]{32}$') {
        throw 'StateDirectory must be the isolated temporary schema-recovery directory.'
    }
}
$taskDirectory = if ($StateDirectory) { $resolvedStateDirectory } else { Join-Path ([IO.Path]::GetTempPath()) ('daigua-host-' + [guid]::NewGuid().ToString('N')) }
$testWorkspace = Join-Path $taskDirectory 'workspace'
$settingsDirectory = Join-Path $testWorkspace '.vscode'
New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
'{"daiguaTranslate.bingEnabled":false,"daiguaTranslate.hoverFallback":"off","update.mode":"none","extensions.autoUpdate":false,"telemetry.telemetryLevel":"off"}' | Set-Content -LiteralPath (Join-Path $settingsDirectory 'settings.json') -Encoding utf8
$profileSettings = Join-Path $taskDirectory 'profile/User'
New-Item -ItemType Directory -Path $profileSettings -Force | Out-Null
'{"update.mode":"none","extensions.autoUpdate":false,"telemetry.telemetryLevel":"off","chat.disableAIFeatures":true}' | Set-Content -LiteralPath (Join-Path $profileSettings 'settings.json') -Encoding utf8
$reportFile = Join-Path $taskDirectory $(if ($env:DAIGUA_SCHEMA_RECOVERY_PHASE) { 'report-' + $env:DAIGUA_SCHEMA_RECOVERY_PHASE + '.json' } else { 'report.json' })
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
        if ($env:DAIGUA_SCHEMA_RECOVERY_PHASE) {
            # VS Code uses an in-memory storage database whenever extensionTestsPath
            # is set. A normal activation driver is required to test real restarts.
            '{"name":"daigua-host-driver","publisher":"daigua-tests","version":"0.0.0","activationEvents":["onStartupFinished"],"engines":{"vscode":"^1.85.0"},"main":"./index.js"}' | Set-Content -LiteralPath (Join-Path $developmentPath 'package.json') -Encoding utf8
            $runnerLiteral = Join-Path $repositoryRoot 'plugin/host-tests/run.cjs' | ConvertTo-Json -Compress
            @"
const vscode = require('vscode');
exports.activate = async function () {
  try { await require($runnerLiteral).run(); }
  catch (error) { console.error(error); }
  finally { await vscode.commands.executeCommand('workbench.action.quit'); }
};
"@ | Set-Content -LiteralPath (Join-Path $developmentPath 'index.js') -Encoding utf8
        }
        $extensionFlags = @()
    }
    # --extensionTestsPath closes the isolated host after run(); existing profiles are not used.
    $diagnosticFlags = @()
    if ($env:DAIGUA_SCHEMA_RECOVERY_PHASE) { $diagnosticFlags = @('--verbose') }
    $testFlags = @()
    if (-not $env:DAIGUA_SCHEMA_RECOVERY_PHASE) { $testFlags = @("--extensionTestsPath=$(Join-Path $repositoryRoot 'plugin/host-tests/run.cjs')") }
    & $CodePath '--new-window' '--wait' @extensionFlags @diagnosticFlags '--disable-workspace-trust' '--skip-welcome' '--skip-release-notes' `
        '--user-data-dir' (Join-Path $taskDirectory 'profile') '--extensions-dir' (Join-Path $taskDirectory 'extensions') `
        "--extensionDevelopmentPath=$developmentPath" @testFlags $testWorkspace |
        Tee-Object -FilePath (Join-Path $taskDirectory ('host-' + $env:DAIGUA_SCHEMA_RECOVERY_PHASE + '.log')) |
        Where-Object { -not $env:DAIGUA_SCHEMA_RECOVERY_PHASE -or $_ -match '\[schema recovery\]|\[error\]|exited with code' }
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
    if (-not $result -or -not $result.PSObject.Properties['passed'] -or $result.passed -ne $true) { throw "VS Code host checks failed or returned incomplete evidence. Inspect $reportFile" }
    Get-Content -LiteralPath $reportFile -Raw
    Write-Host "Host evidence retained at $reportFile"
}
finally {
    $listener.Stop()
    $env:DAIGUA_HOST_PORT = $oldPort
}
