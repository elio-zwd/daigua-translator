[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$demoRoot = Join-Path $repositoryRoot ('dist/manual-demo-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path -LiteralPath $demoRoot) { throw "目录已存在：$demoRoot" }
New-Item -ItemType Directory -Path $demoRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'examples/mcu-demo/main.c') -Destination $demoRoot
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'examples/mcu-demo/demo-pack.json') -Destination (Join-Path $demoRoot 'pack.json')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'examples/mcu-demo/ambiguity-pack.json') -Destination $demoRoot
$packPath = Join-Path $demoRoot 'pack.json'
$ambiguityPath = Join-Path $demoRoot 'ambiguity-pack.json'
Write-Host '请将以下配置手动写入 VS Code 工作区设置：'
@{ 'daiguaTranslate.packPaths' = @($packPath) } | ConvertTo-Json
Write-Host "歧义测试第二个路径：$ambiguityPath"
Write-Host '这是独立测试副本，可放心修改；脚本没有启动或操作 VS Code。'
