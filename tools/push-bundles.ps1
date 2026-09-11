<#!
.SYNOPSIS
  Payesh bundle push-collector: integrates Arena *.bundle files into main.
.DESCRIPTION
  Watches C:\bundles for new .bundle files and, for each one:
    1. git bundle verify
    2. git fetch <bundle> <ref>:push-temp-<name>
    3. checkout main, sync with origin/main, merge --no-ff (one merge-commit per bundle)
    4. run gates (build --check, check-authz, secret-scan, smoke when jsdom exists)
    5. on gate failure or conflict: STOP (no push), log, exit non-zero
    6. git push origin main + ls-remote verification
    7. append HANDOFF.md entry, commit docs, push again
  Processed bundles are recorded in C:\bundles\processed.txt; all output
  goes to C:\bundles\push-log.txt (and console).
.PARAMETER Once
  Process pending bundles a single time and exit (default when run non-interactively).
.PARAMETER Loop
  Watch forever, polling every 5 minutes. Use with Task Scheduler instead if preferred.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\p2\tools\push-bundles.ps1 -Once
#>
[CmdletBinding()]
param(
  [switch]$Once,
  [switch]$Loop
)

$ErrorActionPreference = 'Stop'
$RepoDir      = 'C:\p2'
$WatchDir     = 'C:\bundles'
$DoneDir      = Join-Path $WatchDir 'done'
$ProcessedDb  = Join-Path $WatchDir 'processed.txt'
$LogFile      = Join-Path $WatchDir 'push-log.txt'
$PollSeconds  = 300

function Write-Log([string]$msg) {
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $msg
  Write-Host $line
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Invoke-Git([string[]]$gitArgs) {
  # git writes informational messages (e.g. "bundle is okay") to stderr
  # even on success - do not let them trigger $ErrorActionPreference='Stop'.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & git @gitArgs 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prevEap
  }
  return @{ Ok = ($code -eq 0); Out = ($out | Out-String).Trim() }
}

function Get-Processed {
  if (Test-Path -LiteralPath $ProcessedDb) {
    return @(Get-Content -LiteralPath $ProcessedDb | Where-Object { $_ -ne '' })
  }
  return @()
}

function Mark-Processed([string]$bundlePath) {
  $fileName = [IO.Path]::GetFileName($bundlePath)
  Add-Content -LiteralPath $ProcessedDb -Value $fileName -Encoding UTF8
  if (-not (Test-Path -LiteralPath $DoneDir)) { New-Item -ItemType Directory -Path $DoneDir | Out-Null }
  Move-Item -LiteralPath $bundlePath -Destination (Join-Path $DoneDir $fileName) -Force
}

function Test-Gates {
  # Returns $true only if every runnable gate passes.
  # FAIL-CLOSED: any failure (or conflict) stops the pipeline before push.
  $steps = @(
    @{ Name = 'build --check';  Cmd = @('node', 'build.js', '--check') },
    @{ Name = 'check-authz';    Cmd = @('node', 'tools/check-authz.js') },
    @{ Name = 'secret-scan';    Cmd = @('node', 'tests/secret-scan.js') }
  )
  foreach ($s in $steps) {
    Write-Log ("gate: running {0}" -f $s.Name)
    $p = Start-Process -FilePath $s.Cmd[0] -ArgumentList ($s.Cmd[1..($s.Cmd.Length - 1)]) `
      -WorkingDirectory $RepoDir -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { Write-Log ("gate FAILED: {0}" -f $s.Name); return $false }
    Write-Log ("gate passed: {0}" -f $s.Name)
  }
  if (Test-Path -LiteralPath (Join-Path $RepoDir 'node_modules/jsdom/package.json')) {
    Write-Log "gate: running smoke (jsdom present)"
    $p = Start-Process -FilePath 'node' -ArgumentList 'tests/smoke.js' `
      -WorkingDirectory $RepoDir -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { Write-Log "gate FAILED: smoke"; return $false }
    Write-Log "gate passed: smoke"
  } else {
    Write-Log "gate: smoke SKIPPED (jsdom missing) - api/wave suites stay blocked"
  }
  return $true
}

