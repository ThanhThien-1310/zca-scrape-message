param(
    [Parameter(Mandatory = $true)][string]$Template,
    [Parameter(Mandatory = $true)][string]$Out,
    [Parameter(Mandatory = $true)][string]$RowsJson,
    [Parameter(Mandatory = $true)][string]$LogFile
)
# Copies the template, writes the flattened rows into its `data` sheet with
# Excel events disabled (so Workbook_Open does not run on an empty sheet), then
# re-enables events and runs Workbook_Open, which fills the five report tables.
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
$failed = $false
$xl = $null
try {
    New-Item -ItemType Directory -Force (Split-Path -Parent $Out) | Out-Null
    Copy-Item $Template $Out -Force

    $rows = Get-Content $RowsJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $n = $rows.Count
    $c = 20
    $arr = New-Object 'object[,]' $n, $c
    for ($i = 0; $i -lt $n; $i++) {
        for ($j = 0; $j -lt $c; $j++) {
            $v = $rows[$i][$j]
            if ($v -is [string] -and $v -eq '') { $v = $null }
            $arr[$i, $j] = $v
        }
    }

    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.EnableEvents = $false

    $wb = $xl.Workbooks.Open($Out)
    $ws = $wb.Worksheets.Item('data')
    $ws.Range($ws.Cells(2, 1), $ws.Cells(1 + $n, $c)).Value2 = $arr
    $ws.Range($ws.Cells(2, 5), $ws.Cells(1 + $n, 5)).NumberFormat = '0'
    $ws.Range($ws.Cells(2, 6), $ws.Cells(1 + $n, 6)).NumberFormat = 'dd/mm/yyyy'
    $ws.Range($ws.Cells(2, 7), $ws.Cells(1 + $n, 7)).NumberFormat = 'hh:mm'
    $log.Add("filled $n rows into data")

    $xl.EnableEvents = $true
    try {
        $xl.Run('ThisWorkbook.Workbook_Open')
        $log.Add('macro OK: ThisWorkbook.Workbook_Open')
    } catch {
        $failed = $true
        $log.Add("macro FAILED: $($_.Exception.Message)")
    }

    $total = 0
    foreach ($sn in 'MAY TINH', 'INTERNET', 'NETSUPPORT', 'LOA', 'MAY LANH') {
        $lo = $wb.Worksheets.Item($sn).ListObjects.Item(1)
        $cnt = 0
        if ($null -ne $lo.DataBodyRange) { $cnt = $lo.DataBodyRange.Rows.Count }
        $total += $cnt
        $log.Add("$sn table rows: $cnt")
    }
    if ($total -eq 0) { $failed = $true; $log.Add('ERR: 5 bang bao cao van trong sau khi chay macro') }

    $wb.SaveAs($Out, 52)
    $wb.Close($false)
} catch {
    $failed = $true
    $log.Add("ERR: $($_.Exception.Message)")
} finally {
    if ($null -ne $xl) {
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}
$log | Out-File -FilePath $LogFile -Encoding utf8
if ($failed) { exit 1 }
