# Test Gitleaks asset resolution
# Tests: x32, x64, armv6

GET http://localhost:3000/gitleaks/gitleaks/v8.28.0?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v8.28.0"
jsonpath "$.user" == "gitleaks"
jsonpath "$.program" == "gitleaks"

body contains "gitleaks_8.28.0_darwin_x64.tar.gz"
body contains "gitleaks_8.28.0_darwin_arm64.tar.gz"
body contains "gitleaks_8.28.0_linux_x32.tar.gz"
body contains "gitleaks_8.28.0_linux_x64.tar.gz"
body contains "gitleaks_8.28.0_linux_armv6.tar.gz"
body contains "gitleaks_8.28.0_linux_arm64.tar.gz"
