# Test yt-dlp asset resolution
# Tests: no os, no arch, armv7

GET http://localhost:3000/yt-dlp/yt-dlp@2025.09.05?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "2025.09.05"
jsonpath "$.user" == "yt-dlp"
jsonpath "$.program" == "yt-dlp"

body contains "yt-dlp_macos"
body contains "yt-dlp_musllinux.zip"
body contains "yt-dlp_linux_armv7l.zip"
body contains "yt-dlp_linux_aarch64"
