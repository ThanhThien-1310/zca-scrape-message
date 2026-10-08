param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$Log
)
# Voi moi file trong $Spec.files: copy file mau sang dich, mo bang Excel COM, chen/xoa dong cho khop so dong
# du lieu (Excel tu mo rong pham vi cac cong thuc COUNTIF/SUM nam trum len cho chen), ghi gia tri, ghi cac o
# tieu de ngay/gio, luu dang .xlsx thuong (KHONG co macro -> dinh dang luu la 51, khong phai 52 cua .xlsm).
#
# QUAN TRONG: script nay duoc GOI MOT LAN RIENG CHO MOI FILE (xem src/cli/fill-status-reports.ts) - $Spec.files
# thuong chi co 1 phan tu. Da tai hien va xac nhan: xu ly nhieu file trong CUNG MOT TIEN TRINH PowerShell (du
# moi file tao Excel.Application rieng) khien file sau bi loi "Specified cast is not valid" ngay o buoc gan
# gia tri, neu file TRUOC DO co thao tac XOA DONG (EntireRow.Delete) - dau hieu bo nho dem goi COM (.NET DLR
# callsite) dung chung theo TIEN TRINH bi nhiem, khong phai theo Excel.Application. Tach tien trinh PowerShell
# rieng cho tung file (cham hon, nhung da kiem chung luon chay dung) la cach sua o cap goi, khong phai o day -
# vong lap duoi day van xu ly duoc mang nhieu phan tu neu can, chi la thuc te luon nhan dung 1.
#
# Moi bien local o day co ten khac han $Spec/$Log: PowerShell khong phan biet hoa thuong, nen vi du $spec
# (chu thuong) se TRUNG voi $Spec (tham so) va ghi de len no ngay khi gan gia tri - da gap bug nay that
# (ConvertFrom-Json parse dung nhung gan vao $spec lai lam hong chinh $Spec dang duoc doc trong cung pipeline).
$ErrorActionPreference = 'Stop'
$lines = New-Object System.Collections.Generic.List[string]
$failed = $false

$parsed = Get-Content $Spec -Raw -Encoding UTF8 | ConvertFrom-Json

