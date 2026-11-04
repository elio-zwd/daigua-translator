[CmdletBinding()]
param([string]$SourceRoot, [switch]$Online)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = Split-Path -Parent $PSScriptRoot
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
Push-Location -LiteralPath $repositoryRoot
$demoOutput = Join-Path ([IO.Path]::GetTempPath()) ('daigua-verify-' + [guid]::NewGuid().ToString('N'))
try {
    Invoke-Checked 'python' @('-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-v')
    Invoke-Checked 'npm.cmd' @('--prefix', 'plugin', 'test')
    Invoke-Checked 'python' @('extractor/extract.py', '--src', 'examples/mcu-demo', '--root', 'examples/mcu-demo', '--include-locals', '--out', $demoOutput)
    foreach ($pack in @('knowledge-packs/05_createtask-pack.json', 'knowledge-packs/example/example-pack.json')) {
        Invoke-Checked 'python' @('validator/validate.py', '--pack', $pack)
    }
    foreach ($pack in @('examples/mcu-demo/demo-pack.json', 'examples/mcu-demo/ambiguity-pack.json')) {
        Invoke-Checked 'python' @('validator/validate.py', '--pack', $pack, '--src', 'examples/mcu-demo')
    }
    if ($SourceRoot) { Invoke-Checked 'python' @('scripts/check-05-pack.py', '--src', $SourceRoot) }
    $smokeArguments = @('scripts/test-plugin.js')
    if ($Online) { $smokeArguments += '--online' }
    Invoke-Checked 'node' $smokeArguments
    Write-Host 'Automated verification passed. Manual host/hardware checks remain separate.'
}
finally {
    Pop-Location
    $resolvedTemp = [IO.Path]::GetFullPath($demoOutput)
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\daigua-verify-'
    if ($resolvedTemp.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
