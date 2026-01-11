# Test PowerShell script generation
# Tests: Extension-based routing, PowerShell detection, Windows asset inclusion, error handling

# .ps1 extension should return PowerShell script (preferred approach)
GET http://localhost:3000/cli/cli.ps1
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"
body contains "$ErrorActionPreference"
body contains "Get-Architecture"
body contains "Invoke-WebRequest"

# .ps1 extension on release should also work
GET http://localhost:3000/cli/cli/v2.67.0.ps1
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"

# ?type=powershell should still work (backwards compatibility)
GET http://localhost:3000/cli/cli?type=powershell
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"

# ?type=ps1 should also return PowerShell script (backwards compatibility)
GET http://localhost:3000/cli/cli?type=ps1
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"

# PowerShell User-Agent should return PowerShell script
GET http://localhost:3000/cli/cli
User-Agent: Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.19041.1682
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"
body contains "windows"

# PowerShell Core User-Agent should also be detected
GET http://localhost:3000/cli/cli
User-Agent: Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.19045; en-US) PowerShell/7.4.1
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"

# JSON response should include Windows assets (using .json extension)
GET http://localhost:3000/cli/cli.json
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.program" == "cli"
body contains "windows"

# PowerShell script should include all Windows architectures
GET http://localhost:3000/cli/cli.ps1
HTTP 200
[Asserts]
body contains "amd64"
body contains "arm64"
body contains "386"
body contains ".zip"

# ?as= parameter should rename binary in PowerShell script
GET http://localhost:3000/cli/cli.ps1?as=github
HTTP 200
[Asserts]
body contains "$BinaryName = \"github\""
body contains "$BinaryName.exe"

# Specific version release should work with PowerShell extension
GET http://localhost:3000/cli/cli/v2.67.0.ps1
HTTP 200
[Asserts]
body contains "# PowerShell installer"
body contains "v2.67.0"

# Error response should be PowerShell-formatted when no Windows assets
# captainsafia/grove latest release only has Linux/macOS binaries
GET http://localhost:3000/captainsafia/grove.ps1
HTTP 200
[Asserts]
body contains "Write-Host"
body contains "No Windows assets available"

# captainsafia/grove preview release has Windows .exe asset
GET http://localhost:3000/captainsafia/grove/v1.3.0-preview.4d848d6.ps1
HTTP 200
[Asserts]
body contains "# PowerShell installer"
body contains "grove-windows-x64.exe"
body contains ".exe"

# .gz file type should be handled (jpillora/serve uses .gz for Windows)
GET http://localhost:3000/jpillora/serve.ps1
HTTP 200
[Asserts]
body contains "# PowerShell installer"
body contains ".gz"
body contains "GZipStream"

# .sh extension should return shell script
GET http://localhost:3000/cli/cli.sh
HTTP 200
[Asserts]
header "Content-Type" == "text/x-shellscript"
body contains "#!/bin/sh"

# .txt extension should return plain text
GET http://localhost:3000/cli/cli.txt
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "repository:"
body contains "program: cli"
