import type { Config } from "./config";
import type {
  Query,
  Asset,
  QueryResult,
  GHAsset,
  GHRelease,
  GHArtifactsResponse,
  GHWorkflowRunsResponse,
  GHPullRequest,
} from "./types";
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
      "User-Agent": "captainsafia/installer",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
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
    
    // Check if this is a PR artifact request
    const prMatch = q.release.match(/^pr#(\d+)$/);
    let release: string;
    let assets: Asset[];
    
    if (prMatch) {
      const prNumber = parseInt(prMatch[1], 10);
      ({ release, assets } = await this.getArtifactsForPR(q, prNumber));
    } else {
      ({ release, assets } = await this.getAssetsNoCache(q));
    }

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

  /**
   * Get assets from workflow artifacts for a given PR number.
   * This fetches the PR details to get the head branch, then finds
   * the most recent successful workflow run for that branch.
   */
  async getArtifactsForPR(
    q: Query,
    prNumber: number
  ): Promise<{ release: string; assets: Asset[] }> {
    const user = q.user;
    const repo = q.program;

    console.log(`fetching workflow artifacts for ${user}/${repo} PR #${prNumber}`);

    // Get PR details to find the head branch
    const prUrl = `https://api.github.com/repos/${user}/${repo}/pulls/${prNumber}`;
    const pr = await this.fetch<GHPullRequest>(prUrl);
    const headBranch = pr.head.ref;

    console.log(`PR #${prNumber} head branch: ${headBranch}`);

    // Find workflow runs for the head branch
    const runsUrl = `https://api.github.com/repos/${user}/${repo}/actions/runs?branch=${encodeURIComponent(headBranch)}&status=completed&per_page=100`;
    const runsResp = await this.fetch<GHWorkflowRunsResponse>(runsUrl);

    // Find runs that succeeded
    const successfulRuns = runsResp.workflow_runs.filter(
      (run) => run.conclusion === "success"
    );

    if (successfulRuns.length === 0) {
      throw new Error(`no successful workflow runs found for branch '${headBranch}'`);
    }

    // Sort by created_at descending to get the most recent first
    successfulRuns.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Iterate through successful runs to find one with usable artifacts
    // (there may be multiple workflows, e.g., "Build", "Test", "CI")
    let assets: Asset[] = [];
    let selectedRun: typeof successfulRuns[0] | null = null;

    for (const run of successfulRuns) {
      console.log(`checking workflow run ${run.id} (${run.name}) for artifacts...`);

      // Fetch artifacts for this run
      const artifactsUrl = `https://api.github.com/repos/${user}/${repo}/actions/runs/${run.id}/artifacts`;
      const artifactsResp = await this.fetch<GHArtifactsResponse>(artifactsUrl);

      if (artifactsResp.artifacts.length === 0) {
        console.log(`  no artifacts found, trying next run...`);
        continue;
      }

      // Filter out expired artifacts
      const validArtifacts = artifactsResp.artifacts.filter((a) => !a.expired);
      if (validArtifacts.length === 0) {
        console.log(`  all artifacts expired, trying next run...`);
        continue;
      }

      // Convert artifacts to assets
      const runAssets: Asset[] = [];
      for (const artifact of validArtifacts) {
        // Artifacts are always zip files
        const os = getOS(artifact.name);
        const arch = getArch(artifact.name);

        // Skip Windows artifacts
        if (os === "windows") {
          console.log(`  skipping windows artifact: ${artifact.name}`);
          continue;
        }

        const asset: Asset = {
          name: artifact.name,
          os: os || "linux", // Default to linux if unknown
          arch: arch || "amd64", // Default to amd64 if unknown
          url: artifact.archive_download_url,
          type: ".zip",
          sha256: "",
        };

        runAssets.push(asset);
      }

      if (runAssets.length > 0) {
        // Found a run with usable artifacts
        selectedRun = run;
        assets = runAssets;
        break;
      }

      console.log(`  no compatible artifacts, trying next run...`);
    }

    if (!selectedRun || assets.length === 0) {
      throw new Error(`no workflow runs with compatible artifacts found for branch '${headBranch}'`);
    }

    console.log(
      `using workflow run ${selectedRun.id} (${selectedRun.name}) with ${assets.length} artifact(s)`
    );

    for (const asset of assets) {
      console.log(`including artifact: ${asset.name} (${assetKey(asset)})`);
    }

    // Use PR number as the "release" identifier
    const release = `pr#${prNumber}`;
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
