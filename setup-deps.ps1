$env:GH_TOKEN = "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"
Set-Location "C:\Users\R.M\Documents\Default Project"
Write-Host "Installing jsdom..."
npm install --no-save jsdom 2>&1
Write-Host "jsdom exit: $?"
Write-Host "Installing ruflo..."
npm install -g ruflo 2>&1
Write-Host "ruflo exit: $?"
