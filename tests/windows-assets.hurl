# Test Windows asset resolution
# Tests: Windows assets are now included (not skipped), various formats

# GitHub CLI has Windows assets (zip format)
GET http://localhost:3000/cli/cli
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.program" == "cli"
# Windows assets should be included
body contains "windows_amd64"
body contains "windows_arm64"
body contains "windows_386"
body contains ".zip"

# Croc has Windows assets (zip format with different naming)
GET http://localhost:3000/schollz/croc/v10.2.4
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v10.2.4"
body contains "Windows"
body contains ".zip"

# UV has Windows assets (zip format)
GET http://localhost:3000/astral-sh/uv/0.9.24
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "0.9.24"
body contains "windows"

# Lazygit has Windows assets
GET http://localhost:3000/jesseduffield/lazygit/v0.55.0
Accept: application/json
HTTP 200
[Asserts]
body contains "windows"
