#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$pluginDirectory = Join-Path $PSScriptRoot 'plugin'
$vsce = Join-Path $pluginDirectory 'node_modules/.bin/vsce.cmd'
$output = Join-Path $pluginDirectory 'daigua-translator.vsix'
$staged = Join-Path $pluginDirectory "daigua-build-$([guid]::NewGuid().ToString('N')).vsix"

Push-Location -LiteralPath $pluginDirectory
try {
    if (-not (Test-Path -LiteralPath $vsce -PathType Leaf)) {
        throw '缺少插件构建依赖。请在仓库根目录运行 npm.cmd --prefix plugin ci。'
    }

    # VSCE runs the manifest's vscode:prepublish hook to compile the extension.
    $packageLog = & $vsce package --out $staged 2>&1
    if ($LASTEXITCODE -ne 0) {
        $errors = $packageLog | ForEach-Object { "$_" } |
            Where-Object { $_ -match '(?i)\berror\b|exception|\bfatal\b|failed|错误|失败' }
        throw ((@("VSIX 打包失败（退出码 $LASTEXITCODE）。") + $errors) -join [Environment]::NewLine)
    }

    $checkLog = & python -X utf8 (Join-Path $PSScriptRoot 'scripts/check-vsix.py') $staged 2>&1
    if ($LASTEXITCODE -ne 0) {
        $errors = $checkLog | ForEach-Object { "$_" } | Where-Object { $_ -notmatch '^\[OK\]' }
        throw ((@("VSIX 校验失败（退出码 $LASTEXITCODE）。") + $errors) -join [Environment]::NewLine)
    }

    [IO.File]::Move($staged, $output, $true)
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $staged -PathType Leaf) {
        Remove-Item -LiteralPath $staged -ErrorAction Continue
    }
}
