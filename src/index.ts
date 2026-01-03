import { serve } from "@hono/node-server";
import { loadConfigFromEnv } from "./config";
import { createApp } from "./handler";

const config = loadConfigFromEnv();

console.log(`default user is '${config.user}'`);
if (config.token) {
  console.log("github token will be used for requests to api.github.com");
}

const app = createApp(config);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host || "0.0.0.0",
}, (info) => {
  console.log(`listening on ${info.address}:${info.port}...`);
});
