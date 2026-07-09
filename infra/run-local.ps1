# Sobe o stack local sem Docker: Postgres portatil + LiveKit + backend + frontend.
# Portas: frontend 5173, backend 8000 (/docs), LiveKit 7880, Postgres 5432.
# MinIO/S3 nao sobe aqui — apenas gravacao (egress) fica indisponivel.
$ErrorActionPreference = 'Stop'

$Infra = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo  = Split-Path -Parent $Infra

& (Join-Path $Infra 'init-db.ps1')

Write-Host '==> livekit-server --dev (7880)'
$lk = Join-Path $Infra 'livekit\livekit-server.exe'
Start-Process -FilePath $lk -ArgumentList '--dev','--bind','0.0.0.0' `
    -WorkingDirectory (Join-Path $Infra 'livekit') -WindowStyle Hidden

# config.py (pydantic-settings) le somente env vars do processo — nao le .env.
$env:DATABASE_URL        = 'postgresql://postgres:postgres@localhost:5432/video_rooms'
$env:LIVEKIT_API_KEY     = 'devkey'   # precisa casar com as chaves dev do livekit --dev
$env:LIVEKIT_API_SECRET  = 'secret'
$env:LIVEKIT_URL         = 'ws://localhost:7880'
$env:LIVEKIT_HOST_URL    = 'http://localhost:7880'
# Origem explicita, nao `*`: o cookie de sessao (client_session) e credenciado e o
# browser rejeita CORS credenciado quando Access-Control-Allow-Origin e `*`.
$env:CORS_ORIGINS        = 'http://localhost:5173'

Write-Host '==> backend uvicorn (8000)'
$py = Join-Path $Repo 'backend\.venv\Scripts\python.exe'
Start-Process -FilePath $py -ArgumentList '-m','uvicorn','app.main:app','--reload','--port','8000' `
    -WorkingDirectory (Join-Path $Repo 'backend') -WindowStyle Hidden

Write-Host '==> frontend vite (5173)'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
    -WorkingDirectory (Join-Path $Repo 'frontend') -WindowStyle Hidden

Write-Host ''
Write-Host 'frontend  http://localhost:5173'
Write-Host 'backend   http://localhost:8000/docs'
Write-Host 'parar     infra\stop-local.ps1'
