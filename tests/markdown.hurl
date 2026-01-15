# Test Markdown rendering at root endpoint

# Request with text/markdown Accept header should return Markdown instructions
GET http://localhost:3000/
Accept: text/markdown
HTTP 200
[Asserts]
header "Content-Type" == "text/markdown; charset=utf-8"
body contains "# Installer"
body contains "## Usage"
body contains "curl https://i.safia.sh/<owner>/<repo> | sh"
body contains "## Examples"
body contains "## Query Parameters"
body contains "## Response Formats"

# Request with text/x-markdown Accept header should also return Markdown
GET http://localhost:3000/
Accept: text/x-markdown
HTTP 200
[Asserts]
header "Content-Type" == "text/markdown; charset=utf-8"
body contains "# Installer"

# Request without Markdown Accept header should redirect to GitHub
GET http://localhost:3000/
HTTP 301
[Asserts]
header "Location" == "https://github.com/captainsafia/installer"

