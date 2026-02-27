import type { QueryResult, Asset } from "./types";
import { assetKey } from "./types";

// Markdown instructions template for the root endpoint
export function renderMarkdownInstructions(): string {
  return `# Installer

A simple HTTP service that generates shell scripts to install binaries from GitHub releases.

## Usage

### Shell (macOS/Linux)

\`\`\`bash
curl https://i.safia.sh/<owner>/<repo> | sh
\`\`\`

### PowerShell (Windows)

\`\`\`powershell
# Auto-detected via User-Agent
irm https://i.safia.sh/<owner>/<repo> | iex

# Explicit PowerShell script (use .ps1 extension)
irm https://i.safia.sh/<owner>/<repo>.ps1 | iex
\`\`\`

## Examples

Install the latest release:
\`\`\`bash
curl https://i.safia.sh/junegunn/fzf | sh
\`\`\`

Install a specific version:
\`\`\`bash
curl https://i.safia.sh/junegunn/fzf/v0.55.0 | sh
\`\`\`

Install and move to \`/usr/local/bin\` (use \`!\` suffix):
\`\`\`bash
curl https://i.safia.sh/junegunn/fzf! | sh
\`\`\`

## Query Parameters

| Parameter | Description |
|-----------|-------------|
| \`as\` | Rename the binary (e.g., \`?as=mybin\`) |
| \`move=1\` | Install to \`/usr/local/bin\` instead of \`~/.program/bin\` |
| \`os\` | Override detected OS (e.g., \`?os=linux\`) |
| \`arch\` | Override detected architecture (e.g., \`?arch=arm64\`) |
| \`select\` | Filter assets by pattern (e.g., \`?select=musl\`) |
| \`insecure=1\` | Skip TLS verification |

## Response Formats

The response format is determined by file extension, Accept header, or User-Agent:

| Extension | Accept Header | Description |
|-----------|--------------|-------------|
| \`.sh\` | - | Shell script (default) |
| \`.ps1\` | - | PowerShell script |
| \`.json\` | \`application/json\` | JSON response |
| \`.txt\` | \`text/plain\` | Human-readable text |

## PR Artifacts

Install artifacts from a pull request:
\`\`\`bash
curl https://i.safia.sh/<owner>/<repo>/pr/<number> | sh
\`\`\`

> Requires \`gh\` CLI or \`GITHUB_TOKEN\` environment variable.

## More Information

Visit [github.com/captainsafia/installer](https://github.com/captainsafia/installer) for full documentation.
`;
}

// Helper to filter Windows assets only
function getWindowsAssets(assets: Asset[]): Asset[] {
  return assets.filter((a) => a.os === "windows");
}

