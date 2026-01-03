import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Config } from "./config";
import type { Query } from "./types";
import { GitHubClient } from "./github";
import { splitHalf } from "./patterns";
import { renderShellScript, renderTextScript } from "./templates";

const isTermRe = /^(curl|wget)\//i;
const errMsgRe = /[^A-Za-z0-9 :/.]/g;

export function createApp(config: Config): Hono {
  const app = new Hono();
  const client = new GitHubClient(config);

  // Health check
  app.get("/healthz", (c) => c.text("OK"));
  app.get("/favicon.ico", (c) => c.text("OK"));

  // Main handler
  app.get("/*", async (c: Context) => {
    const path = c.req.path;

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

    // Parse path
    let pathStr = path.replace(/^\//, "");

    // Build query
    const q: Query = {
      user: "",
      program: "",
      release: "",
      insecure: c.req.query("insecure") === "1",
      asProgram: c.req.query("as") || "",
      select: c.req.query("select") || "",
      os: c.req.query("os") || "",
      arch: c.req.query("arch") || "",
      moveToPath: false,
      search: false,
      sudoMove: false,
    };

    // Move to path with !
    if (pathStr.endsWith("!")) {
      q.moveToPath = true;
      pathStr = pathStr.replace(/!+$/, "");
    }
    if (c.req.query("move") === "1") {
      q.moveToPath = true;
    }

    let rest: string;
    [q.user, rest] = splitHalf(pathStr, "/");
    [q.program, q.release] = splitHalf(rest, "@");

    // No program? treat first part as program, use default user
    if (!q.program) {
      q.program = q.user;
      q.user = "";
      q.search = true;
    }

    if (!q.release) {
      q.release = "latest";
    }

    // micro > nano!
    if (!q.user && q.program === "micro") {
      q.user = "zyedidia";
    }

    // Still no user? use default
    if (!q.user) {
      q.user = config.user;
    }

    // Force user/repo
    if (config.forceUser) {
      q.user = config.forceUser;
    }
    if (config.forceRepo) {
      q.program = config.forceRepo;
    }

    // Validate query
    if (!q.program) {
      if (!pathStr) {
        return c.redirect("https://github.com/captainsafia/installer", 301);
      }
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
