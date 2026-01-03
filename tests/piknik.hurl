# Test Piknik asset resolution
# Tests: macos, dragonflybsd, freebsd, netbsd, openbsd, no arch, i386, arm

GET http://localhost:3000/jedisct1/piknik/0.10.2?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "0.10.2"
jsonpath "$.user" == "jedisct1"
jsonpath "$.program" == "piknik"

body contains "piknik-macos-0.10.2.tar.gz"
body contains "piknik-dragonflybsd_amd64-0.10.2.tar.gz"
body contains "piknik-freebsd_i386-0.10.2.tar.gz"
body contains "piknik-freebsd_amd64-0.10.2.tar.gz"
body contains "piknik-linux_i386-0.10.2.tar.gz"
body contains "piknik-linux_x86_64-0.10.2.tar.gz"
body contains "piknik-linux_arm-0.10.2.tar.gz"
body contains "piknik-netbsd_i386-0.10.2.tar.gz"
body contains "piknik-netbsd_amd64-0.10.2.tar.gz"
body contains "piknik-openbsd_i386-0.10.2.tar.gz"
body contains "piknik-openbsd_amd64-0.10.2.tar.gz"
