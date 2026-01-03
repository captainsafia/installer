# Test UV asset resolution
# Tests: musl over GNU, many architectures, i686, arch long names

GET http://localhost:3000/astral-sh/uv@0.8.17?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "0.8.17"
jsonpath "$.user" == "astral-sh"
jsonpath "$.program" == "uv"

# Check that expected assets are present in the response body
body contains "uv-x86_64-unknown-linux-musl.tar.gz"
body contains "uv-aarch64-unknown-linux-musl.tar.gz"
body contains "uv-x86_64-apple-darwin.tar.gz"
body contains "uv-aarch64-apple-darwin.tar.gz"
body contains "uv-i686-unknown-linux-musl.tar.gz"
body contains "uv-arm-unknown-linux-musleabihf.tar.gz"
body contains "uv-loongarch64-unknown-linux-gnu.tar.gz"
body contains "uv-powerpc64-unknown-linux-gnu.tar.gz"
body contains "uv-powerpc64le-unknown-linux-gnu.tar.gz"
body contains "uv-riscv64gc-unknown-linux-gnu.tar.gz"
body contains "uv-s390x-unknown-linux-gnu.tar.gz"
