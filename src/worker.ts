import { createApp } from "./handler";
import type { Config } from "./config";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  USER?: string;
  GITHUB_TOKEN?: string;
  GH_TOKEN?: string;
  RATE_LIMITER?: RateLimiter;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Apply rate limiting if available (Cloudflare Workers only)
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Rate limit exceeded. Please try again later.", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }
    }

    const config: Config = {
      host: "0.0.0.0",
      port: 8080,
      user: env.USER || "captainsafia",
      token: env.GITHUB_TOKEN || env.GH_TOKEN || "",
    };

    const app = createApp(config);
    return app.fetch(request);
  },
};
