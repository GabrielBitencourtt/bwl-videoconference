# Derruba o stack local (backend, frontend, LiveKit, Postgres).
$Infra = Split-Path -Parent $MyInvocation.MyCommand.Path

Get-Process livekit-server -ErrorAction SilentlyContinue | Stop-Process -Force

# Mata so os processos deste repo, para nao derrubar outros node/python da maquina.
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*bwl-videoconference*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$PgCtl = Join-Path $Infra 'pg\pgsql\bin\pg_ctl.exe'
if (Test-Path $PgCtl) {
    & $PgCtl -D (Join-Path $Infra 'pg\data') -m fast stop
}

Write-Host 'stack parado'
