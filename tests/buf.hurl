# Test Buf asset resolution

GET http://localhost:3000/bufbuild/buf@v1.60.0?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v1.60.0"
jsonpath "$.user" == "bufbuild"
jsonpath "$.program" == "buf"

body contains "buf-Darwin-x86_64"
body contains "buf-Darwin-arm64"
body contains "buf-Linux-x86_64"
body contains "buf-Linux-aarch64"
body contains "buf-Linux-armv7"
body contains "buf-Linux-ppc64le"
body contains "buf-Linux-riscv64"
body contains "buf-Linux-s390x"
