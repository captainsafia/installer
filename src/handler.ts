import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Config } from "./config";
import type { Query } from "./types";
import { GitHubClient } from "./github";
import { renderShellScript, renderTextScript } from "./templates";

const isTermRe = /^(curl|wget)\//i;
const errMsgRe = /[^A-Za-z0-9 :/.]/g;

export function createApp(config: Config): Hono {
  const app = new Hono();
  const client = new GitHubClient(config);

  // Health check
  app.get("/healthz", (c) => c.text("OK"));
  app.get("/favicon.ico", (c) => c.text("OK"));

  // Redirect root to GitHub
  app.get("/", (c) => c.redirect("https://github.com/captainsafia/installer", 301));

  // Main handler with path parameters: /:owner/:repo/:release?
  app.get("/:owner/:repo/:release?", async (c: Context) => {
    let owner = c.req.param("owner") || "";
    let repo = c.req.param("repo") || "";
    let release = c.req.param("release") || "latest";

    // Determine response type
    let qtype = c.req.query("type") || "";
    if (!qtype) {
      const ua = c.req.header("User-Agent") || "";
      if (isTermRe.test(ua)) {
        qtype = "script";
      } else {
        qtype = "text";
      }
    }

    const showError = (msg: string, code: ContentfulStatusCode) => {
      const cleaned = msg.replace(errMsgRe, "");
      const body = qtype === "script" ? `echo '${cleaned}'` : cleaned;
      return c.text(body, code);
    };

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

    // Build query
    const q: Query = {
      user: owner,
      program: repo,
      release: release,
      insecure: c.req.query("insecure") === "1",
      asProgram: c.req.query("as") || "",
      select: c.req.query("select") || "",
      os: c.req.query("os") || "",
      arch: c.req.query("arch") || "",
      moveToPath: moveToPath,
      search: false,
      sudoMove: false,
    };

    // Force user/repo from config
    if (config.forceUser) {
      q.user = config.forceUser;
    }
    if (config.forceRepo) {
      q.program = config.forceRepo;
    }

    // Validate query
    if (!q.program) {
      console.log(`invalid path: query:`, q);
      return showError("Invalid path", 400);
    }

    try {
      const result = await client.execute(q);

      switch (qtype) {
        case "json":
          c.header("Content-Type", "application/json");
          return c.json(result);
        case "script":
          c.header("Content-Type", "text/x-shellscript");
          return c.text(renderShellScript(result));
        case "text":
        default:
          c.header("Content-Type", "text/plain");
          return c.text(renderTextScript(result));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return showError(msg, 502);
    }
  });

  return app;
}
