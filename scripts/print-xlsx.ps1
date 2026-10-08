param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$Log,
    [switch]$DryRun
)
# In MOT sheet cua MOT file .xlsx ra MAY IN MAC DINH cua Windows (may in ma Excel dang tro toi), toi da maxPages trang dau.
# $Spec la file JSON {file, sheet, maxPages}. Mo file CHI DOC va khong luu: cai dat trang in (le, huong giay, kho giay, ty le)
# la cai da luu san trong file (copy tu file mau); script nay chi doi le trai/phai va can giua khi centerPage = true. Voi -DryRun chi dem trang, khong in.
# Neu {centerPage} la true: can giua trang ngang va dat le trai = le phai (le lon hon), chi cho ban in. Ghi ket qua vao $Log dang JSON {pages, printed, printer, sent, leftMargin, rightMargin, centerHorizontally} hoac {error}. Tra ma thoat 1 khi loi.
# Duoc goi MOT LAN RIENG CHO MOI FILE (src/total/printFiles.ts), giong scripts/fill-status-template.ps1 (xem ghi chu o do ve ly do
# moi file mot tien trinh PowerShell rieng). Ten bien local khac $Spec/$Log vi PowerShell khong phan biet hoa thuong.
$ErrorActionPreference = 'Stop'
$xl = $null
$wb = $null
try {
    $parsed = Get-Content $Spec -Raw -Encoding UTF8 | ConvertFrom-Json
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.EnableEvents = $false
    $printerName = [string]$xl.ActivePrinter
    if ([string]::IsNullOrWhiteSpace($printerName)) { throw 'Excel khong co may in hien hanh (Windows chua dat may in mac dinh?)' }

    $wb = $xl.Workbooks.Open($parsed.file, 0, $true)
    $ws = $wb.Worksheets.Item($parsed.sheet)
    if ($parsed.centerPage) {
        # Chi doi trong bo nho (file mo chi doc, khong luu): can giua trang theo chieu ngang va dat le trai = le phai (lay le LON hon).
        $page = $ws.PageSetup
        $side = [Math]::Max([double]$page.LeftMargin, [double]$page.RightMargin)
        $page.CenterHorizontally = $true
        $page.LeftMargin = $side
        $page.RightMargin = $side
    }
    $pages = [int]$ws.PageSetup.Pages.Count
    $toPage = [Math]::Min($pages, [int]$parsed.maxPages)
    $sent = $false
    if ($pages -gt 0 -and -not $DryRun) {
        $ws.PrintOut(1, $toPage) | Out-Null
        $sent = $true
    }
    $result = @{ pages = $pages; printed = $toPage; printer = $printerName; sent = $sent; leftMargin = [double]$ws.PageSetup.LeftMargin; rightMargin = [double]$ws.PageSetup.RightMargin; centerHorizontally = [bool]$ws.PageSetup.CenterHorizontally }
    $result | ConvertTo-Json -Compress | Out-File -FilePath $Log -Encoding utf8
} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress | Out-File -FilePath $Log -Encoding utf8
    $exitCode = 1
} finally {
    if ($null -ne $wb) { $wb.Close($false) | Out-Null; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($null -ne $xl) { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
}
if ($exitCode) { exit $exitCode }
