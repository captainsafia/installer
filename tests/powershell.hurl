# Test PowerShell script generation
# Tests: PowerShell detection, Windows asset inclusion, error handling

# ?type=powershell should return PowerShell script
GET http://localhost:3000/cli/cli?type=powershell
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body contains "# PowerShell installer"
body contains "$ErrorActionPreference"
body contains "Get-Architecture"
body contains "Invoke-WebRequest"

# ?type=ps1 should also return PowerShell script
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

# JSON response should include Windows assets
GET http://localhost:3000/cli/cli
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.program" == "cli"
body contains "windows"

# PowerShell script should include all Windows architectures
GET http://localhost:3000/cli/cli?type=powershell
HTTP 200
[Asserts]
body contains "amd64"
body contains "arm64"
body contains "386"
body contains ".zip"

# ?as= parameter should rename binary in PowerShell script
GET http://localhost:3000/cli/cli?type=powershell&as=github
HTTP 200
[Asserts]
body contains "$BinaryName = \"github\""
body contains "github.exe"

# Preview release should work with PowerShell
GET http://localhost:3000/cli/cli/preview?type=powershell
HTTP 200
[Asserts]
body contains "# PowerShell installer"

# Error response should be PowerShell-formatted when no Windows assets
# captainsafia/grove only has Linux/macOS binaries
GET http://localhost:3000/captainsafia/grove?type=powershell
HTTP 200
[Asserts]
body contains "Write-Host"
body contains "No Windows assets available"

# .gz file type should be handled (jpillora/serve uses .gz for Windows)
GET http://localhost:3000/jpillora/serve?type=powershell
HTTP 200
[Asserts]
body contains "# PowerShell installer"
body contains ".gz"
body contains "GZipStream"
