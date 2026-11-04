$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($nodeCommand) { $nodeExe = $nodeCommand.Source }
elseif (Test-Path -LiteralPath $runtimeNode) { $nodeExe = $runtimeNode }
else { throw 'Instala Node.js 22 o superior para ejecutar el proyecto.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { throw 'Instala las dependencias antes de iniciar: pnpm install o npm install.' }
& $nodeExe backend/server.js
