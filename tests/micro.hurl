# Test micro asset resolution

GET http://localhost:3000/zyedidia/micro?type=json
HTTP 200
[Asserts]
jsonpath "$.user" == "zyedidia"
jsonpath "$.program" == "micro"
body contains "micro-"

# Test micro with move flag
GET http://localhost:3000/zyedidia/micro?type=json&move=1
HTTP 200
[Asserts]
jsonpath "$.moveToPath" == true
