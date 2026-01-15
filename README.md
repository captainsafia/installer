# Installer (TypeScript/Node.js)

A GitHub release installer service, running on [Node.js](https://nodejs.org) with [Hono](https://hono.dev). This project is a port of [jpillora/installer](https://github.com/jpillora/installer).

The main branch of this repo is deployed to [i.captainsafia.sh](https://i.captainsafia.sh/).


## Usage

### Linux/macOS (Shell)

```sh
# Install <owner>/<repo> at a specific release
curl https://i.captainsafia.sh/<owner>/<repo>/<release> | sh

# Install latest release
curl https://i.captainsafia.sh/<owner>/<repo> | sh

# Install latest prerelease (preview)
curl https://i.captainsafia.sh/<owner>/<repo>/preview | sh

# Install to /usr/local/bin/ (with move flag)
curl "https://i.captainsafia.sh/<owner>/<repo>?move=1" | sh
```

### Windows (PowerShell)

```powershell
# Install latest release (auto-detects PowerShell via User-Agent)
irm https://i.captainsafia.sh/<owner>/<repo> | iex

# Install latest prerelease (preview)
irm https://i.captainsafia.sh/<owner>/<repo>/preview | iex

# Install specific release
irm https://i.captainsafia.sh/<owner>/<repo>/<release> | iex

# Explicit PowerShell script (use .ps1 extension)
irm https://i.captainsafia.sh/<owner>/<repo>.ps1 | iex
```

The installer automatically detects Windows assets (`.exe`, `.zip`) and generates a PowerShell script that:
- Downloads the appropriate binary for your architecture (x64, arm64)
- Extracts archives if needed (`.zip`, `.tar.gz`)
- Installs to `%LOCALAPPDATA%\<binary>\bin\`
- Adds the install directory to your user PATH

### Path API

#### Releases

```
/:owner/:repo/:release?
```

* `owner` - GitHub user or organization (**required**)
* `repo` - GitHub repository (**required**)
* `release` - Release tag (optional, defaults to `latest`, use `preview` for latest prerelease)

#### PR Artifacts

```
/:owner/:repo/pr/:prNumber
```

Download binaries from GitHub Actions workflow artifacts for a pull request. Requires authentication via `gh` CLI or `GITHUB_TOKEN`.

**Note:** Only artifacts from workflows with `pr-publish` in the filename (e.g., `.github/workflows/pr-publish.yml`) are resolved. The workflow must be triggered by a `pull_request` event.

```sh
# Install from PR #123
curl https://i.captainsafia.sh/<owner>/<repo>/pr/123 | sh
```

### Content Negotiation

The API returns different formats based on file extension, `Accept` header, or User-Agent:

| Extension / Accept Header / User-Agent | Response |
|----------------------------------------|----------|
| `*/*` (default) | Shell script (`text/x-shellscript`) |
| `.ps1` extension | PowerShell script (`text/plain`) |
| PowerShell User-Agent | PowerShell script (auto-detected) |
| `.sh` extension | Shell script (`text/x-shellscript`) |
| `.json` extension or `application/json` header | JSON with asset details |
| `.txt` extension or `text/plain` header | Plain text install instructions |

### Query Parameters

* `?move=1` - Install to `/usr/local/bin/` instead of `~/.{binary}/bin/`
* `?insecure=1` - Skip certificate checks
* `?as=` - Rename the binary
* `?select=` - Filter assets by name substring
* `?os=` - Override OS detection
* `?arch=` - Override architecture detection

### Install Location

By default, binaries are installed to `~/.{binaryName}/bin/{binaryName}`. For example, installing `lazygit` would save to `~/.lazygit/bin/lazygit`.

To add to your PATH:
```sh
export PATH="$HOME/.lazygit/bin:$PATH"
```

Use `?move=1` to install to `/usr/local/bin/` instead (may require sudo).

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (with hot reload)
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

## Testing

Tests use [Hurl](https://hurl.dev) for HTTP API testing.

```bash
# Start the server first
npm start &

# Run all tests
npm test

# Run specific test
hurl --test tests/uv.hurl
```

## Cloudflare Deployment

This app can be deployed to Cloudflare Workers:

```bash
# Install dependencies (includes wrangler)
npm install

# Run locally with Cloudflare Workers runtime
npm run dev:cf

# Deploy to Cloudflare Workers
npm run deploy
```

### Setting Secrets

```bash
# Set your GitHub token for higher API rate limits
wrangler secret put GITHUB_TOKEN
```

## Configuration

Configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTP_HOST` | Host to bind to | `0.0.0.0` |
| `PORT` | Port to listen on | `3000` |
| `USER` | Default GitHub user | `captainsafia` |
| `GITHUB_TOKEN` | GitHub API token (for rate limiting and PR artifacts) | N/A |
| `GH_TOKEN` | Alias for `GITHUB_TOKEN` | N/A |