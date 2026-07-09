# Cria o cluster Postgres portátil e aplica schema + migrations.
# Idempotente: pode rodar de novo com o cluster já existente.
$ErrorActionPreference = 'Stop'

$Infra = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo  = Split-Path -Parent $Infra
$PgBin = Join-Path $Infra 'pg\pgsql\bin'
$PgData = Join-Path $Infra 'pg\data'
$PgLog = Join-Path $Infra 'pg\pg.log'

if (-not (Test-Path (Join-Path $PgBin 'initdb.exe'))) {
    throw "Postgres portatil nao encontrado em $PgBin. Baixe os binarios antes."
}

$env:PGPASSWORD = 'postgres'

if (-not (Test-Path $PgData)) {
    Write-Host '==> initdb'
    $pwFile = Join-Path $env:TEMP 'pgpw.txt'
    'postgres' | Out-File -FilePath $pwFile -Encoding ascii -NoNewline
    & (Join-Path $PgBin 'initdb.exe') -D $PgData -U postgres --pwfile=$pwFile -E UTF8 | Out-Null
    Remove-Item $pwFile
}

# Sobe o servidor se ainda nao estiver de pe.
& (Join-Path $PgBin 'pg_isready.exe') -h localhost -p 5432 -U postgres 2>$null | Out-Null
if (-not $?) {
    Write-Host '==> start postgres'
    & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData -l $PgLog -o '-p 5432' -w start
}

# Cria o banco se faltar.
$exists = & (Join-Path $PgBin 'psql.exe') -h localhost -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='video_rooms'"
if ($exists -ne '1') {
    Write-Host '==> createdb video_rooms'
    & (Join-Path $PgBin 'createdb.exe') -h localhost -U postgres video_rooms
}

$psql = Join-Path $PgBin 'psql.exe'
$app  = Join-Path $Repo 'backend\app'

Write-Host '==> schema.sql'
& $psql -h localhost -U postgres -d video_rooms -v ON_ERROR_STOP=1 -f (Join-Path $app 'schema.sql') | Out-Null

# As migrations sao idempotentes; aplica todas em ordem.
# 002_tenancy.sql semeia o plan `default` + tenant `openpbl`, que
# tenancy.resolve_tenant_id exige (sem ele, todo request morre em 500).
Get-ChildItem (Join-Path $app 'migrations\*.sql') | Sort-Object Name | ForEach-Object {
    Write-Host "==> $($_.Name)"
    & $psql -h localhost -U postgres -d video_rooms -v ON_ERROR_STOP=1 -f $_.FullName | Out-Null
}

Write-Host 'DB pronto: postgresql://postgres:postgres@localhost:5432/video_rooms'
