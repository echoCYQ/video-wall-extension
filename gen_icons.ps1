# Generate extension icons (dark rounded square + 4 colored quadrants)
# NOTE: ASCII only on purpose. Run with: powershell -ExecutionPolicy Bypass -File gen_icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function New-Icon([int]$size, [string]$path) {
    $w = [int]$size
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($w, $w)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # background rounded square
    $bg = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 18, 20, 28))
    $p = [int][Math]::Round($w * 0.06)
    $r = [int]($w - (2 * $p))
    $rect = New-Object System.Drawing.Rectangle -ArgumentList @($p, $p, $r, $r)
    $radius = [int][Math]::Round($w * 0.22)
    $d = [int](2 * $radius)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $gp.AddArc(($rect.Right - $d), $rect.Y, $d, $d, 270, 90)
    $gp.AddArc(($rect.Right - $d), ($rect.Bottom - $d), $d, $d, 0, 90)
    $gp.AddArc($rect.X, ($rect.Bottom - $d), $d, $d, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($bg, $gp)

    # four quadrant tiles
    $m = [int][Math]::Round($w * 0.10)
    $half = [int][Math]::Round(($w - (2 * $p)) / 2)
    $gap = [int][Math]::Round($w * 0.05)
    $t = [int]($half - $m - $gap)
    $qx1 = [int]($p + $m)
    $qy1 = [int]($p + $m)
    $qx2 = [int]($p + $half + $gap)
    $qy2 = [int]($p + $m)
    $qx3 = [int]($p + $m)
    $qy3 = [int]($p + $half + $gap)
    $qx4 = [int]($p + $half + $gap)
    $qy4 = [int]($p + $half + $gap)

    $colors = @(
        [System.Drawing.Color]::FromArgb(255, 82, 130, 255),
        [System.Drawing.Color]::FromArgb(255, 52, 199, 89),
        [System.Drawing.Color]::FromArgb(255, 255, 159, 10),
        [System.Drawing.Color]::FromArgb(255, 255, 69, 58)
    )
    $coords = @(
        @($qx1, $qy1),
        @($qx2, $qy2),
        @($qx3, $qy3),
        @($qx4, $qy4)
    )
    $qd = [int](2 * [Math]::Round($w * 0.09))

    for ($i = 0; $i -lt 4; $i++) {
        $cx = [int]$coords[$i][0]
        $cy = [int]$coords[$i][1]
        $b = New-Object System.Drawing.SolidBrush -ArgumentList @($colors[$i])
        $qgp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $qgp.AddArc($cx, $cy, $qd, $qd, 180, 90)
        $qgp.AddArc(($cx + $t - $qd), $cy, $qd, $qd, 270, 90)
        $qgp.AddArc(($cx + $t - $qd), ($cy + $t - $qd), $qd, $qd, 0, 90)
        $qgp.AddArc($cx, ($cy + $t - $qd), $qd, $qd, 90, 90)
        $qgp.CloseFigure()
        $g.FillPath($b, $qgp)
        $b.Dispose()
        $qgp.Dispose()
    }

    $g.Dispose()
    $bg.Dispose()
    $gp.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "saved: $path"
}

New-Icon 128 (Join-Path $outDir "icon128.png")
New-Icon 48  (Join-Path $outDir "icon48.png")
New-Icon 16  (Join-Path $outDir "icon16.png")
Write-Host "done"
