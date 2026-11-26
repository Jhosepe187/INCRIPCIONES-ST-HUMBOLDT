# Inicia el portal en http://localhost:8000 con el servidor integrado de PHP (solo para pruebas locales).
# En producción, la carpeta public/ se sube al hosting de WordPress: ver README.md.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$php = Get-Command php -ErrorAction SilentlyContinue
if (-not $php) { throw 'Instala PHP 8.0 o superior (https://windows.php.net/download) y agrégalo al PATH.' }
if (-not (Test-Path -LiteralPath 'public/api/config.php')) {
  Write-Warning 'Falta public/api/config.php: copia config.example.php y completa las claves para guardar en Google Sheets y consultar DNI.'
}
Write-Host 'Matrículas: http://localhost:8000'
& $php.Source -S localhost:8000 -t public
