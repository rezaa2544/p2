$env:GH_TOKEN = "[REMOVED-PAT-S7-9]"
Set-Location "C:\Users\R.M\Documents\Default Project"
Write-Host "Installing jsdom..."
npm install --no-save jsdom 2>&1
Write-Host "jsdom exit: $?"
Write-Host "Installing ruflo..."
npm install -g ruflo 2>&1
Write-Host "ruflo exit: $?"
