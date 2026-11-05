param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-MewExtendedPath([string]$Value) {
  $full = [IO.Path]::GetFullPath($Value)
  if ($full.StartsWith('\\?\')) { return $full }
  if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
  return '\\?\' + $full
}
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
[IO.Directory]::CreateDirectory((Get-MewExtendedPath $root)) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead((Get-MewExtendedPath $Archive))
try {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $total = [long]0
  if ($zip.Entries.Count -gt 120000) { throw 'Desktop archive contains too many entries.' }
  # Validate every entry before writing anything. Do not use Expand-Archive:
  # native packages must reject links, Windows aliases, and path traversal.
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.TrimEnd('/')
    if (-not $name -or $name.Length -gt 1024 -or $name -match '[\\<>:"|?*\x00-\x1f]') { throw 'Invalid desktop archive path.' }
    foreach ($part in ($name -split '/')) {
      if (-not $part -or $part -eq '.' -or $part -eq '..' -or $part -match '[. ]$' -or $part -match '^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\.|$)') { throw 'Invalid desktop archive component.' }
    }
    if (-not $seen.Add($name)) { throw 'Duplicate desktop archive path.' }
    $kind = ($entry.ExternalAttributes -shr 16) -band 0xF000
    if ($kind -notin @(0, 0x8000, 0x4000) -or ($entry.ExternalAttributes -band 0x400)) { throw 'Desktop archive links are prohibited.' }
    $destinationPath = [IO.Path]::GetFullPath((Join-Path $root $name))
    if (-not $destinationPath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Desktop archive path escapes its destination.' }
    $total += $entry.Length
    if ($entry.Length -gt 1GB -or $total -gt 4GB) { throw 'Desktop archive exceeds its size limit.' }
  }
  $copiedTotal = [long]0
  foreach ($entry in $zip.Entries) {
    $file = Get-MewExtendedPath (Join-Path $root $entry.FullName)
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($file) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
    $source = $entry.Open()
    try {
      $output = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try {
        $buffer = New-Object byte[] 65536
        $copied = [long]0
        while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $copied += $count
          $copiedTotal += $count
          if ($copied -gt $entry.Length -or $copied -gt 1GB -or $copiedTotal -gt 4GB) { throw 'Desktop archive content exceeds its declared size.' }
          $output.Write($buffer, 0, $count)
        }
        if ($copied -ne $entry.Length) { throw 'Desktop archive content has an incorrect size.' }
      } finally { $output.Dispose() }
    } finally { $source.Dispose() }
  }
} finally { $zip.Dispose() }
