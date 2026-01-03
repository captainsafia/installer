# Test Lazygit asset resolution
# Tests: 32-bit

GET http://localhost:3000/jesseduffield/lazygit/v0.55.0
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v0.55.0"
jsonpath "$.user" == "jesseduffield"
jsonpath "$.program" == "lazygit"

body contains "lazygit_0.55.0_darwin_x86_64.tar.gz"
body contains "lazygit_0.55.0_darwin_arm64.tar.gz"
body contains "lazygit_0.55.0_freebsd_32-bit.tar.gz"
body contains "lazygit_0.55.0_freebsd_x86_64.tar.gz"
body contains "lazygit_0.55.0_freebsd_armv6.tar.gz"
body contains "lazygit_0.55.0_freebsd_arm64.tar.gz"
body contains "lazygit_0.55.0_linux_32-bit.tar.gz"
body contains "lazygit_0.55.0_linux_x86_64.tar.gz"
body contains "lazygit_0.55.0_linux_armv6.tar.gz"
body contains "lazygit_0.55.0_linux_arm64.tar.gz"