// Shell script template
export function renderShellScript(result: QueryResult): string {
  const isArtifact = result.release.startsWith("pr#");
  
  const assetCases = result.assets
    .map(
      (a) => `	"${a.os}_${a.arch}")
		URL="${a.url}"
		FTYPE="${a.type}"
		ASSET_NAME="${a.name}"
		ARTIFACT_NAME="${a.artifactName || a.name}"
		ARCHIVE_PATH="${a.archivePath || ""}"
		;;`
    )
    .join("\n");

  return `#!/bin/sh
if [ "$DEBUG" = "1" ]; then
	set -x
fi
TMP_DIR=$(mktemp -d -t installer-XXXXXXXXXX)
cleanup() {
	rm -rf "$TMP_DIR" > /dev/null
}
fail() {
	cleanup
	msg=$1
	echo "============"
	echo "Error: $msg" 1>&2
	exit 1
}
install_binary() {
	#settings
	USER="${result.user}"
	PROG="${result.program}"
	ASPROG="${result.asProgram}"
	MOVE="${result.moveToPath}"
	RELEASE="${result.release}" # ${result.resolvedRelease}
	INSECURE="${result.insecure}"
	#determine binary name for output directory
	BIN_NAME="$PROG"
	if [ -n "$ASPROG" ]; then
		BIN_NAME="$ASPROG"
	fi
	#set output directory: /usr/local/bin if move flag, otherwise ~/.{binaryName}/bin
	if [ "${result.moveToPath}" = "true" ]; then
		OUT_DIR="/usr/local/bin"
	else
		OUT_DIR="$HOME/.$BIN_NAME/bin"
	fi
	GH="https://github.com"
	#create output dir if it doesn't exist
	mkdir -p "$OUT_DIR" || fail "could not create output directory: $OUT_DIR"
	#dependency check, assume we are a standard POISX machine
	which find > /dev/null || fail "find not installed"
	which xargs > /dev/null || fail "xargs not installed"
	which sort > /dev/null || fail "sort not installed"
	which tail > /dev/null || fail "tail not installed"
	which cut > /dev/null || fail "cut not installed"
	which du > /dev/null || fail "du not installed"
	#choose an HTTP client
	GET=""
	if which curl > /dev/null; then
		GET="curl"
		if [ "$INSECURE" = "true" ]; then GET="$GET --insecure"; fi
		GET="$GET --fail -# -L"
	elif which wget > /dev/null; then
		GET="wget"
		if [ "$INSECURE" = "true" ]; then GET="$GET --no-check-certificate"; fi
		GET="$GET -qO-"
	else
		fail "neither wget/curl are installed"
	fi
	#debug HTTP
	if [ "$DEBUG" = "1" ]; then
		GET="$GET -v"
	fi
	#optional auth to install from private repos or artifacts
	AUTH="\${GITHUB_TOKEN}"
	if [ -z "$AUTH" ]; then
		AUTH="\${GH_TOKEN}"
	fi
	#check if gh CLI is available (preferred for PR artifacts)
	HAS_GH="false"
	if which gh > /dev/null 2>&1; then
		HAS_GH="true"
	fi
	#check if this is an artifact download
	IS_ARTIFACT="${result.release.startsWith("pr#") ? "true" : "false"}"
	if [ "$IS_ARTIFACT" = "true" ] && [ "$HAS_GH" = "false" ] && [ -z "$AUTH" ]; then
		fail "Either gh CLI or GITHUB_TOKEN is required to download PR artifacts"
	fi
	#find OS
	OS="${result.os}"
	if [ -n "$OS" ]; then
		echo "Override OS: $OS"
	else
		OS=$(uname -s | tr '[:upper:]' '[:lower:]')
		case "$OS" in
		darwin) OS="darwin";;
		linux) OS="linux";;
		*) fail "unknown os: $(uname -s)";;
		esac
	fi
	#find ARCH
	ARCH="${result.arch}"
	if [ -n "$ARCH" ]; then
		echo "Override architecture: $ARCH"
	elif [ "$OS" = "darwin" ] && sysctl hw.optional.arm64 2>/dev/null | grep -q ': 1'; then
		ARCH="arm64"
	elif uname -m | grep -E 'loong(arch)?64' > /dev/null; then
		ARCH="loong64"
	elif uname -m | grep -E '(aarch64|arm64)' > /dev/null; then
		ARCH="arm64"
		${
      !result.m1Asset
        ? `# no m1 assets. if on mac arm64, rosetta allows fallback to amd64
		if [ "$OS" = "darwin" ]; then
			ARCH="amd64"
		fi`
        : ""
    }
	elif uname -m | grep 64 > /dev/null; then
		ARCH="amd64"
	elif uname -m | grep arm > /dev/null; then
		ARCH="arm"
	elif uname -m | grep 386 > /dev/null; then
		ARCH="386"
	else
		fail "unknown arch: $(uname -m)"
	fi
	#choose from asset list
	URL=""
	FTYPE=""
	ASSET_NAME=""
	ARTIFACT_NAME=""
	ARCHIVE_PATH=""
	case "\${OS}_\${ARCH}" in
${assetCases}
	*) fail "No asset for platform \${OS}-\${ARCH}";;
	esac
	#add auth header if we have a token
	if [ -n "$AUTH" ]; then
		if echo "$GET" | grep -q "^curl"; then
			GET="$GET -H 'Authorization: token $AUTH'"
		else
			GET="$GET --header='Authorization: token $AUTH'"
		fi
	fi
	#add Accept header for GitHub API asset downloads (required for api.github.com URLs)
	if echo "$GET" | grep -q "^curl"; then
		GET="$GET -H 'Accept: application/octet-stream'"
	else
		GET="$GET --header='Accept: application/octet-stream'"
	fi
	#got URL! download it...
	echo -n "${result.moveToPath ? "Installing" : "Downloading"}"
	echo -n " $USER/$PROG"
	if [ -n "$RELEASE" ]; then
		echo -n " $RELEASE"
	fi
	if [ -n "$ASPROG" ]; then
		echo -n " as $ASPROG"
	fi
	echo -n " (\${OS}/\${ARCH})"
	${
    result.search
      ? `# web search, give time to cancel
	echo -n " in 5 seconds"
	for i in 1 2 3 4 5; do
		sleep 1
		echo -n "."
	done`
      : `echo "....."`
  }
	#enter tempdir
	mkdir -p "$TMP_DIR"
	cd "$TMP_DIR" || fail "cd to temp dir failed"
	#download the asset
	if [ "$IS_ARTIFACT" = "true" ] && [ "$HAS_GH" = "true" ]; then
		#use gh CLI for artifact downloads (handles auth automatically)
		echo "Using gh CLI to download artifact..."
		gh run download --repo "$USER/$PROG" --name "$ARTIFACT_NAME" --dir . || fail "gh download failed"
		#gh downloads artifacts as directories, find any zip files and extract them
		for zip in *.zip; do
			if [ -f "$zip" ]; then
				unzip -o -qq "$zip" || fail "unzip failed"
				rm "$zip"
			fi
		done
	elif [ "$FTYPE" = ".gz" ]; then
		which gzip > /dev/null || fail "gzip is not installed"
		sh -c "$GET $URL" | gzip -d - > "$PROG" || fail "download failed"
	elif [ "$FTYPE" = ".bz2" ]; then
		which bzip2 > /dev/null || fail "bzip2 is not installed"
		sh -c "$GET $URL" | bzip2 -d - > "$PROG" || fail "download failed"
	elif [ "$FTYPE" = ".tar.bz" ] || [ "$FTYPE" = ".tar.bz2" ]; then
		which tar > /dev/null || fail "tar is not installed"
		which bzip2 > /dev/null || fail "bzip2 is not installed"
		sh -c "$GET $URL" | tar jxf - || fail "download failed"
	elif [ "$FTYPE" = ".tar.gz" ] || [ "$FTYPE" = ".tgz" ]; then
		which tar > /dev/null || fail "tar is not installed"
		which gzip > /dev/null || fail "gzip is not installed"
		sh -c "$GET $URL" | tar zxf - || fail "download failed"
	elif [ "$FTYPE" = ".tar.xz" ] || [ "$FTYPE" = ".txz" ]; then
		which tar > /dev/null || fail "tar is not installed"
		which xz > /dev/null || fail "xz is not installed"
		sh -c "$GET $URL" | tar Jxf - || fail "download failed"
	elif [ "$FTYPE" = ".zip" ]; then
		which unzip > /dev/null || fail "unzip is not installed"
		sh -c "$GET $URL" > tmp.zip || fail "download failed"
		unzip -o -qq tmp.zip || fail "unzip failed"
		rm tmp.zip || fail "cleanup failed"
	elif [ "$FTYPE" = ".bin" ]; then
		sh -c "$GET $URL" > "${result.program}_\${OS}_\${ARCH}" || fail "download failed"
	else
		fail "unknown file type: $FTYPE"
	fi
	#prefer exact path for combined PR artifacts
	TMP_BIN=""
	if [ -n "$ARCHIVE_PATH" ]; then
		if [ -f "$ARCHIVE_PATH" ]; then
			TMP_BIN="$ARCHIVE_PATH"
		else
			ARCHIVE_BASE="\${ARCHIVE_PATH##*/}"
			TMP_BIN=$(find . -type f -name "$ARCHIVE_BASE" | xargs du | sort -n | tail -n 1 | cut -f 2)
		fi
	fi
	#fallback to largest file when no exact match is known
	if [ -z "$TMP_BIN" ]; then
		TMP_BIN=$(find . -type f | xargs du | sort -n | tail -n 1 | cut -f 2)
	fi
	if [ ! -f "$TMP_BIN" ]; then
		fail "could not find find binary (largest file)"
	fi
	#ensure its larger than 1MB
	SIZE=$(du -m "$TMP_BIN" | cut -f1)
	if [ "$SIZE" -lt 1 ]; then
		fail "no binary found ($TMP_BIN is not larger than 1MB)"
	fi
	#move into PATH or cwd
	chmod +x "$TMP_BIN" || fail "chmod +x failed"
	DEST="$OUT_DIR/$PROG"	
	if [ -n "$ASPROG" ]; then
		DEST="$OUT_DIR/$ASPROG"
	fi
	#move without sudo
	OUT=$(mv "$TMP_BIN" "$DEST" 2>&1)
	STATUS=$?
	if [ $STATUS -ne 0 ]; then
		if echo "$OUT" | grep -q "Permission denied"; then
			echo "mv with sudo..."
			sudo mv "$TMP_BIN" "$DEST" || fail "sudo mv failed" 
		else
			fail "mv failed ($OUT)"
		fi
	fi
	echo "${result.moveToPath ? "Installed at" : "Downloaded to"} $DEST"
	${
    !result.moveToPath
      ? `#suggest adding to PATH based on detected shell
	echo ""
	#detect shell
	SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "sh")
	case "$SHELL_NAME" in
		fish)
			SHELL_CONFIG="$HOME/.config/fish/config.fish"
			PATH_CMD='set -gx PATH $HOME/.'$BIN_NAME'/bin $PATH'
			;;
		zsh)
			SHELL_CONFIG="$HOME/.zshrc"
			PATH_CMD='export PATH="$HOME/.'$BIN_NAME'/bin:$PATH"'
			;;
		bash)
			#prefer .bashrc, fall back to .bash_profile
			if [ -f "$HOME/.bashrc" ]; then
				SHELL_CONFIG="$HOME/.bashrc"
			else
				SHELL_CONFIG="$HOME/.bash_profile"
			fi
			PATH_CMD='export PATH="$HOME/.'$BIN_NAME'/bin:$PATH"'
			;;
		*)
			SHELL_CONFIG="your shell config"
			PATH_CMD='export PATH="$HOME/.'$BIN_NAME'/bin:$PATH"'
			;;
	esac
	echo "To add to your PATH, add this to $SHELL_CONFIG:"
	echo "  $PATH_CMD"
	echo ""
	echo "Then restart your shell or run:"
	echo "  source $SHELL_CONFIG"
