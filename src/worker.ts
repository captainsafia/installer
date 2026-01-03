import { createApp } from "./handler";
import type { Config } from "./config";

export interface Env {
  USER?: string;
  GITHUB_TOKEN?: string;
  GH_TOKEN?: string;
  FORCE_USER?: string;
  FORCE_REPO?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config: Config = {
      host: "0.0.0.0",
      port: 8080,
      user: env.USER || "captainsafia",
      token: env.GITHUB_TOKEN || env.GH_TOKEN || "",
      forceUser: env.FORCE_USER || "",
      forceRepo: env.FORCE_REPO || "",
    };

    const app = createApp(config);
    return app.fetch(request);
  },
};
