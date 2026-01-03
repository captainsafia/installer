# Test Gitui asset resolution
# Tests: mac, x86

GET http://localhost:3000/gitui-org/gitui/v0.27.0?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v0.27.0"
jsonpath "$.user" == "gitui-org"
jsonpath "$.program" == "gitui"

body contains "gitui-mac-x86.tar.gz"
body contains "gitui-linux-x86_64.tar.gz"
body contains "gitui-linux-arm.tar.gz"
body contains "gitui-linux-aarch64.tar.gz"
