import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Config } from "./config";
import type { Query, QueryResult } from "./types";
import { GitHubClient } from "./github";
import {
  renderShellScript,
  renderTextScript,
  renderPowerShellScript,
} from "./templates";

const errMsgRe = /[^A-Za-z0-9 :/.]/g;

// GitHub username/org: 1-39 chars, alphanumeric or hyphen, cannot start/end with hyphen
const githubOwnerPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
// GitHub repo: 1-100 chars, alphanumeric, hyphen, underscore, or dot
const githubRepoPattern = /^[a-zA-Z0-9._-]{1,100}$/;

function isValidGitHubOwner(name: string): boolean {
  return githubOwnerPattern.test(name);
}

function isValidGitHubRepo(name: string): boolean {
  // Repo names cannot be just dots
  if (name === "." || name === "..") return false;
  return githubRepoPattern.test(name);
}

type ResponseType = "json" | "script" | "powershell" | "text";

// Extension to response type mapping
const extensionTypeMap: Record<string, ResponseType> = {
  ".ps1": "powershell",
  ".sh": "script",
  ".json": "json",
  ".txt": "text",
};

/** Extract extension and base name from a path segment (e.g., "v1.0.0.ps1" -> ["v1.0.0", ".ps1"]) */
function extractExtension(s: string): [string, string] {
  const match = s.match(/^(.+?)(\.(?:ps1|sh|json|txt))$/i);
  if (match) {
    return [match[1], match[2].toLowerCase()];
  }
  return [s, ""];
}

/** Determine response type from extension, Accept header, or User-Agent */
function getResponseType(c: Context, extensionHint?: string): ResponseType {
  // Check for extension-based type first (highest priority)
  if (extensionHint && extensionTypeMap[extensionHint]) {
    return extensionTypeMap[extensionHint];
  }

  // Check Accept header
  const accept = c.req.header("Accept") || "";
  if (accept.includes("application/json")) {
    return "json";
  } else if (accept.includes("text/plain")) {
    return "text";
  }

  // Check User-Agent for PowerShell
  const userAgent = c.req.header("User-Agent") || "";
  if (userAgent.includes("PowerShell")) {
    return "powershell";
  }

  return "script";
}

/** Create an error response based on response type */
function createErrorResponse(
  c: Context,
  msg: string,
  code: ContentfulStatusCode,
  responseType: ResponseType
): Response {
  const cleaned = msg.replace(errMsgRe, "");
  let body: string;
  if (responseType === "script") {
    body = `echo '${cleaned}'`;
  } else if (responseType === "powershell") {
    body = `Write-Host "${cleaned}" -ForegroundColor Red; exit 1`;
  } else {
    body = cleaned;
  }
  return c.text(body, code);
}

/** Create a success response based on response type */
function createSuccessResponse(
  c: Context,
  result: QueryResult,
  responseType: ResponseType
): Response {
  switch (responseType) {
    case "json":
      return c.json(result);
    case "powershell":
      return new Response(renderPowerShellScript(result), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    case "script":
      return new Response(renderShellScript(result), {
        headers: { "Content-Type": "text/x-shellscript" },
      });
    case "text":
    default:
      return c.text(renderTextScript(result));
  }
}

/** Build common query parameters from request */
function buildQueryParams(c: Context): Partial<Query> {
  return {
    insecure: c.req.query("insecure") === "1",
    asProgram: c.req.query("as") || "",
    select: c.req.query("select") || "",
    os: c.req.query("os") || "",
    arch: c.req.query("arch") || "",
    search: false,
    sudoMove: false,
  };
}

export function createApp(config: Config): Hono {
  const app = new Hono();
  const client = new GitHubClient(config);

  // Health check
  app.get("/healthz", (c) => c.text("OK"));
  app.get("/favicon.ico", (c) => c.text("OK"));

  // Redirect root to GitHub
  app.get("/", (c) =>
    c.redirect("https://github.com/captainsafia/installer", 301)
  );

  // PR artifacts handler: /:owner/:repo/pr/:prNumber or /:owner/:repo/pr/:prNumber.ext
  app.get("/:owner/:repo/pr/:prNumber", async (c: Context) => {
    const owner = c.req.param("owner") || "";
    const repo = c.req.param("repo") || "";
    let prNumberStr = c.req.param("prNumber") || "";

    // Extract extension from PR number (e.g., "123.ps1" -> ["123", ".ps1"])
    const [prNumberBase, prExt] = extractExtension(prNumberStr);
    prNumberStr = prNumberBase;

    const responseType = getResponseType(c, prExt);

    // Validate owner and repo
    if (!isValidGitHubOwner(owner)) {
      return c.text("Invalid GitHub owner/organization name", 400);
    }
    if (!isValidGitHubRepo(repo)) {
      return c.text("Invalid GitHub repository name", 400);
    }

    // Validate PR number
    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      return c.text("Invalid PR number", 400);
    }

    const q: Query = {
      user: owner,
      program: repo,
      release: `pr#${prNumber}`,
      moveToPath: c.req.query("move") === "1",
      ...buildQueryParams(c),
    };

    try {
      const result = await client.execute(q);
      return createSuccessResponse(c, result, responseType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return createErrorResponse(c, msg, 502, responseType);
    }
  });

  // Main handler with path parameters: /:owner/:repo/:release?
  // Supports extension-based content negotiation: /:owner/:repo.ps1, /:owner/:repo/v1.0.0.ps1, etc.
  app.get("/:owner/:repo/:release?", async (c: Context) => {
    const owner = c.req.param("owner") || "";
    let repo = c.req.param("repo") || "";
    let release = c.req.param("release") || "";

    // Extract extension from release or repo (e.g., "v1.0.0.ps1" -> ["v1.0.0", ".ps1"])
    let detectedExt = "";
    if (release) {
      const [releaseBase, releaseExt] = extractExtension(release);
      if (releaseExt) {
        release = releaseBase;
        detectedExt = releaseExt;
      }
    } else {
      // No release specified, check if repo has extension (e.g., "cli.ps1")
      const [repoBase, repoExt] = extractExtension(repo);
      if (repoExt) {
        repo = repoBase;
        detectedExt = repoExt;
      }
    }

    // Default release to "latest" if not specified
    if (!release) {
      release = "latest";
    }

    const responseType = getResponseType(c, detectedExt);

    // Validate owner and repo before processing
    // Strip trailing ! from repo for validation (it's a valid modifier)
    const repoForValidation = repo.replace(/!+$/, "");
    if (!isValidGitHubOwner(owner)) {
      return c.text("Invalid GitHub owner/organization name", 400);
    }
    if (!isValidGitHubRepo(repoForValidation)) {
      return c.text("Invalid GitHub repository name", 400);
    }

    // Handle ! suffix for move to path (can be on repo or release)
    let moveToPath = c.req.query("move") === "1";
    if (release.endsWith("!")) {
      moveToPath = true;
      release = release.replace(/!+$/, "");
    }
    if (repo.endsWith("!")) {
      moveToPath = true;
      repo = repo.replace(/!+$/, "");
    }

    // If release was just "!", reset to latest
    if (!release) {
      release = "latest";
    }

    const q: Query = {
      user: owner,
      program: repo,
      release: release,
      moveToPath: moveToPath,
      ...buildQueryParams(c),
    };

    try {
      const result = await client.execute(q);
      return createSuccessResponse(c, result, responseType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return createErrorResponse(c, msg, 502, responseType);
    }
  });

  return app;
}
