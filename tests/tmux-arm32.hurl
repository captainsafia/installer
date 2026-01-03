# Test tmux arm32 detection
# arm32 should be detected as arm (32-bit ARM architecture)

GET http://localhost:3000/jpillora/tmux-static-builds/v3.5i
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.resolvedRelease" == "v3.5i"
jsonpath "$.user" == "jpillora"
jsonpath "$.program" == "tmux-static-builds"

body contains "tmux.linux-arm32.gz"
