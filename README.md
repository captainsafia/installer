# Installer (TypeScript/Node.js)

A GitHub release installer service, running on [Node.js](https://nodejs.org) with [Hono](https://hono.dev). This project is a port of [jpillora/installer](https://github.com/jpillora/installer).

The main branch of this repo is deployed to [i.captainsafia.sh](https://i.captainsafia.sh/).

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
| `USER` | Default GitHub user | `jpillora` |
| `GITHUB_TOKEN` | GitHub API token (for rate limiting) | - |
| `GH_TOKEN` | Alias for `GITHUB_TOKEN` | - |
| `FORCE_USER` | Lock installer to a single user | - |
| `FORCE_REPO` | Lock installer to a single repo | - |

## Usage

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

### Path API

```
/:owner/:repo/:release?
```

* `owner` - GitHub user or organization (**required**)
* `repo` - GitHub repository (**required**)
* `release` - Release tag (optional, defaults to `latest`, use `preview` for latest prerelease)

### Query Parameters

* `?type=` - Force response type: `script`, `json`, `text`
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