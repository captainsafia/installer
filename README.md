# Installer (TypeScript/Bun)

A TypeScript port of the [installer](https://github.com/jpillora/installer) service, running on [Bun](https://bun.sh) with [Hono](https://hono.dev).

## Quick Start

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Run production server
bun run start
```

## Configuration

Configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTP_HOST` | Host to bind to | `0.0.0.0` |
| `PORT` | Port to listen on | `3000` |
| `USER` | Default GitHub user | `jpillora` |
| `GITHUB_TOKEN` | GitHub API token (for rate limiting) | - |
| `GH_TOKEN` | Alias for `GITHUB_TOKEN` | - |
| `FORCE_USER` | Lock installer to a single user | - |
| `FORCE_REPO` | Lock installer to a single repo | - |

## Usage

```sh
# Install <user>/<repo> from GitHub
curl http://localhost:3000/<user>/<repo>@<release>! | bash

# Install latest release
curl http://localhost:3000/<user>/<repo>! | bash

# Install latest prerelease (preview)
curl http://localhost:3000/<user>/<repo>@preview! | bash
```

### Path API

* `user` - GitHub user (defaults to configured user)
* `repo` - GitHub repository (**required**)
* `release` - Release tag (defaults to `latest`, use `preview` for latest prerelease)
* `!` - When provided, installs to `/usr/local/bin/` instead of current directory

### Query Parameters

* `?type=` - Force response type: `script`, `json`, `text`, `ruby`
* `?insecure=1` - Skip certificate checks
* `?as=` - Rename the binary
* `?select=` - Filter assets by name substring
* `?os=` - Override OS detection
* `?arch=` - Override architecture detection

## Testing

Tests use [Hurl](https://hurl.dev) for HTTP API testing.

```bash
# Start the server first
bun run start &

# Run all tests
bun run test:hurl

# Run specific test
hurl --test tests/uv.hurl
```