foreach ($f in $parsed.files) {
    $xl = $null
    try {
        $xl = New-Object -ComObject Excel.Application
        $xl.Visible = $false
        $xl.DisplayAlerts = $false
        $xl.AutomationSecurity = 1
        $xl.EnableEvents = $false

        New-Item -ItemType Directory -Force (Split-Path -Parent $f.out) | Out-Null
        Copy-Item $f.template $f.out -Force

        $wb = $xl.Workbooks.Open($f.out)
        # Xoa cac sheet khac khong dua vao file xuat (vd mau INTERNET co them sheet NETSUPPORT, moi cai xuat mot file rieng;
        # mau MAY TINH co sheet "danh sach du kien" khong dung). Xoa TRUOC khi ghi du lieu. $f.deleteSheets thieu hoac rong thi bo qua.
        foreach ($sheetName in $f.deleteSheets) { $wb.Worksheets.Item($sheetName).Delete() | Out-Null }
        $ws = $wb.Worksheets.Item($f.sheet)

        # Mau co the chua RAT NHIEU luat dinh dang co dieu kien (CF) HONG co cong thuc tro toi #REF! (de lai khi xoa dong/cot trong
        # Excel, vd mau MAY TINH da co 470 luat, 400 luat hong). Xoa 2 dong tro len trong sheet nhu vay lam Excel TU SAP
        # ("The RPC server is unavailable", khong ghi duoc log). Luat hong khong con tac dung (khong tro toi o nao) nen xoa bo
        # truoc khi chen/xoa dong; cac luat con hieu luc giu nguyen.
        $conds = $ws.Cells.FormatConditions
        for ($ci = $conds.Count; $ci -ge 1; $ci--) {
            $cond = $conds.Item($ci)
            $condFormula = ''
            try { $condFormula = [string]$cond.Formula1 } catch { }
            if ($condFormula -like '*#REF!*') { $cond.Delete() | Out-Null }
        }

        $need = $f.rows.Count
        $have = $f.totalRowBefore - $f.firstDataRow
        # Khong bao gio xoa het xuong duoi 1 dong: xoa het dong du lieu duy nhat ma mot cong thuc dang tro toi
        # (vd BO SUNG MAY TINH) bien tham chieu do thanh #REF! vinh vien trong file luu ra. 0 dong hop le van
        # giu lai 1 dong trong (dung nhu file mau von co san), khong ghi du lieu vao do ma thoi.
        # inPlace (mau LICH NGHI PHEP): giu nguyen so dong cua mau, khong chen/xoa dong nao (targetRows = have). Khong co thi nhu cu.
        $targetRows = if ($f.inPlace -eq $true) { $have } else { [Math]::Max($need, 1) }
        $totalRow = $ws.Rows($f.totalRowBefore)
        if ($targetRows -gt $have) {
            for ($k = 0; $k -lt ($targetRows - $have); $k++) { $totalRow.EntireRow.Insert() | Out-Null }
        } elseif ($targetRows -lt $have) {
            for ($k = 0; $k -lt ($have - $targetRows); $k++) { $totalRow.Offset(-1, 0).EntireRow.Delete() | Out-Null }
        }

        # Ghi ca khoi bang mot mang 2 chieu roi gan 1 lan, khong gan tung o rieng le.
        if ($need -gt 0) {
            $width = [int][char]$f.lastColumn - [int][char]'A' + 1
            $arr = New-Object 'object[,]' $need, $width
            for ($i = 0; $i -lt $need; $i++) {
                foreach ($col in $f.rows[$i].PSObject.Properties) {
                    $colIndex = [int][char]$col.Name - [int][char]'A'
                    $arr[$i, $colIndex] = $col.Value
                }
            }
            $lastRow = $f.firstDataRow + $need - 1
            $ws.Range($ws.Cells($f.firstDataRow, 1), $ws.Cells($lastRow, $width)).Value2 = $arr
        }
        # Moi o co the nam o sheet khac neu co truong "sheet" (vd ngay bao cao o sheet TONG cua mau VE SINH); khong co thi la sheet chinh.
        foreach ($cell in $f.headerCells) {
            $target = if ($cell.sheet) { $wb.Worksheets.Item($cell.sheet) } else { $ws }
            # Chu (vd "Ngay: 05/10/2026") va so (vd ngay dang so cua sheet TONG) ghi o HAI CAU LENH RIENG: cung mot cau lenh gan Value2
            # luc thi chu luc thi so lam bo nho dem goi COM cua PowerShell bao "Unable to cast System.Int32 to System.String" (gap that
            # voi mau VE SINH khi khong co dong du lieu nao).
            # Dinh dang o (vd "@" = chu) phai dat TRUOC khi gan gia tri: gan truoc thi Excel doi chu "08/10/2026" thanh so ngay (da gap voi mau LICH NGHI PHEP).
            if ($null -ne $cell.numberFormat) { $target.Range($cell.ref).NumberFormat = $cell.numberFormat }
            if ($cell.value -is [string]) { $target.Range($cell.ref).Value2 = $cell.value }
            else { $target.Range($cell.ref).Value2 = [double]$cell.value }
        }
        # Ghi de lai cac cong thuc CHU GIAI & THONG KE (neu co) theo dung vung du lieu hien tai thay vi de Excel
        # tu suy ra - xem statusReportLayout.ts (legendFormulaCells) ve ly do.
        foreach ($cell in $f.formulaCells) {
            $target = if ($cell.sheet) { $wb.Worksheets.Item($cell.sheet) } else { $ws }
            $target.Range($cell.ref).Formula = "=" + $cell.formula
        }

        $wb.SaveAs($f.out, 51)
        $wb.Close($false)
        $lines.Add("$($f.name): $need dong")
    } catch {
        $failed = $true
        $lines.Add("$($f.name): ERR $($_.Exception.Message)")
    } finally {
        if ($null -ne $xl) {
            $xl.Quit()
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
        }
    }
}
$lines | Out-File -FilePath $Log -Encoding utf8
if ($failed) { exit 1 }
