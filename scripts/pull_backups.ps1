# FinLife - pull encrypted DB backups (.age) from the prod server to this machine.
# Run on a schedule (Task Scheduler). PULL (not push) on purpose: the server holds
# no credentials to your machine, so a seized server can't reach this copy.
#
# Requirements: OpenSSH client (built into Windows 10/11) + an SSH key to the server.
# Adjust $Server / $LocalDir below. The private age key is NOT needed here - files
# stay encrypted; decryption happens only at restore time.
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
    # List encrypted backups on the server
    $remoteList = ssh $Server "ls -1 $RemoteDir/prod_*.sql.gz.age 2>/dev/null"
    if (-not $remoteList) { Log "no .age files on server (encryption not set up yet?)"; exit 0 }

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
    Get-ChildItem $LocalDir -Filter "prod_*.sql.gz.age" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
        Remove-Item -Force

    $total = (Get-ChildItem $LocalDir -Filter "prod_*.sql.gz.age").Count
    Log "pull done: $copied new, $total total"
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
