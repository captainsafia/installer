# Test micro asset resolution

GET http://localhost:3000/zyedidia/micro
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.user" == "zyedidia"
jsonpath "$.program" == "micro"
body contains "micro-"

# Test micro with move flag
GET http://localhost:3000/zyedidia/micro?move=1
Accept: application/json
HTTP 200
[Asserts]
jsonpath "$.moveToPath" == true
