# Draws simple app icons (dark teal, two cyan bank lines, red marker ellipse) with System.Drawing.
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($size in 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(11, 61, 58))
  $k = $size / 512.0
  $cyan = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(0, 229, 255)), ([float](14 * $k))
  $g.DrawLine($cyan, [float](70 * $k), [float](200 * $k), [float](442 * $k), [float](190 * $k))
  $g.DrawLine($cyan, [float](70 * $k), [float](392 * $k), [float](442 * $k), [float](392 * $k))
  $rect = New-Object System.Drawing.RectangleF ([float](146 * $k)), ([float](250 * $k)), ([float](220 * $k)), ([float](66 * $k))
  $white = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([float](26 * $k))
  $red = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 59, 48)), ([float](16 * $k))
  $g.DrawEllipse($white, $rect)
  $g.DrawEllipse($red, $rect)
  $bmp.Save((Join-Path $out "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "Icons written to $out"
