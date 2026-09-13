param([ValidateSet('setup','start','stop','status')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $projectRoot '.local/postgresql16/pgsql/bin'
$pgData = Join-Path $projectRoot '.local/pgdata'
$pgLog = Join-Path $projectRoot '.local/postgresql.log'
if (!(Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) { throw 'PostgreSQL 16 binaries are missing. See README.md for setup instructions.' }
if ($Action -eq 'setup' -and !(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
 if (Test-Path -LiteralPath (Join-Path $projectRoot '.env')) { throw '.env already exists; preserve it and configure this instance manually.' }
 $dbOwnerPassword = & node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
 $dbAppPassword = & node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
 $sessionSecret = & node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
 $passwordFile = Join-Path $projectRoot '.local/init-password'
 [IO.File]::WriteAllText($passwordFile,$dbOwnerPassword)
 try {
  & (Join-Path $pgBin 'initdb.exe') -D $pgData -U dataf_owner --encoding=UTF8 --locale=C --auth=scram-sha-256 "--pwfile=$passwordFile"
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
 } finally { Remove-Item -LiteralPath $passwordFile -Force }
 $envText = "DATABASE_URL=postgresql://dataf:${dbAppPassword}@127.0.0.1:55432/dataf_dorm`nDATABASE_ADMIN_URL=postgresql://dataf_owner:${dbOwnerPassword}@127.0.0.1:55432/postgres`nJWT_SECRET=$sessionSecret`nPORT=4000`nHOST=127.0.0.1`nCLIENT_ORIGIN=http://127.0.0.1:5173`nNODE_ENV=development`n"
 [IO.File]::WriteAllText((Join-Path $projectRoot '.env'),$envText)
}
if ($Action -in @('start','setup')) {
 & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData status *> $null
 if ($LASTEXITCODE -ne 0) {
  $pgStartArgs = @('-D', ('"' + $pgData + '"'), '-l', ('"' + $pgLog + '"'), '-o', '"-h 127.0.0.1 -p 55432"', '-w', 'start')
  $pgStartProcess = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $pgStartArgs -WindowStyle Hidden -PassThru
  $pgStartProcess.WaitForExit()
  if ($pgStartProcess.ExitCode -ne 0) { throw 'PostgreSQL did not start. Inspect .local/postgresql.log.' }
 }
 Write-Output 'Project PostgreSQL is running on 127.0.0.1:55432.'
} elseif ($Action -eq 'stop') {
 & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData -m fast -w stop
} else { & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData status }
