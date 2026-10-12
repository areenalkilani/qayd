param([string]$AppOrigin = 'http://localhost:8443')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$localRoot = Join-Path $projectRoot '.local-dev'
$dataPath = Join-Path $localRoot 'postgres'
$passwordPath = Join-Path $localRoot 'password'
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
if (-not (Test-Path -LiteralPath $passwordPath)) {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  [IO.File]::WriteAllText($passwordPath, [Convert]::ToBase64String($bytes))
}
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  & "$pgBin\initdb.exe" -D $dataPath -U qayd_local --auth=scram-sha-256 --encoding=UTF8 --locale=C --pwfile=$passwordPath
  if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed' }
}
& "$pgBin\pg_ctl.exe" -D $dataPath status *> $null
if ($LASTEXITCODE -ne 0) {
  & "$pgBin\pg_ctl.exe" -D $dataPath -l (Join-Path $localRoot 'postgres.log') -o '-h 127.0.0.1 -p 55439 -c shared_buffers=16MB -c max_connections=20' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Database startup failed' }
}
$savedPassword = $env:PGPASSWORD
$savedUrl = $env:DATABASE_URL
try {
  $env:PGPASSWORD = [IO.File]::ReadAllText($passwordPath)
  $exists = & "$pgBin\psql.exe" -h 127.0.0.1 -p 55439 -U qayd_local -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='qayd_local'"
  if ($LASTEXITCODE -ne 0) { throw 'Database connection failed' }
  if ($exists -ne '1') {
    & "$pgBin\createdb.exe" -h 127.0.0.1 -p 55439 -U qayd_local qayd_local
    if ($LASTEXITCODE -ne 0) { throw 'Database creation failed' }
  }
  $env:DATABASE_URL = 'postgresql://qayd_local:' + [Uri]::EscapeDataString($env:PGPASSWORD) + '@127.0.0.1:55439/qayd_local'
  $config = "DATABASE_URL=$($env:DATABASE_URL)`nAPP_ORIGIN=$AppOrigin`nPORT=3000`nNODE_ENV=development`nSTORAGE_ROOT=$($localRoot.Replace('\','/'))/files`n"
  [IO.File]::WriteAllText((Join-Path $localRoot 'api.env'), $config)
  Push-Location (Join-Path $projectRoot 'backend')
  try {
    npm run migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
    if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
      Start-Process -FilePath (Get-Command node).Source -ArgumentList '--env-file=../.local-dev/api.env','dist/main.js' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localRoot 'api.log') -RedirectStandardError (Join-Path $localRoot 'api-error.log')
    }
  } finally { Pop-Location }
} finally { $env:PGPASSWORD = $savedPassword; $env:DATABASE_URL = $savedUrl }
Write-Output "Local API configured for $AppOrigin; database persists in .local-dev."
