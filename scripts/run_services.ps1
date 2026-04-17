param(
    [int]$BackendPort = 47820,
    [int]$FrontendPort = 47821
)

# Derive root from script location (scripts\ is one level below root)
$RootDir  = (Get-Item "$PSScriptRoot\.." ).FullName
$LogsDir  = Join-Path $RootDir "logs"
$PidFile  = Join-Path $RootDir "freecode.pids"
$PythonExe = Join-Path $RootDir "venv\Scripts\python.exe"
$FrontendDir = Join-Path $RootDir "frontend"
$NextBin  = Join-Path $FrontendDir "node_modules\.bin\next"

# Create logs directory
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# Set backend port env var so backend.server picks it up
$env:FC_BACKEND_PORT  = $BackendPort
$env:FC_FRONTEND_PORT = $FrontendPort

# ── 0. Kill previous tracked processes ────────────────────────────────────────
Write-Host "[0/4] Cleaning up previous sessions..."
if (Test-Path $PidFile) {
    Get-Content $PidFile | ForEach-Object {
        $id = [int]$_ 
        try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Remove-Item $PidFile -Force
}

# Also kill by port in case PIDs were lost
@($BackendPort, $FrontendPort) | ForEach-Object {
    $p = $_
    netstat -aon 2>$null |
        Select-String ":$p " |
        Select-String "LISTENING" |
        ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            try { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } catch {}
        }
}

Start-Sleep -Milliseconds 1500

# Remove stale log files
"backend.log","frontend.log","backend.err","frontend.err" | ForEach-Object {
    $f = Join-Path $LogsDir $_
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

# ── 2. Start Backend ───────────────────────────────────────────────────────────
Write-Host "[2/4] Starting Backend..."
$backendProc = Start-Process -WindowStyle Hidden `
    -FilePath $PythonExe `
    -ArgumentList "-m", "backend.server" `
    -WorkingDirectory $RootDir `
    -RedirectStandardOutput (Join-Path $LogsDir "backend.log") `
    -RedirectStandardError  (Join-Path $LogsDir "backend.err") `
    -PassThru

# ── 3. Start Frontend ──────────────────────────────────────────────────────────
Write-Host "[3/4] Starting Frontend..."
$frontendProc = Start-Process -WindowStyle Hidden `
    -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm start -- -p $FrontendPort" `
    -WorkingDirectory $FrontendDir `
    -RedirectStandardOutput (Join-Path $LogsDir "frontend.log") `
    -RedirectStandardError  (Join-Path $LogsDir "frontend.err") `
    -PassThru

# Save PIDs for next clean shutdown
$backendProc.Id, $frontendProc.Id | Set-Content $PidFile

# ── 4. Wait & Launch WebView ───────────────────────────────────────────────────
Write-Host "[4/4] Waiting for servers to warm up..."
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Launching GUI..."
$webviewScript = Join-Path $RootDir "scripts\run_webview.py"
Start-Process -WindowStyle Hidden `
    -FilePath $PythonExe `
    -ArgumentList $webviewScript `
    -WorkingDirectory $RootDir
