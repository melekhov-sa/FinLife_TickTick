# Fix DATABASE_URL environment variable
[Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "User")
[Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "Process")
Write-Host "Cleared DATABASE_URL from environment variables"
Write-Host "Please restart the terminal and uvicorn server"
