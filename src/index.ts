import { loadConfigFromEnv } from "./config";
import { createApp } from "./handler";

const config = loadConfigFromEnv();

console.log(`default user is '${config.user}'`);
if (config.token) {
  console.log("github token will be used for requests to api.github.com");
}
if (config.forceUser) {
  console.log(`locked user to '${config.forceUser}'`);
}
if (config.forceRepo) {
  console.log(`locked repo to '${config.forceRepo}'`);
}

const app = createApp(config);

const server = Bun.serve({
  port: config.port,
  hostname: config.host || "0.0.0.0",
  fetch: app.fetch,
});

console.log(`listening on ${server.hostname}:${server.port}...`);
