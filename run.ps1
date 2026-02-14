# Запуск приложения FinLife
# Использует виртуальное окружение .venv

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

if (-not (Test-Path "$projectRoot\.venv\Scripts\Activate.ps1")) {
    Write-Host "Виртуальное окружение не найдено. Создайте его: python -m venv .venv" -ForegroundColor Red
    Write-Host "Затем: .venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

& "$projectRoot\.venv\Scripts\Activate.ps1"
Set-Location $projectRoot
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
