# build.ps1 – One-click build script for Stock Picker
# Run from the repo root:  .\build.ps1
#
# Requirements (already installed if you've been developing):
#   • Node.js + npm
#   • Python 3.10+ with the project's virtualenv active (or packages globally)
#
# Output: backend\dist\StockPicker.exe

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

$root = $PSScriptRoot

# ── Step 1: Build Next.js static frontend ──────────────────────────────────
Write-Step "Building Next.js frontend (this may take a minute)…"
Push-Location "$root\frontend"
npm install
npm run build          # produces frontend\out\
Pop-Location

# ── Step 2: Copy frontend build into the backend folder ────────────────────
Write-Step "Copying frontend build into backend\frontend_out…"
$dest = "$root\backend\frontend_out"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item "$root\frontend\out" $dest -Recurse

# ── Step 3: Ensure Python dependencies and PyInstaller are installed ────────
Write-Step "Installing Python dependencies…"
pip install -r "$root\backend\requirements.txt" --quiet
pip install pyinstaller --quiet

# ── Step 4: Run PyInstaller ─────────────────────────────────────────────────
Write-Step "Bundling into StockPicker.exe (this takes a few minutes)…"
Push-Location "$root\backend"
pyinstaller stock_picker.spec --clean --noconfirm
Pop-Location

# ── Done ────────────────────────────────────────────────────────────────────
$exe = "$root\backend\dist\StockPicker.exe"
if (Test-Path $exe) {
    Write-Host "`nBuild succeeded!" -ForegroundColor Green
    Write-Host "Executable: $exe" -ForegroundColor Green
    Write-Host "`nShare the file 'StockPicker.exe' with your user."
    Write-Host "They just double-click it – no Python or Node.js needed."
    Write-Host "Their saved portfolios will be stored as 'stock_picker.db'"
    Write-Host "in the same folder as the .exe."
} else {
    Write-Host "`nBuild FAILED – check the output above for errors." -ForegroundColor Red
    exit 1
}
