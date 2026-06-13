@echo off
echo ==========================================================
echo    Starwatt Battery Logger App - Windows Deploy Script
echo ==========================================================

:: Check for Docker
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Docker is not installed or not in PATH. Please install Docker Desktop.
    exit /b 1
)

:: Check for docker compose
docker compose version >nul 2>nul
if %errorlevel% equ 0 (
    set COMPOSE_CMD=docker compose
) else (
    where docker-compose >nul 2>nul
    if %errorlevel% equ 0 (
        set COMPOSE_CMD=docker-compose
    ) else (
        echo Error: Neither 'docker compose' nor 'docker-compose' was found on your system.
        exit /b 1
    )
)

:: Create .env if missing
if not exist .env (
    echo Creating .env configuration from .env.example...
    copy .env.example .env
    echo WARNING: Default environment variables applied. Please edit your '.env' file to add your real InfluxDB tokens.
)

:: Run Compose
echo Orchestrating container build and activation...
%COMPOSE_CMD% up --build -d

echo ==========================================================
echo Deployment initiated successfully!
echo ----------------------------------------------------------
echo   Frontend Dashboard : http://localhost
echo   Backend API Server : http://127.0.0.1:5000 (Local Loopback)
echo ==========================================================
pause
