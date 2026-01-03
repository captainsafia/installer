# Test Croc asset resolution
# Tests: 32bit, 64bit

GET http://localhost:3000/schollz/croc@v10.2.4?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v10.2.4"
jsonpath "$.user" == "schollz"
jsonpath "$.program" == "croc"

body contains "croc_v10.2.4_macOS-64bit.tar.gz"
body contains "croc_v10.2.4_macOS-ARM64.tar.gz"
body contains "croc_v10.2.4_DragonFlyBSD-64bit.tar.gz"
body contains "croc_v10.2.4_FreeBSD-64bit.tar.gz"
body contains "croc_v10.2.4_FreeBSD-ARM64.tar.gz"
body contains "croc_v10.2.4_Linux-32bit.tar.gz"
body contains "croc_v10.2.4_Linux-64bit.tar.gz"
body contains "croc_v10.2.4_Linux-ARM.tar.gz"
body contains "croc_v10.2.4_Linux-ARM64.tar.gz"
body contains "croc_v10.2.4_NetBSD-32bit.tar.gz"
body contains "croc_v10.2.4_NetBSD-64bit.tar.gz"
body contains "croc_v10.2.4_NetBSD-ARM64.tar.gz"
body contains "croc_v10.2.4_OpenBSD-64bit.tar.gz"
body contains "croc_v10.2.4_OpenBSD-ARM64.tar.gz"
