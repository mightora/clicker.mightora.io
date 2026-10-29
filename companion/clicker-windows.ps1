# Mightora Clicker — Windows-only companion, no Python installation required.
# PowerShell 5.1+ and Windows Forms are available on standard Windows desktops.
# Run only on a computer you are authorised to control.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

function Send-ClickerJson {
    param($Socket, [hashtable]$Message)
    $raw = $Message | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

Write-Host ""
Write-Host "MIGHTORA CLICKER — Windows Companion" -ForegroundColor Cyan
Write-Host "No Python installation needed. Press Ctrl+C to exit."
$code = (Read-Host 'Paste your private connection code from the Clicker website').Trim()
if ($code -cnotmatch '^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32})$') {
    throw 'Invalid connection code. Use Copy private connection code on the computer website.'
}
$room = $Matches[1]
$token = $Matches[2]
$code = $null
$url = [Uri]::new("wss://clicker.mightora.io/api/rooms/$room/ws")
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [System.Threading.CancellationToken]::None

try {
    Write-Host 'Connecting securely to the session...'
    $socket.ConnectAsync($url, $ct).GetAwaiter().GetResult()
    Send-ClickerJson -Socket $socket -Message @{ type = 'auth'; role = 'host'; token = $token }
    $token = $null
    $buffer = New-Object byte[] 4096
    $ready = $false
    while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $segment = [System.ArraySegment[byte]]::new($buffer)
        $result = $socket.ReceiveAsync($segment, $ct).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
        if ($result.MessageType -ne [System.Net.WebSockets.WebSocketMessageType]::Text) { continue }
        if (-not $result.EndOfMessage) { throw 'Unexpected oversized server message' }
        try {
            $message = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count) | ConvertFrom-Json
        } catch { continue }
        if ($message.type -eq 'ready') {
            $ready = $true
            Send-ClickerJson -Socket $socket -Message @{ type = 'host_info'; native = $true }
            Write-Host 'Connected! Click back into your PowerPoint or other presentation now.' -ForegroundColor Green
            continue
        }
        if ($message.type -in @('ended', 'expired')) {
            Write-Host 'The session has ended.'
            break
        }
        if (-not $ready -or $message.type -ne 'key') { continue }
        # Only four explicit keys are allowed; no arbitrary input or commands.
        $sequence = switch ($message.key) {
            'ArrowLeft'  { '{LEFT}' }
            'ArrowRight' { '{RIGHT}' }
            'ArrowUp'    { '{UP}' }
            'ArrowDown'  { '{DOWN}' }
            default      { $null }
        }
        if ($sequence) {
            [System.Windows.Forms.SendKeys]::SendWait($sequence)
            Write-Host $message.key
        }
    }
} finally {
    if ($socket) { $socket.Dispose() }
}
