param([string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot)), [string]$InputDirectory = 'output\release-docx', [switch]$ExportPdf)
$ErrorActionPreference = 'Stop'
$destination = Join-Path $ProjectRoot 'output\word-check'
New-Item -ItemType Directory -Force $destination | Out-Null
$word = New-Object -ComObject Word.Application
$word.Visible = [bool]$ExportPdf
$word.Options.PrintBackground = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$results = @()
try {
  $files = Get-ChildItem (Join-Path $ProjectRoot $InputDirectory) -Filter '*.docx'
  $files += Get-Item (Join-Path $ProjectRoot 'demo\乱格式办公通知示例.docx')
  $files = $files | Sort-Object FullName -Unique
  foreach ($file in $files) {
    $doc = $null
    try {
      $copy = Join-Path $destination $file.Name
      Copy-Item -LiteralPath $file.FullName -Destination $copy -Force
      # Explicit OpenAndRepair=false. All files are generated synthetic samples.
      $doc = $word.Documents.Open($copy, $false, $false, $false, '', '', $false, '', '', 0, 0, $true, $false, 0, $true, '')
      Write-Output ('OPEN ' + $file.Name)
      $pages = $null
      $pdf = Join-Path $destination ($file.BaseName + '.pdf')
      if ($ExportPdf) {
        Write-Output ('EXPORT ' + $file.Name)
        $doc.ExportAsFixedFormat($pdf, 17)
        Write-Output ('EXPORTED ' + $file.Name)
        $pages = $doc.ComputeStatistics(2)
      }
      $doc.Save()
      $doc.Close(0)
      $doc = $null
      $results += @{ file=$file.Name; status='PASS'; pages=$pages; openAndRepair=$false; saveClose=$true; pdf=$(if ($ExportPdf) { [IO.Path]::GetFileName($pdf) } else { $null }); wordVersion=$word.Version }
      Write-Output ('PASS ' + $file.Name + ' pages=' + $pages)
    } catch {
      $results += @{ file=$file.Name; status='FAIL'; error=$_.Exception.Message }
      Write-Output ('FAIL ' + $file.Name + ': ' + $_.Exception.Message)
    } finally { if ($null -ne $doc) { $doc.Close(0) } }
  }
} finally { $word.Quit() }
$results | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $destination ('word-results-' + (Split-Path $InputDirectory -Leaf) + '.json'))