`
      : ""
  }
	#done
	cleanup
}
install_binary
`;
}

// Text template (human readable info)
export function renderTextScript(result: QueryResult): string {
  const assetLines = result.assets
    .map((a) => {
      let line = `  ${assetKey(a)}\n    url:    ${a.url}`;
      if (a.sha256) {
        line += `\n    sha256: ${a.sha256}`;
      }
      return line;
    })
    .join("\n");

  return `repository: https://github.com/${result.user}/${result.program}
user: ${result.user}
program: ${result.program}${result.asProgram ? `\nas: ${result.asProgram}` : ""}
release: ${result.resolvedRelease}
move-into-path: ${result.moveToPath}
sudo-move: ${result.sudoMove}
used-search: ${result.search}
asset-select: ${result.select}

release assets:
${assetLines}

has-m1-asset: ${result.m1Asset}

to see shell script, append ?type=script
for more information on this server, visit:
  github.com/captainsafia/installer
`;
}

// PowerShell script template for Windows
export function renderPowerShellScript(result: QueryResult): string {
  const windowsAssets = getWindowsAssets(result.assets);

  if (windowsAssets.length === 0) {
    return `Write-Host "Error: No Windows assets available for ${result.user}/${result.program}" -ForegroundColor Red
exit 1`;
  }

  // Build asset selection switch cases
  const assetCases = windowsAssets
    .map(
      (a) => `        "${a.arch}" {
            $Url = "${a.url}"
            $AssetName = "${a.name}"
            $DownloadName = "${a.artifactName || a.name}"
            $ArchivePath = "${a.archivePath || ""}"
            $FileType = "${a.type}"
        }`
    )
    .join("\n");

  // Determine binary name (with potential rename via asProgram)
  const binaryName = result.asProgram || result.program;

  return `# PowerShell installer for ${result.user}/${result.program}
# Generated by https://github.com/captainsafia/installer
#
# Usage: irm https://i.safia.sh/${result.user}/${result.program} | iex
# Usage with specific release: $env:RELEASE='${result.release}'; irm https://i.safia.sh/${result.user}/${result.program} | iex

$ErrorActionPreference = 'Stop'

# Configuration from server
$User = "${result.user}"
$Program = "${result.program}"
$BinaryName = "${binaryName}"
$Release = "${result.resolvedRelease}"
$MoveToPath = $${result.moveToPath ? "true" : "false"}

# Allow environment variable overrides
if ($env:RELEASE) { $Release = $env:RELEASE }

# Determine install directory
$InstallDir = if ($MoveToPath) {
    # Install to a common location (requires running as admin for Program Files)
    Join-Path $env:LOCALAPPDATA "$BinaryName\\bin"
} else {
    Join-Path $env:LOCALAPPDATA "$BinaryName\\bin"
}

function Get-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        "X64" { return "amd64" }
        "Arm64" { return "arm64" }
        "X86" { return "386" }
        default { return "unknown" }
    }
}

function Add-ToUserPath {
    param([string]$Path)
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$Path*") {
        $newPath = "$currentPath;$Path"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        return $true
    }
    return $false
}

function Main {
    Write-Host "Installing $User/$Program..." -ForegroundColor Green
    Write-Host ""

    # Detect architecture
    $Arch = Get-Architecture
    if ($Arch -eq "unknown") {
        Write-Host "Error: Unsupported architecture" -ForegroundColor Red
        exit 1
    }

    Write-Host "Detected: windows-$Arch"

    # Select asset based on architecture
    $Url = $null
    $AssetName = $null
    $DownloadName = $null
    $ArchivePath = $null
    $FileType = $null

    switch ($Arch) {
${assetCases}
        default {
            Write-Host "Error: No asset available for architecture: $Arch" -ForegroundColor Red
            exit 1
        }
    }

    if (-not $Url) {
        Write-Host "Error: Could not determine download URL" -ForegroundColor Red
        exit 1
    }

    Write-Host "Release: $Release"
    Write-Host "Downloading $AssetName..."

    # Create install directory
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # Set up authentication headers if token available
    $Headers = @{
        "Accept" = "application/octet-stream"
        "User-Agent" = "PowerShell-Installer"
    }
    $Token = if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } elseif ($env:GH_TOKEN) { $env:GH_TOKEN } else { $null }
    if ($Token) {
        $Headers["Authorization"] = "Bearer $Token"
    }

    # Download to temp location
    $TempDir = Join-Path $env:TEMP "installer-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    try {
        $TempFile = Join-Path $TempDir $DownloadName
        Invoke-WebRequest -Uri $Url -OutFile $TempFile -Headers $Headers -ErrorAction Stop

        # Handle different file types
        $BinaryPath = $null
        switch ($FileType) {
            ".exe" {
                # Direct executable
                $BinaryPath = $TempFile
            }
            ".zip" {
                # Extract zip
                $ExtractDir = Join-Path $TempDir "extracted"
                Expand-Archive -Path $TempFile -DestinationPath $ExtractDir -Force
                if ($ArchivePath) {
                    $ExpectedPath = Join-Path $ExtractDir $ArchivePath
                    if (Test-Path $ExpectedPath) {
                        $BinaryPath = $ExpectedPath
                    } else {
                        $ArchiveLeaf = Split-Path $ArchivePath -Leaf
                        $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -File -Filter $ArchiveLeaf |
                            Sort-Object Length -Descending |
                            Select-Object -First 1 |
                            ForEach-Object { $_.FullName }
                    }
                }
                # Find the largest .exe file (the binary)
                if (-not $BinaryPath) {
                    $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -Filter "*.exe" |
                        Sort-Object Length -Descending |
                        Select-Object -First 1 |
                        ForEach-Object { $_.FullName }
                }
                if (-not $BinaryPath) {
                    # No .exe found, look for largest file
                    $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -File |
                        Sort-Object Length -Descending |
                        Select-Object -First 1 |
                        ForEach-Object { $_.FullName }
                }
            }
            ".tar.gz" {
                # Extract tar.gz (requires tar, available in Windows 10+)
                $ExtractDir = Join-Path $TempDir "extracted"
                New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null
                tar -xzf $TempFile -C $ExtractDir
                # Find the largest .exe file
                $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -Filter "*.exe" |
                    Sort-Object Length -Descending |
                    Select-Object -First 1 |
                    ForEach-Object { $_.FullName }
                if (-not $BinaryPath) {
                    $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -File |
                        Sort-Object Length -Descending |
                        Select-Object -First 1 |
                        ForEach-Object { $_.FullName }
                }
            }
            ".tgz" {
                # Same as .tar.gz
                $ExtractDir = Join-Path $TempDir "extracted"
                New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null
                tar -xzf $TempFile -C $ExtractDir
                $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -Filter "*.exe" |
                    Sort-Object Length -Descending |
                    Select-Object -First 1 |
                    ForEach-Object { $_.FullName }
                if (-not $BinaryPath) {
                    $BinaryPath = Get-ChildItem -Path $ExtractDir -Recurse -File |
                        Sort-Object Length -Descending |
                        Select-Object -First 1 |
                        ForEach-Object { $_.FullName }
                }
            }
            ".gz" {
                # Decompress gzip (single file, not tar)
                # Use .NET GZipStream for decompression
                $DecompressedFile = Join-Path $TempDir "$BinaryName.exe"
                $inStream = [System.IO.File]::OpenRead($TempFile)
                $gzStream = New-Object System.IO.Compression.GZipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
                $outStream = [System.IO.File]::Create($DecompressedFile)
                $gzStream.CopyTo($outStream)
                $outStream.Close()
                $gzStream.Close()
                $inStream.Close()
                $BinaryPath = $DecompressedFile
            }
            ".bin" {
                # Direct binary file
                $BinaryPath = $TempFile
            }
            default {
                # Assume it's an executable
                $BinaryPath = $TempFile
            }
        }

        if (-not $BinaryPath -or -not (Test-Path $BinaryPath)) {
            Write-Host "Error: Could not find binary in downloaded archive" -ForegroundColor Red
            exit 1
        }

        # Move to install location
        $DestPath = Join-Path $InstallDir "$BinaryName.exe"
        Move-Item -Path $BinaryPath -Destination $DestPath -Force

        Write-Host ""
        Write-Host "Installed to $DestPath" -ForegroundColor Green
        Write-Host ""

        # Add to PATH if not already there
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($currentPath -notlike "*$InstallDir*") {
            $added = Add-ToUserPath -Path $InstallDir
            if ($added) {
                Write-Host "Added $InstallDir to your PATH." -ForegroundColor Cyan
                Write-Host ""
                Write-Host "Please restart your terminal, then run '$BinaryName --help' to get started."
            }
        } else {
            Write-Host "$BinaryName is ready to use! Run '$BinaryName --help' to get started."
        }

    } finally {
        # Cleanup temp directory
        if (Test-Path $TempDir) {
            Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Main
`;
}
