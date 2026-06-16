# Panda Screenshot installer (Windows, PowerShell 5.1+).
#
# Hosted use (later):  irm https://.../install.ps1 | iex
# Local use (now):     .\install.ps1   (run from the repo; uses .\panda.exe or .\dist\panda-windows-<arch>.exe)
#
# Non-interactive overrides (environment variables):
#   PANDA_DATA           data directory          (default: %LocalAppData%\Panda)
#   PANDA_AUTOSTART 1|0  start at logon + restart on crash
#   PANDA_BIN_DIR        install dir             (default: %LocalAppData%\Programs\Panda)
#   PANDA_OPEN 1|0       open the browser        (default: 1)
#   PANDA_LOCAL 1        use a local build instead of downloading
#   PANDA_FORCE_REMOTE 1 force download even if a local build exists
#   PANDA_RELEASE_BASE   override the release base url

function Install-Panda {
    $ErrorActionPreference = 'Stop'
    try {
        [Net.ServicePointManager]::SecurityProtocol = `
            [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch {}

    $Port        = 8088
    $Url         = "http://localhost:$Port/screenshot"
    $TaskName    = 'Panda'
    $ReleaseBase = if ($env:PANDA_RELEASE_BASE) { $env:PANDA_RELEASE_BASE } else { 'https://github.com/ralphite/panda/releases/latest/download' }
    $DefaultData = Join-Path $env:LOCALAPPDATA 'Panda'
    $BinDir      = if ($env:PANDA_BIN_DIR) { $env:PANDA_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\Panda' }
    $Bin         = Join-Path $BinDir 'panda.exe'
    $ManageEnv   = -not $env:PANDA_BIN_DIR

    function Say  ($m) { Write-Host "==> $m" -ForegroundColor Cyan }
    function Warn ($m) { Write-Host "warning: $m" -ForegroundColor Yellow }
    function Fail ($m) { throw "panda installer: $m" }

    function Get-Arch {
        $pa = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
        switch ("$pa") {
            'AMD64' { return 'amd64' }
            'ARM64' { return 'arm64' }
            default { Fail "unsupported architecture '$pa'" }
        }
    }

    function Resolve-Binary ($arch) {
        $local = @('.\panda.exe', ".\dist\panda-windows-$arch.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($env:PANDA_FORCE_REMOTE -ne '1' -and ($env:PANDA_LOCAL -eq '1' -or $local)) {
            if (-not $local) { Fail 'local mode needs .\panda.exe or .\dist\panda-windows-*.exe - run: make release' }
            Say "Using local binary: $local (windows/$arch)"
            return (Resolve-Path $local).Path
        }
        $asset = "panda-windows-$arch.exe"
        $tmp   = Join-Path $env:TEMP $asset
        Say "Downloading $asset from $ReleaseBase ..."
        try { Invoke-WebRequest -Uri "$ReleaseBase/$asset" -OutFile $tmp -UseBasicParsing }
        catch { Fail "download failed: $ReleaseBase/$asset" }
        return $tmp
    }

    function Test-Up {
        try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 }
        catch { return $false }
    }

    $arch = Get-Arch
    $src  = Resolve-Binary $arch

    # 1. Data folder.
    if ($env:PANDA_DATA) {
        $data = $env:PANDA_DATA
    } else {
        $entered = Read-Host "Data folder [$DefaultData]"
        $data = if ([string]::IsNullOrWhiteSpace($entered)) { $DefaultData } else { $entered }
    }
    New-Item -ItemType Directory -Force -Path $data | Out-Null
    Say "Data folder: $data"

    # 2. Install the panda command (stop any running copy first so the .exe is not locked).
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Get-Process -Name 'panda' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Bin } | Stop-Process -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    Copy-Item -LiteralPath $src -Destination $Bin -Force
    Say "Installed: $Bin"

    if ($ManageEnv) {
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (($userPath -split ';') -notcontains $BinDir) {
            $newPath = if ([string]::IsNullOrEmpty($userPath)) { $BinDir } else { "$userPath;$BinDir" }
            [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
            $env:Path = "$env:Path;$BinDir"
            Warn "$BinDir added to your PATH - open a new terminal to use 'panda'."
        }
        if ($data -ne $DefaultData) { [Environment]::SetEnvironmentVariable('PANDA_DATA', $data, 'User') }
    } elseif (($env:Path -split ';') -notcontains $BinDir) {
        Warn "$BinDir is not on PATH; add it to run 'panda' directly."
    }

    # 2b. Drop the Chrome extension into the data folder for "Load unpacked".
    $extDir = Join-Path $data 'extension'
    & $Bin -export-extension $extDir
    Say "Chrome extension: $extDir"

    # 3. Optional auto-start at logon + restart on crash (Scheduled Task).
    if ($env:PANDA_AUTOSTART) {
        $autostart = $env:PANDA_AUTOSTART -match '^(1|y|yes)$'
    } else {
        $autostart = (Read-Host 'Auto-start panda at logon and restart it if it crashes? [y/N]') -match '^(y|yes)$'
    }

    $serviceStarted = $false
    if ($autostart) {
        try {
            $action   = New-ScheduledTaskAction -Execute $Bin -Argument "-data `"$data`"" -WorkingDirectory $data
            $trigger  = New-ScheduledTaskTrigger -AtLogOn
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                          -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
            Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
            Start-ScheduledTask -TaskName $TaskName
            $serviceStarted = $true
            Say "Registered scheduled task '$TaskName' (auto-start + restart on crash)."
        } catch {
            Warn "could not register scheduled task: $($_.Exception.Message)"
        }
    }

    # 4. Make sure it is running, then open the browser.
    if (Test-Up) {
        Say "panda already running at $Url"
    } elseif ($serviceStarted) {
        Say 'Started panda via the scheduled task.'
    } else {
        Say 'Starting panda in the background...'
        Start-Process -FilePath $Bin -ArgumentList '-data', $data -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $data 'panda.log') `
            -RedirectStandardError  (Join-Path $data 'panda.err.log') | Out-Null
    }

    $ok = $false
    for ($i = 0; $i -lt 50; $i++) {
        if (Test-Up) { $ok = $true; break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ok) { Fail "panda did not become reachable at $Url - see $data\panda.log" }

    if ($env:PANDA_OPEN -ne '0') { Start-Process $Url }

    Write-Host ''
    Say 'Panda is ready.'
    Write-Host "  URL:        $Url"
    Write-Host "  Command:    $Bin  (run 'panda' once a new terminal is open)"
    Write-Host "  Data:       $data"
    Write-Host "  Extension:  $extDir  (chrome://extensions -> Load unpacked)"
    if ($autostart) {
        Write-Host '  Auto-start: on (restarts on crash and at logon)'
    } else {
        Write-Host "  Auto-start: off - run 'panda' to start it again"
    }
}

Install-Panda
