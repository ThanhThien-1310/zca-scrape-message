param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$Log
)
# Voi moi file trong $Spec.files: copy file mau sang dich, mo bang Excel COM, chen/xoa dong cho khop so dong
# du lieu (Excel tu mo rong pham vi cac cong thuc COUNTIF/SUM nam trum len cho chen), ghi gia tri, ghi cac o
# tieu de ngay/gio, luu dang .xlsx thuong (KHONG co macro -> dinh dang luu la 51, khong phai 52 cua .xlsm).
$ErrorActionPreference = 'Stop'
# Ten khac han $Spec/$Log (bien PowerShell khong phan biet hoa thuong: $log se trung $Log neu dat cung ten).
$lines = New-Object System.Collections.Generic.List[string]
$failed = $false
$xl = $null
try {
    $spec = Get-Content $Spec -Raw -Encoding UTF8 | ConvertFrom-Json
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.EnableEvents = $false

    foreach ($f in $spec.files) {
        try {
            New-Item -ItemType Directory -Force (Split-Path -Parent $f.out) | Out-Null
            Copy-Item $f.template $f.out -Force

            $wb = $xl.Workbooks.Open($f.out)
            $ws = $wb.Worksheets.Item($f.sheet)

            $need = $f.rows.Count
            $have = $f.totalRowBefore - $f.firstDataRow
            $totalRow = $ws.Rows($f.totalRowBefore)
            if ($need -gt $have) {
                for ($k = 0; $k -lt ($need - $have); $k++) { $totalRow.EntireRow.Insert() | Out-Null }
            } elseif ($need -lt $have) {
                for ($k = 0; $k -lt ($have - $need); $k++) { $totalRow.Offset(-1, 0).EntireRow.Delete() | Out-Null }
            }

            for ($i = 0; $i -lt $f.rows.Count; $i++) {
                $rowNum = $f.firstDataRow + $i
                foreach ($col in $f.rows[$i].PSObject.Properties) {
                    $ws.Range("$($col.Name)$rowNum").Value2 = $col.Value
                }
            }
            foreach ($cell in $f.headerCells) {
                $ws.Range($cell.ref).Value2 = $cell.value
                if ($null -ne $cell.numberFormat) { $ws.Range($cell.ref).NumberFormat = $cell.numberFormat }
            }

            $wb.SaveAs($f.out, 51)
            $wb.Close($false)
            $lines.Add("$($f.name): $need dong")
        } catch {
            $failed = $true
            $lines.Add("$($f.name): ERR $($_.Exception.Message)")
        }
    }
} catch {
    $failed = $true
    $lines.Add("ERR: $($_.Exception.Message)")
} finally {
    if ($null -ne $xl) {
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}
$lines | Out-File -FilePath $Log -Encoding utf8
if ($failed) { exit 1 }
