# Test Jid asset resolution
# Tests: 386

GET http://localhost:3000/simeji/jid/v0.7.6?type=json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v0.7.6"
jsonpath "$.user" == "simeji"
jsonpath "$.program" == "jid"

body contains "jid_darwin_386.zip"
body contains "jid_darwin_amd64.zip"
body contains "jid_freebsd_386.zip"
body contains "jid_freebsd_amd64.zip"
body contains "jid_linux_386.zip"
body contains "jid_linux_amd64.zip"
body contains "jid_linux_arm64.zip"
body contains "jid_netbsd_386.zip"
body contains "jid_netbsd_amd64.zip"
body contains "jid_openbsd_386.zip"
body contains "jid_openbsd_amd64.zip"
