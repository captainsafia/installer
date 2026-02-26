#!/bin/bash
# Integration test script for the installer service
# Tests various permutations against localhost using the captainsafia/grove repo

BASE_URL="${BASE_URL:-http://localhost:8080}"
OWNER="captainsafia"
REPO="grove"
PASSED=0
FAILED=0
TESTS_RUN=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

# Test function that checks HTTP status and optionally content
test_request() {
    local description="$1"
    local url="$2"
    local expected_status="$3"
    local content_check="$4"
    local accept_header="${5:-}"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    local curl_opts="-s -w '%{http_code}' -o /tmp/test_response.txt"
    if [ -n "$accept_header" ]; then
        curl_opts="$curl_opts -H 'Accept: $accept_header'"
    fi
    
    local status
    status=$(eval "curl $curl_opts '$url'" | tr -d "'")
    local body
    body=$(cat /tmp/test_response.txt)
    
    if [ "$status" != "$expected_status" ]; then
        log_fail "$description - Expected status $expected_status, got $status"
        echo "    Response: ${body:0:200}"
        return 1
    fi
    
    if [ -n "$content_check" ]; then
        if ! echo "$body" | grep -q "$content_check"; then
            log_fail "$description - Content check failed: '$content_check' not found"
            echo "    Response: ${body:0:200}"
            return 1
        fi
    fi
    
    log_pass "$description"
    return 0
}

# Test that actually downloads and executes the shell script
test_script_execution() {
    local test_dir
    test_dir=$(mktemp -d -t installer-test-XXXXXXXXXX)
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    log_info "Downloading and executing install script to $test_dir..."
    
    # Download the script
    if ! curl -s "$BASE_URL/$OWNER/$REPO" -o "$test_dir/install.sh"; then
        log_fail "Script execution - Failed to download script"
        rm -rf "$test_dir"
        return 1
    fi
    
    # Verify the script is valid shell
    if ! head -1 "$test_dir/install.sh" | grep -q "#!/bin/sh"; then
        log_fail "Script execution - Downloaded file is not a valid shell script"
        rm -rf "$test_dir"
        return 1
    fi
    
    # Make it executable
    chmod +x "$test_dir/install.sh"
    
    # Execute the script (this will actually download and install the binary)
    # We run it in a subshell to capture output and avoid polluting our environment
    local output
    local exit_code
    
    # Set HOME to test_dir so the binary is installed there instead of real home
    output=$(HOME="$test_dir" bash "$test_dir/install.sh" 2>&1) || exit_code=$?
    exit_code=${exit_code:-0}
    
    if [ $exit_code -ne 0 ]; then
        log_fail "Script execution - Script exited with code $exit_code"
        echo "    Output: ${output:0:500}"
        rm -rf "$test_dir"
        return 1
    fi
    
    # Verify the binary was installed
    # The script should install to $HOME/.$PROG/bin/$PROG
    local expected_bin="$test_dir/.$REPO/bin/$REPO"
    if [ ! -f "$expected_bin" ]; then
        # Check if it might have been installed with a different structure
        local found_bin
        found_bin=$(find "$test_dir" -type f -executable -name "$REPO" 2>/dev/null | head -1)
        if [ -z "$found_bin" ]; then
            log_fail "Script execution - Binary not found at expected location: $expected_bin"
            echo "    Contents of test dir:"
            find "$test_dir" -type f 2>/dev/null | head -10
            rm -rf "$test_dir"
            return 1
        fi
        expected_bin="$found_bin"
    fi
    
    # Verify the binary is executable
    if [ ! -x "$expected_bin" ]; then
        log_fail "Script execution - Binary is not executable: $expected_bin"
        rm -rf "$test_dir"
        return 1
    fi
    
    # Verify the binary runs (try --version or --help or just run it)
    if ! "$expected_bin" --version > /dev/null 2>&1 && \
       ! "$expected_bin" --help > /dev/null 2>&1 && \
       ! "$expected_bin" -h > /dev/null 2>&1; then
        # Some binaries might not have --version/--help, just check it's a valid executable
        if ! file "$expected_bin" | grep -q "executable"; then
            log_fail "Script execution - Binary doesn't appear to be a valid executable"
            rm -rf "$test_dir"
            return 1
        fi
    fi
    
    log_pass "Script execution - Successfully downloaded and installed $REPO binary"
    
    # Cleanup
    rm -rf "$test_dir"
    return 0
}

# Wait for server to be ready
wait_for_server() {
    log_info "Waiting for server at $BASE_URL..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$BASE_URL/healthz" > /dev/null 2>&1; then
            log_info "Server is ready!"
            return 0
        fi
        ((attempt++))
        sleep 1
    done
    
    echo "Server failed to start within ${max_attempts}s"
    exit 1
}

