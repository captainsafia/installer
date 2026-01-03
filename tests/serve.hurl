# Test jpillora/serve asset resolution

GET http://localhost:3000/jpillora/serve?type=json
HTTP 200
[Asserts]
jsonpath "$.user" == "jpillora"
jsonpath "$.program" == "serve"

body contains "serve_1.9.8_linux_amd64.gz"
