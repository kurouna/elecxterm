$vsPath = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717"
$sdkVersion = "10.0.26100.0"
$sdkPath = "C:\Program Files (x86)\Windows Kits\10"

# PATH
$env:Path = "$vsPath\bin\Hostx64\x64;$env:Path"

# INCLUDE
$env:INCLUDE = "$vsPath\include;$sdkPath\Include\$sdkVersion\ucrt;$sdkPath\Include\$sdkVersion\um;$sdkPath\Include\$sdkVersion\shared"

# LIB
$env:LIB = "$vsPath\lib\x64;$sdkPath\Lib\$sdkVersion\ucrt\x64;$sdkPath\Lib\$sdkVersion\um\x64"

Write-Host "Paths configured. Starting cargo build..."
cd src-tauri
cargo build
