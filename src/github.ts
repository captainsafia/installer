import type { Config } from "./config";
import type { Query, Asset, QueryResult, GHAsset, GHRelease } from "./types";
import { getOS, getArch, getFileExt, checksumRe } from "./patterns";
import { hasM1, assetKey } from "./types";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

interface CacheEntry {
  result: QueryResult;
  timestamp: number;
}

export class GitHubClient {
  private config: Config;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: Config) {
    this.config = config;
  }

  private cacheKey(q: Query): string {
    return JSON.stringify(q);
  }

  private async fetch<T>(url: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (this.config.token) {
      headers["Authorization"] = `token ${this.config.token}`;
    }

    const resp = await fetch(url, { headers });
    if (resp.status === 404) {
      throw new Error(`not found: ${url}`);
    }
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`${resp.statusText} ${body}`);
    }
    return resp.json() as Promise<T>;
  }

  async execute(q: Query): Promise<QueryResult> {
    const key = this.cacheKey(q);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }

    const ts = new Date();
    let { release, assets } = await this.getAssetsNoCache(q);

    if (q.release === "" && release !== "") {
      console.log(`detected release: ${release}`);
      q.release = release;
    }

    const result: QueryResult = {
      ...q,
      resolvedRelease: release,
      timestamp: ts,
      assets,
      m1Asset: hasM1(assets),
    };

    this.cache.set(key, { result, timestamp: Date.now() });
    return result;
  }

  private async getAssetsNoCache(
    q: Query
  ): Promise<{ release: string; assets: Asset[] }> {
    const user = q.user;
    const repo = q.program;
    let release = q.release;

    console.log(`fetching asset info for ${user}/${repo}@${release}`);
    const baseUrl = `https://api.github.com/repos/${user}/${repo}/releases`;

    let ghas: GHAsset[] = [];

    if (release === "" || release === "latest") {
      const ghr = await this.fetch<GHRelease>(`${baseUrl}/latest`);
      release = ghr.tag_name;
      ghas = ghr.assets;
    } else if (release === "preview") {
      // fetch all releases and find the newest prerelease by published date
      const ghrs = await this.fetch<GHRelease[]>(baseUrl);
      let newestPrerelease: GHRelease | null = null;
      let newestTime: Date | null = null;

      for (const ghr of ghrs) {
        if (!ghr.prerelease) continue;
        const publishedAt = new Date(ghr.published_at);
        if (!newestPrerelease || publishedAt > newestTime!) {
          newestPrerelease = ghr;
          newestTime = publishedAt;
        }
      }

      if (!newestPrerelease) {
        throw new Error("no prerelease versions found");
      }
      release = newestPrerelease.tag_name;
      ghas = newestPrerelease.assets;
      console.log(
        `found newest prerelease: ${release} (published ${newestTime!.toISOString()})`
      );
    } else {
      const ghrs = await this.fetch<GHRelease[]>(baseUrl);
      const found = ghrs.find((ghr) => ghr.tag_name === release);
      if (!found) {
        throw new Error(`release tag '${release}' not found`);
      }
      ghas = found.assets;
    }

    if (ghas.length === 0) {
      throw new Error("no assets found");
    }

    const sumIndex = await this.getSumIndex(ghas);
    if (Object.keys(sumIndex).length > 0) {
      console.log(`fetched ${Object.keys(sumIndex).length} asset shasums`);
    }

    const candidates: Map<string, Asset> = new Map();
    const index: Map<string, Asset> = new Map();
    let foundLinuxAMD64 = false;

    for (const ga of ghas) {
      const url = ga.browser_download_url;
      let fext = getFileExt(url);
      if (fext === "" && ga.size > 1024 * 1024) {
        fext = ".bin"; // +1MB binary
      }

      const validExts = [
        ".bin",
        ".zip",
        ".tar.bz",
        ".tar.bz2",
        ".tar.xz",
        ".txz",
        ".bz2",
        ".gz",
        ".tar.gz",
        ".tgz",
      ];
      if (!validExts.includes(fext)) {
        console.log(
          `fetched asset has unsupported file type: ${ga.name} (ext '${fext}')`
        );
        continue;
      }

      let os = getOS(ga.name);
      let arch = getArch(ga.name);

      if (os === "windows") {
        console.log(`fetched asset is for windows: ${ga.name}`);
        continue;
      }

      if (os === "linux" && arch === "amd64") {
        foundLinuxAMD64 = true;
      }

      let assumedLinuxAsset = false;
      if (os === "") {
        assumedLinuxAsset = true;
        if (arch === "" || arch === "amd64") {
          if (foundLinuxAMD64) continue;
        }
      }
      if (arch === "") {
        arch = "amd64";
        if (os === "linux") {
          assumedLinuxAsset = true;
        }
      }

      if (q.select && !ga.name.includes(q.select)) {
        console.log(`select excludes asset: ${ga.name}`);
        continue;
      }

      const asset: Asset = {
        os,
        arch,
        name: ga.name,
        url,
        type: fext,
        sha256: sumIndex[ga.name] || "",
      };

      const key = assetKey(asset);

      if (assumedLinuxAsset) {
        if (key === "linux/") {
          candidates.delete("/amd64");
          foundLinuxAMD64 = true;
        } else if (candidates.has("linux/")) {
          continue;
        }
        candidates.set(key, asset);
        continue;
      }

      // prefer musl over glibc for portability
      if (index.has(key)) {
        const other = index.get(key)!;
        const gnu = (s: string) => s.includes("gnu");
        const musl = (s: string) => s.includes("musl");
        const g2m =
          gnu(other.name) &&
          !musl(other.name) &&
          !gnu(asset.name) &&
          musl(asset.name);
        if (!g2m) continue;
      }
      index.set(key, asset);
    }

    for (const [, cAsset] of candidates) {
      if (cAsset.os === "") {
        cAsset.os = "linux";
      }
      const indexKey = assetKey(cAsset);
      if (!index.has(indexKey)) {
        index.set(indexKey, cAsset);
      }
    }

    if (index.size === 0) {
      throw new Error("no downloads found for this release");
    }

    const assets = Array.from(index.values()).sort((a, b) =>
      assetKey(a).localeCompare(assetKey(b))
    );

    for (const a of assets) {
      console.log(`including asset: ${a.name} (${assetKey(a)})`);
    }

    return { release, assets };
  }

  private async getSumIndex(ghas: GHAsset[]): Promise<Record<string, string>> {
    let url = "";
    for (const ga of ghas) {
      if (this.isChecksumFile(ga)) {
        url = ga.browser_download_url;
        break;
      }
    }
    if (!url) return {};

    try {
      const resp = await fetch(url);
      if (!resp.ok) return {};
      const text = await resp.text();
      const index: Record<string, string> = {};
      for (const line of text.split("\n")) {
        const fields = line.trim().split(/\s+/);
        if (fields.length === 2) {
          index[fields[1]] = fields[0];
        }
      }
      return index;
    } catch {
      return {};
    }
  }

  private isChecksumFile(ga: GHAsset): boolean {
    return checksumRe.test(ga.name.toLowerCase()) && ga.size < 64 * 1024;
  }
}
