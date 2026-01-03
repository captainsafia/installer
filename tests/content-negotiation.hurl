# Test content negotiation

# Default (no Accept header) should return shell script
GET http://localhost:3000/jpillora/serve
HTTP 200
[Asserts]
header "Content-Type" == "text/x-shellscript"
body contains "#!/bin/sh"
body contains "USER=\"jpillora\""

# Accept: application/json should return JSON
GET http://localhost:3000/jpillora/serve
Accept: application/json
HTTP 200
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.user" == "jpillora"
jsonpath "$.program" == "serve"

# Accept: text/plain should return plain text
GET http://localhost:3000/jpillora/serve
Accept: text/plain
HTTP 200
[Asserts]
header "Content-Type" contains "text/plain"
body not contains "#!/bin/sh"
body contains "jpillora/serve"

# Accept: text/html (unsupported) should default to shell script
GET http://localhost:3000/jpillora/serve
Accept: text/html
HTTP 200
[Asserts]
header "Content-Type" == "text/x-shellscript"
body contains "#!/bin/sh"

