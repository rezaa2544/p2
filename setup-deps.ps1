# S7-9 (Bug Hunt session 7): a live PAT was hard-coded here and committed.
# Never put a token in a tracked file — read it from the environment:
#   $env:GH_TOKEN = 'github_pat_...'   (set it in YOUR shell / CI secret store, not here)
if (-not $env:GH_TOKEN) {
  Write-Error "GH_TOKEN is not set. Export it in your shell first (never commit it)."
  exit 1
}
Set-Location "C:\Users\R.M\Documents\Default Project"
Write-Host "Installing jsdom..."
npm install --no-save jsdom 2>&1
Write-Host "jsdom exit: $?"
Write-Host "Installing ruflo..."
npm install -g ruflo 2>&1
Write-Host "ruflo exit: $?"
