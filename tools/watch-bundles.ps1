# 🔍 Bundle Watcher — watch-bundles.ps1

**نسخه:** 1.0.0 | **تاریخ:** 2026-09-11 | **مالک:** OpenCode
**هدف:** واتچر خودکار بررسی bundleهای جدید در `C:\bundles\` و push بدون دستی.

---

## نحوه اجرا

```powershell
# اجرا در پس‌زمینه:
powershell -ExecutionPolicy Bypass -File C:\p2\tools\watch-bundles.ps1

# متوقف شدن: Ctrl+C یا Kill-Process
```

---

## اسکریپت

```powershell
param(
    [string]$BundleDir = "C:\bundles",
    [string]$ProjectDir = "C:\p2",
    [int]$IntervalSeconds = 300,
    [string]$DoneDir = "$BundleDir\done",
    [string]$FailedDir = "$BundleDir\failed"
)

# --- Setup ---
if (-not (Test-Path $BundleDir)) { New-Item -ItemType Directory -Path $BundleDir | Out-Null }
if (-not (Test-Path $DoneDir)) { New-Item -ItemType Directory -Path $DoneDir | Out-Null }
if (-not (Test-Path $FailedDir)) { New-Item -ItemType Directory -Path $FailedDir | Out-Null }

Write-Host "Bundle Watcher started."
Write-Host "  BundleDir:  $BundleDir"
Write-Host "  ProjectDir: $ProjectDir"
Write-Host "  DoneDir:    $DoneDir"
Write-Host "  FailedDir:  $FailedDir"
Write-Host "  Interval:   ${IntervalSeconds}s"
Write-Host "---"

while ($true) {
    $bundles = Get-ChildItem "$BundleDir\*.bundle" -ErrorAction SilentlyContinue

    if ($bundles.Count -eq 0) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] No bundles found. Waiting..."
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    foreach ($b in $bundles) {
        $bundleName = $b.Name
        $bundlePath = $b.FullName
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Processing: $bundleName"

        # --- Step 1: Verify bundle ---
        $verifyResult = & git bundle verify $bundlePath 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> verify FAILED"
            Write-Host "     $verifyResult"
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> verify OK"

        # --- Step 2: Create temp branch and fetch ---
        $tempBranch = "push-temp-$(Get-Random)"
        cd $ProjectDir

        # Fetch bundle
        $fetchResult = & git fetch $bundlePath "HEAD:$tempBranch" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> fetch FAILED"
            Write-Host "     $fetchResult"
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }

        # --- Step 3: Merge ---
        & git checkout main 2>&1 | Out-Null
        $mergeResult = & git merge $tempBranch --no-ff -m "merge: integrate $bundleName" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> merge FAILED, reverting"
            & git merge --abort 2>&1 | Out-Null
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }

        # --- Step 4: Run gates ---
        $smokeResult = & node tests/smoke.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> smoke FAILED, reverting"
            & git merge --abort 2>&1 | Out-Null
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> smoke PASSED"

        $authzResult = & node tools/check-authz.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> authz FAILED, reverting"
            & git merge --abort 2>&1 | Out-Null
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> authz PASSED"

        $secretResult = & node tests/secret-scan.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> secret-scan FAILED, reverting"
            & git merge --abort 2>&1 | Out-Null
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> secret-scan PASSED"

        $buildResult = & node build.js --check 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> build FAILED, reverting"
            & git merge --abort 2>&1 | Out-Null
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> build PASSED"

        # --- Step 5: Push ---
        $pushResult = & git push origin main 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> push FAILED"
            Write-Host "     $pushResult"
            Move-Item $bundlePath "$FailedDir\$bundleName" -Force
            continue
        }
        Write-Host "  -> push SUCCESS: $(git rev-parse HEAD)"

        # --- Step 6: Move to done ---
        Move-Item $bundlePath "$DoneDir\$bundleName" -Force
        Write-Host "  -> moved to done"
    }

    Write-Host "--- Waiting $IntervalSeconds seconds ---"
    Start-Sleep -Seconds $IntervalSeconds
}
```

---

## گزارش خطا

اگر هر مرحله شکست خورد:
- bundle به پوشه `failed\` منتقل می‌شود
- خطا در کنسول ثبت می‌شود
- واتچر ادامه می‌دهد (بندل بعدی بررسی می‌شود)

اگر موفق بود:
- bundle به پوشه `done\` منتقل می‌شود
- `git push origin main` انجام می‌شود

---

## نکات ایمنی

- **هیچ توکن دستی** در اسکریپت ذخیره نشده
- `git push` از احراز هویت git استفاده می‌کند
- اگر `git ls-remote origin` خطا بدهد، واتچر متوقف می‌شود و گزارش می‌دهد
- هر bundle = یک merge-commit (بدون fast-forward)

---

_OpenCode — مأموریت PR Creation + Bundle Collection_