# Main test suite
run_tests() {
    echo ""
    echo "=========================================="
    echo "  Installer Integration Tests"
    echo "  Target: $BASE_URL"
    echo "  Repo: $OWNER/$REPO"
    echo "=========================================="
    echo ""

    # Health check
    log_info "Testing health endpoints..."
    test_request "Health check endpoint" "$BASE_URL/healthz" "200" "OK"
    test_request "Favicon endpoint" "$BASE_URL/favicon.ico" "200"
    
    # Root redirect
    log_info "Testing root redirect..."
    test_request "Root redirects to GitHub" "$BASE_URL/" "301"
    
    # Basic release requests (shell script response)
    log_info "Testing basic release requests (shell script)..."
    test_request "Latest release (default)" "$BASE_URL/$OWNER/$REPO" "200" "#!/bin/sh"
    test_request "Latest release (explicit)" "$BASE_URL/$OWNER/$REPO/latest" "200" "#!/bin/sh"
    test_request "Specific version tag" "$BASE_URL/$OWNER/$REPO/v1.0.0" "200" "#!/bin/sh"
    test_request "Latest prerelease" "$BASE_URL/$OWNER/$REPO/preview" "200" "#!/bin/sh"

    
    # Move to path flag
    log_info "Testing move to path flag..."
    test_request "Move flag with !" "$BASE_URL/$OWNER/$REPO!" "200" 'OUT_DIR="/usr/local/bin"'
    test_request "Move flag with ! on release" "$BASE_URL/$OWNER/$REPO/latest!" "200" 'OUT_DIR="/usr/local/bin"'
    test_request "Move flag with query param" "$BASE_URL/$OWNER/$REPO?move=1" "200" 'OUT_DIR="/usr/local/bin"'
    
    # Content negotiation - JSON
    log_info "Testing content negotiation..."
    test_request "JSON response" "$BASE_URL/$OWNER/$REPO" "200" '"user"' "application/json"
    test_request "JSON has assets" "$BASE_URL/$OWNER/$REPO" "200" '"assets"' "application/json"
    test_request "JSON has release info" "$BASE_URL/$OWNER/$REPO" "200" '"resolvedRelease"' "application/json"
    
    # Content negotiation - Text
    test_request "Text response" "$BASE_URL/$OWNER/$REPO" "200" "$OWNER/$REPO" "text/plain"
    
    # Query parameters
    log_info "Testing query parameters..."
    test_request "OS override (linux)" "$BASE_URL/$OWNER/$REPO?os=linux" "200" 'OS="linux"'
    test_request "OS override (darwin)" "$BASE_URL/$OWNER/$REPO?os=darwin" "200" 'OS="darwin"'
    test_request "Arch override (amd64)" "$BASE_URL/$OWNER/$REPO?arch=amd64" "200" 'ARCH="amd64"'
    test_request "Arch override (arm64)" "$BASE_URL/$OWNER/$REPO?arch=arm64" "200" 'ARCH="arm64"'
    test_request "Combined OS and arch" "$BASE_URL/$OWNER/$REPO?os=linux&arch=arm64" "200" "linux"
    
    # As program flag
    test_request "As program rename" "$BASE_URL/$OWNER/$REPO?as=mygrove" "200" 'ASPROG="mygrove"'
    
    # Insecure flag
    test_request "Insecure flag" "$BASE_URL/$OWNER/$REPO?insecure=1" "200" 'INSECURE="true"'
    
    # Error handling
    log_info "Testing error handling..."
    test_request "Invalid owner (special chars)" "$BASE_URL/invalid%20owner/$REPO" "400" "Invalid"
    test_request "Non-existent repo (script)" "$BASE_URL/$OWNER/this-repo-definitely-does-not-exist-12345" "200" "exit 1"
    test_request "Non-existent repo (JSON)" "$BASE_URL/$OWNER/this-repo-definitely-does-not-exist-12345" "502" "not found" "application/json"
    
    # Execute the downloaded script (actual installation test)
    log_info "Testing actual script execution..."
    test_script_execution
    
    echo ""
    echo "=========================================="
    echo "  Test Results"
    echo "=========================================="
    echo -e "  ${GREEN}Passed:${NC} $PASSED"
    echo -e "  ${RED}Failed:${NC} $FAILED"
    echo "  Total:  $TESTS_RUN"
    echo "=========================================="
    echo ""
    
    if [ $FAILED -gt 0 ]; then
        exit 1
    fi
}

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --url)
            BASE_URL="$2"
            shift 2
            ;;
        --skip-wait)
            SKIP_WAIT=1
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --url URL      Base URL of the server (default: http://localhost:8080)"
            echo "  --skip-wait    Don't wait for server to be ready"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run tests
if [ -z "$SKIP_WAIT" ]; then
    wait_for_server
fi
run_tests
