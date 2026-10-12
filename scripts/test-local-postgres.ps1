param([switch]$Browser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$testRoot = Join-Path $projectRoot '.local-test'
$dataPath = Join-Path $testRoot 'postgres'
$passwordPath = Join-Path $testRoot 'password'
if (-not (Test-Path -LiteralPath $pgBin)) { throw 'PostgreSQL 17 is required, or use your own qayd_test database.' }
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
if (-not (Test-Path -LiteralPath $passwordPath)) {
  $randomBytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($randomBytes)
  $rng.Dispose()
  [Convert]::ToBase64String($randomBytes) | Set-Content -LiteralPath $passwordPath -NoNewline
}
$testPassword = Get-Content -LiteralPath $passwordPath -Raw
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  & "$pgBin\initdb.exe" -D $dataPath -U qayd_test --auth=scram-sha-256 --encoding=UTF8 --locale=C --pwfile=$passwordPath
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
}
$oldDatabaseUrl = $env:DATABASE_URL
$oldPgPassword = $env:PGPASSWORD
$oldBrowser = $env:QAYD_BROWSER_TEST
try {
  & "$pgBin\pg_ctl.exe" -D $dataPath -l (Join-Path $testRoot 'postgres.log') -o '-h 127.0.0.1 -p 55438 -c shared_buffers=16MB -c max_connections=20' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Test PostgreSQL could not start' }
  $env:PGPASSWORD = $testPassword
  if ($Browser) { $env:QAYD_BROWSER_TEST = 'true' }
  $exists = & "$pgBin\psql.exe" -h 127.0.0.1 -p 55438 -U qayd_test -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='qayd_test'"
  if ($exists -ne '1') { & "$pgBin\createdb.exe" -h 127.0.0.1 -p 55438 -U qayd_test qayd_test }
  $env:DATABASE_URL = 'postgresql://qayd_test:' + [Uri]::EscapeDataString($testPassword) + '@127.0.0.1:55438/qayd_test'
  Push-Location (Join-Path $projectRoot 'backend')
  try {
    npm run migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
    npm run test:integration
    if ($LASTEXITCODE -ne 0) { throw 'Integration tests failed' }
  } finally { Pop-Location }
} finally {
  & "$pgBin\pg_ctl.exe" -D $dataPath -m fast -w stop
  $env:DATABASE_URL = $oldDatabaseUrl
  $env:PGPASSWORD = $oldPgPassword
  $env:QAYD_BROWSER_TEST = $oldBrowser
}
