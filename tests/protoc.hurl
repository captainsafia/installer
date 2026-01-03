# Test Protoc asset resolution

GET http://localhost:3000/protocolbuffers/protobuf/v33.1
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v33.1"
jsonpath "$.user" == "protocolbuffers"
jsonpath "$.program" == "protobuf"

body contains "protoc-33.1-osx-universal_binary.zip"
body contains "protoc-33.1-osx-aarch_64.zip"
body contains "protoc-33.1-linux-x86_64.zip"
body contains "protoc-33.1-linux-x86_32.zip"
body contains "protoc-33.1-linux-aarch_64.zip"
body contains "protoc-33.1-linux-ppcle_64.zip"
body contains "protoc-33.1-linux-s390_64.zip"
