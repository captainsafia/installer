import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Config } from "./config";
import type { Query, QueryResult } from "./types";
import { GitHubClient } from "./github";
import { renderShellScript, renderTextScript } from "./templates";

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

type ResponseType = "json" | "script" | "text";

/** Determine response type from Accept header */
function getResponseType(c: Context): ResponseType {
  const accept = c.req.header("Accept") || "";
  if (accept.includes("application/json")) {
    return "json";
  } else if (accept.includes("text/plain")) {
    return "text";
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
  const body = responseType === "script" ? `echo '${cleaned}'` : cleaned;
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

  // PR artifacts handler: /:owner/:repo/pr/:prNumber
  app.get("/:owner/:repo/pr/:prNumber", async (c: Context) => {
    const owner = c.req.param("owner") || "";
    const repo = c.req.param("repo") || "";
    const prNumberStr = c.req.param("prNumber") || "";
    const responseType = getResponseType(c);

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
  app.get("/:owner/:repo/:release?", async (c: Context) => {
    const owner = c.req.param("owner") || "";
    let repo = c.req.param("repo") || "";
    let release = c.req.param("release") || "latest";
    const responseType = getResponseType(c);

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
