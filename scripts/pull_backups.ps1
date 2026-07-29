# FinLife - pull DB backups (.sql.gz) from the prod server to this machine.
# Run on a schedule (Task Scheduler). PULL (not push) on purpose: the server holds
# no credentials to your machine, so losing the server doesn't lose this copy.
#
# Requirements: OpenSSH client (built into Windows 10/11) + an SSH key to the server.
# Adjust $Server / $LocalDir below.
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI, so non-ASCII
# comments can break parsing. Keep this file ASCII.

$ErrorActionPreference = "Stop"

$Server    = "root@45.144.30.5"          # user@host of the prod server
$RemoteDir = "/opt/centricore/backups"
$LocalDir  = "$HOME\FinLifeBackups"
$KeepDays  = 90                          # local retention (days)

New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
$log = Join-Path $LocalDir "pull.log"
function Log($m) { "$(Get-Date -Format o)  $m" | Tee-Object -FilePath $log -Append }

Log "pull start -> $LocalDir"
try {
    # List backups on the server
    $remoteList = ssh $Server "ls -1 $RemoteDir/prod_*.sql.gz 2>/dev/null"
    if (-not $remoteList) { Log "no .sql.gz backups on server yet"; exit 0 }

    $names = $remoteList -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $copied = 0
    foreach ($path in $names) {
        $name  = Split-Path $path -Leaf
        $local = Join-Path $LocalDir $name
        if (Test-Path $local) { continue }        # already have it - skip
        Log "scp $name"
        scp "${Server}:$path" $local
        if ($LASTEXITCODE -ne 0) { throw "scp failed on $name" }
        $copied++
    }

    # Local retention
    Get-ChildItem $LocalDir -Filter "prod_*.sql.gz" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
        Remove-Item -Force

    $total = (Get-ChildItem $LocalDir -Filter "prod_*.sql.gz").Count
    Log "pull done: $copied new, $total total"
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
