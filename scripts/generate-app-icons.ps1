param(
    [string]$Source = "ICON.png"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot $Source

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Icon source not found: $sourcePath"
}

$sourceImage = [System.Drawing.Bitmap]::FromFile($sourcePath)

try {
    $cropSize = [Math]::Min($sourceImage.Width, $sourceImage.Height)
    $cropX = [int][Math]::Floor(($sourceImage.Width - $cropSize) / 2)
    $cropY = [int][Math]::Floor(($sourceImage.Height - $cropSize) / 2)
    $cropRect = [System.Drawing.Rectangle]::new($cropX, $cropY, $cropSize, $cropSize)

    if ($sourceImage.Width -ne $sourceImage.Height) {
        Write-Host "Warning: The icon source is not square ($($sourceImage.Width)x$($sourceImage.Height)). Auto-cropping center ${cropSize}x${cropSize}."
    }

    $cornerAlpha = @(
        $sourceImage.GetPixel($cropX, $cropY).A
        $sourceImage.GetPixel($cropX + $cropSize - 1, $cropY).A
        $sourceImage.GetPixel($cropX, $cropY + $cropSize - 1).A
        $sourceImage.GetPixel($cropX + $cropSize - 1, $cropY + $cropSize - 1).A
    )

    if (($cornerAlpha | Measure-Object -Maximum).Maximum -ne 0) {
        Write-Host "Notice: The icon source corners are not fully transparent."
    }

    function New-ScaledTransparentBitmap {
        param(
            [System.Drawing.Image]$Image,
            [int]$Size
        )

        $bitmap = [System.Drawing.Bitmap]::new(
            $Size,
            $Size,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        $bitmap.SetResolution(96, 96)

        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $destRect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
            $graphics.DrawImage($Image, $destRect, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
        }
        finally {
            $graphics.Dispose()
        }

        return $bitmap
    }

    function Save-TransparentPng {
        param(
            [System.Drawing.Image]$Image,
            [int]$Size,
            [string]$RelativePath
        )

        $targetPath = Join-Path $repoRoot $RelativePath
        $targetDirectory = Split-Path -Parent $targetPath
        [System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null

        $bitmap = New-ScaledTransparentBitmap -Image $Image -Size $Size
        try {
            $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $bitmap.Dispose()
        }
    }

    function Convert-BitmapToIconDib {
        param(
            [System.Drawing.Bitmap]$Bitmap
        )

        $size = $Bitmap.Width
        $xorBytes = $size * $size * 4
        $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
        $maskBytes = $maskStride * $size

        $stream = [System.IO.MemoryStream]::new()
        $writer = [System.IO.BinaryWriter]::new($stream)
        try {
            $writer.Write([int]40)
            $writer.Write([int]$size)
            $writer.Write([int]($size * 2))
            $writer.Write([int16]1)
            $writer.Write([int16]32)
            $writer.Write([int]0)
            $writer.Write([int]($xorBytes + $maskBytes))
            $writer.Write([int]0)
            $writer.Write([int]0)
            $writer.Write([int]0)
            $writer.Write([int]0)

            for ($y = $size - 1; $y -ge 0; $y--) {
                for ($x = 0; $x -lt $size; $x++) {
                    $pixel = $Bitmap.GetPixel($x, $y)
                    $writer.Write([byte]$pixel.B)
                    $writer.Write([byte]$pixel.G)
                    $writer.Write([byte]$pixel.R)
                    $writer.Write([byte]$pixel.A)
                }
            }

            for ($y = $size - 1; $y -ge 0; $y--) {
                $maskRow = [byte[]]::new($maskStride)
                for ($x = 0; $x -lt $size; $x++) {
                    if ($Bitmap.GetPixel($x, $y).A -eq 0) {
                        $byteIndex = [int][Math]::Floor($x / 8.0)
                        $maskRow[$byteIndex] = $maskRow[$byteIndex] -bor (0x80 -shr ($x % 8))
                    }
                }
                $writer.Write($maskRow)
            }

            $writer.Flush()
            return ,([byte[]]$stream.ToArray())
        }
        finally {
            $writer.Dispose()
            $stream.Dispose()
        }
    }

    function Save-MultiSizeIcon {
        param(
            [System.Drawing.Image]$Image,
            [int[]]$Sizes,
            [string[]]$RelativePaths
        )

        $entries = @()
        foreach ($size in $Sizes) {
            $bitmap = New-ScaledTransparentBitmap -Image $Image -Size $size
            try {
                $entries += [PSCustomObject]@{
                    Size = $size
                    Data = [byte[]](Convert-BitmapToIconDib -Bitmap $bitmap)
                }
            }
            finally {
                $bitmap.Dispose()
            }
        }

        $stream = [System.IO.MemoryStream]::new()
        $writer = [System.IO.BinaryWriter]::new($stream)
        try {
            $writer.Write([int16]0)
            $writer.Write([int16]1)
            $writer.Write([int16]$entries.Count)

            $offset = 6 + (16 * $entries.Count)
            foreach ($entry in $entries) {
                $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
                $writer.Write([byte]$dimension)
                $writer.Write([byte]$dimension)
                $writer.Write([byte]0)
                $writer.Write([byte]0)
                $writer.Write([int16]1)
                $writer.Write([int16]32)
                $writer.Write([int]$entry.Data.Length)
                $writer.Write([int]$offset)
                $offset += $entry.Data.Length
            }

            foreach ($entry in $entries) {
                $writer.Write([byte[]]$entry.Data)
            }

            $writer.Flush()
            $iconBytes = $stream.ToArray()
        }
        finally {
            $writer.Dispose()
            $stream.Dispose()
        }

        foreach ($relativePath in $RelativePaths) {
            $targetPath = Join-Path $repoRoot $relativePath
            [System.IO.File]::WriteAllBytes($targetPath, $iconBytes)
        }
    }

    $webSizes = @(16, 32, 44, 48, 71, 150, 192, 256, 310, 384, 512, 1024)
    foreach ($size in $webSizes) {
        Save-TransparentPng `
            -Image $sourceImage `
            -Size $size `
            -RelativePath "public/ltc-sync-icon-20260729-$size.png"
    }

    Save-TransparentPng -Image $sourceImage -Size 1024 -RelativePath "public/app-icon.png"
    Save-TransparentPng -Image $sourceImage -Size 512 -RelativePath "public/app-icon-512.png"
    Save-TransparentPng -Image $sourceImage -Size 192 -RelativePath "public/app-icon-192.png"
    Save-TransparentPng -Image $sourceImage -Size 180 -RelativePath "public/apple-touch-icon.png"
    Save-TransparentPng -Image $sourceImage -Size 1024 -RelativePath "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

    $androidSizes = @{
        "mdpi" = 48
        "hdpi" = 72
        "xhdpi" = 96
        "xxhdpi" = 144
        "xxxhdpi" = 192
    }

    foreach ($density in $androidSizes.Keys) {
        $size = $androidSizes[$density]
        Save-TransparentPng `
            -Image $sourceImage `
            -Size $size `
            -RelativePath "android/app/src/main/res/mipmap-$density/ic_launcher.png"
        Save-TransparentPng `
            -Image $sourceImage `
            -Size $size `
            -RelativePath "android/app/src/main/res/mipmap-$density/ic_launcher_round.png"
    }

    Save-MultiSizeIcon `
        -Image $sourceImage `
        -Sizes @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256) `
        -RelativePaths @("public/favicon.ico", "public/favicon-v4.ico")
}
finally {
    $sourceImage.Dispose()
}

Write-Output "Generated transparent web, Windows, and Android icons from $Source."
