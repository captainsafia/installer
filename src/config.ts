export interface Config {
  host: string;
  port: number;
  user: string;
  token: string;
  forceUser: string;
  forceRepo: string;
}

export const defaultConfig: Config = {
  host: "",
  port: 3000,
  user: "jpillora",
  token: "",
  forceUser: "",
  forceRepo: "",
};

export function loadConfigFromEnv(): Config {
  return {
    host: process.env.HTTP_HOST || defaultConfig.host,
    port: parseInt(process.env.PORT || String(defaultConfig.port), 10),
    user: process.env.USER || defaultConfig.user,
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || defaultConfig.token,
    forceUser: process.env.FORCE_USER || defaultConfig.forceUser,
    forceRepo: process.env.FORCE_REPO || defaultConfig.forceRepo,
  };
}