function Invoke-Bundle([string]$bundlePath) {
  $name = [IO.Path]::GetFileNameWithoutExtension($bundlePath)
  $tempBranch = "push-temp-$name"
  Write-Log ("=== processing {0} ===" -f $bundlePath)

  $v = Invoke-Git @('bundle', 'verify', $bundlePath)
  if (-not $v.Ok) { Write-Log ("STOP: bundle verify failed: {0}" -f $v.Out); return $false }
  Write-Log "bundle verify OK"

  $heads = Invoke-Git @('bundle', 'list-heads', $bundlePath)
  if (-not $heads.Ok) { Write-Log ("STOP: list-heads failed: {0}" -f $heads.Out); return $false }
  $ref = ($heads.Out -split "`n" | Select-Object -First 1).Trim().Split(' ')[0]
  Write-Log ("bundle head: {0}" -f $ref)

  $f = Invoke-Git @('fetch', $bundlePath, ("{0}:{1}" -f $ref, $tempBranch))
  if (-not $f.Ok) { Write-Log ("STOP: fetch failed: {0}" -f $f.Out); return $false }

  $c = Invoke-Git @('checkout', 'main')
  if (-not $c.Ok) { Write-Log ("STOP: checkout main failed: {0}" -f $c.Out); return $false }
  $s = Invoke-Git @('fetch', 'origin')
  if (-not $s.Ok) { Write-Log ("STOP: fetch origin failed (network?): {0}" -f $s.Out); return $false }
  $ff = Invoke-Git @('merge', '--ff-only', 'origin/main')
  if (-not $ff.Ok) {
    # main has local commits (e.g. HANDOFF entries): merge origin first, keep-both for docs.
    Write-Log "main diverged from origin/main - merging origin/main first"
    $mo = Invoke-Git @('merge', '--no-ff', '-m', 'merge: sync origin/main before bundle integration', 'origin/main')
    if (-not $mo.Ok) {
      Invoke-Git @('merge', '--abort') | Out-Null
      Write-Log ("STOP: conflict while syncing origin/main - needs manual keep-both: {0}" -f $mo.Out)
      return $false
    }
  }

  $m = Invoke-Git @('merge', '--no-ff', '-m', ("merge: integrate {0}" -f $name), $tempBranch)
  if (-not $m.Ok) {
    Invoke-Git @('merge', '--abort') | Out-Null
    Write-Log ("STOP: conflict merging {0} - needs manual keep-both resolution" -f $tempBranch)
    return $false
  }
  $mergeCommit = (Invoke-Git @('rev-parse', '--short', 'HEAD')).Out
  Write-Log ("merged {0} as {1}" -f $tempBranch, $mergeCommit)

  if (-not (Test-Gates)) {
    Write-Log "STOP: gates red - main stays unpushed for this bundle"
    return $false
  }

  $p = Invoke-Git @('push', 'origin', 'main')
  if (-not $p.Ok) { Write-Log ("STOP: push failed: {0}" -f $p.Out); return $false }
  $remote = (Invoke-Git @('ls-remote', 'origin', 'main')).Out
  Write-Log ("push OK: {0}" -f $remote)

  # HANDOFF record (rule: every push is recorded) as its own docs commit.
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  $entry = "`n`n## OpenCode push-collector: bundle {0} merged as {1} [{2}]`n`n- merge-commit: {1} · gates green (build/authz/scan{3}) · push verified via ls-remote.`n" -f $name, $mergeCommit, $stamp, ''
  Add-Content -LiteralPath (Join-Path $RepoDir 'HANDOFF.md') -Value $entry -Encoding UTF8
  Invoke-Git @('add', 'HANDOFF.md') | Out-Null
  $hc = Invoke-Git @('commit', '-m', ("docs: HANDOFF record for bundle {0} [{1}]" -f $name, $stamp))
  if ($hc.Ok) {
    $hp = Invoke-Git @('push', 'origin', 'main')
    Write-Log ("HANDOFF push: {0}" -f $hp.Out)
  } else {
    Write-Log ("HANDOFF commit skipped: {0}" -f $hc.Out)
  }

  Invoke-Git @('branch', '-D', $tempBranch) | Out-Null
  Mark-Processed $bundlePath
  Write-Log ("=== done {0} ===" -f $name)
  return $true
}

function Invoke-Once {
  Set-Location -LiteralPath $RepoDir
  $processed = Get-Processed
  $bundles = Get-ChildItem -LiteralPath $WatchDir -Filter '*.bundle' -File -ErrorAction SilentlyContinue |
    Where-Object { $processed -notcontains $_.Name } | Sort-Object Name
  if (-not $bundles) { Write-Log "no pending bundles"; return $true }
  $allOk = $true
  foreach ($b in $bundles) {
    if (-not (Invoke-Bundle $b.FullName)) { $allOk = $false }
  }
  return $allOk
}

# ---- main ----
if (-not (Test-Path -LiteralPath $WatchDir)) { New-Item -ItemType Directory -Path $WatchDir | Out-Null }
if (-not (Test-Path -LiteralPath $LogFile)) { New-Item -ItemType File -Path $LogFile | Out-Null }
Write-Log "push-collector start (repo=$RepoDir)"
if ($Loop) {
  while ($true) { Invoke-Once | Out-Null; Start-Sleep -Seconds $PollSeconds }
} else {
  $ok = Invoke-Once
  if (-not $ok) { exit 1 }
}
