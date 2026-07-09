@echo off
setlocal
title BWL VideoConference - Publicacao (git push + deploy Lightsail)

REM Garante que roda na pasta do projeto (raiz do repositorio).
cd /d "%~dp0"

REM Fallback: se git nao estiver no PATH, tenta o caminho padrao do Git for Windows.
where git >nul 2>&1 || set "PATH=C:\Program Files\Git\cmd;%PATH%"

if not exist "%~dp0publish.ps1" (
    echo [ERRO] publish.ps1 nao encontrado nesta pasta.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   BWL VideoConference - git push + deploy AWS Lightsail
echo  ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo  [OK] Publicacao concluida.
) else (
    echo  [ERRO] Publicacao FALHOU. Codigo de saida: %RC%
)
echo.
pause
exit /b %RC%
