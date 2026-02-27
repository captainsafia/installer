import type { Config } from "./config";
import type {
  Query,
  Asset,
  QueryResult,
  GHAsset,
  GHRelease,
  GHArtifact,
  GHArtifactsResponse,
  GHWorkflowRunsResponse,
  GHPullRequest,
} from "./types";
import { getOS, getArch, getFileExt, checksumRe } from "./patterns";
import { hasM1, assetKey } from "./types";
import { LRUCache } from "lru-cache";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms
const CACHE_MAX_SIZE = 1000; // Maximum number of entries

export class GitHubClient {
  private config: Config;
  private cache = new LRUCache<string, QueryResult>({
    max: CACHE_MAX_SIZE,
    ttl: CACHE_TTL,
  });

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
    if (cached) {
      return cached;
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

    this.cache.set(key, result);
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
      try {
        const ghr = await this.fetch<GHRelease>(
          `${baseUrl}/tags/${encodeURIComponent(release)}`
        );
        release = ghr.tag_name;
        ghas = ghr.assets;
      } catch {
        throw new Error(`release tag '${release}' not found`);
      }
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
      // Use the API URL which supports Accept: application/octet-stream for downloads
      const url = ga.url;
      let fext = getFileExt(ga.name);
      if (fext === "" && ga.size > 1024 * 1024) {
        fext = ".bin"; // +1MB binary
      }

      const validExts = [
        ".bin",
        ".exe",
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

    // Find runs that succeeded, triggered by pull_request event, and have pr-publish in path
    // Path format: '.github/workflows/pr-publish.yml'
    const prPublishPattern = /pr[\s_-]?publish/i;
    const successfulRuns = runsResp.workflow_runs.filter(
      (run) =>
        run.conclusion === "success" &&
        (run.event === "pull_request" || run.event === "pull_request_target") &&
        prPublishPattern.test(run.path)
    );

    if (successfulRuns.length === 0) {
      throw new Error(`no successful 'pr-publish' workflow runs found for branch '${headBranch}'`);
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
        const expandedAssets = await this.expandWorkflowArtifact(artifact);
        for (const asset of expandedAssets) {
          if (q.select && !asset.name.includes(q.select)) {
            console.log(`select excludes artifact: ${asset.name}`);
            continue;
          }
          runAssets.push(asset);
        }
      }

      const uniqueAssets = new Map<string, Asset>();
      for (const asset of runAssets) {
        const key = assetKey(asset);
        if (!uniqueAssets.has(key)) {
          uniqueAssets.set(key, asset);
        }
      }

      if (uniqueAssets.size > 0) {
        // Found a run with usable artifacts
        selectedRun = run;
        assets = Array.from(uniqueAssets.values()).sort((a, b) =>
          assetKey(a).localeCompare(assetKey(b))
        );
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

  private async fetchBinary(url: string): Promise<Uint8Array> {
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
      "User-Agent": "captainsafia/installer",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }

    const resp = await fetch(url, { headers, redirect: "follow" });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`${resp.statusText} ${body}`);
    }

    return new Uint8Array(await resp.arrayBuffer());
  }

  private listZipEntries(zipData: Uint8Array): string[] {
    const view = new DataView(
      zipData.buffer,
      zipData.byteOffset,
      zipData.byteLength
    );
    const minEocdSize = 22;
    const maxCommentSize = 0xffff;
    const eocdSignature = 0x06054b50;
    const centralDirectorySignature = 0x02014b50;

    let eocdOffset = -1;
    const searchStart = Math.max(0, zipData.byteLength - minEocdSize - maxCommentSize);
    for (let i = zipData.byteLength - minEocdSize; i >= searchStart; i--) {
      if (view.getUint32(i, true) === eocdSignature) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error("invalid zip: end-of-central-directory record not found");
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder("utf-8");
    const entries: string[] = [];

    let offset = centralDirectoryOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (offset + 46 > zipData.byteLength) {
        throw new Error("invalid zip: central directory entry overflow");
      }
      if (view.getUint32(offset, true) !== centralDirectorySignature) {
        throw new Error("invalid zip: central directory signature mismatch");
      }

      const fileNameLength = view.getUint16(offset + 28, true);
      const extraFieldLength = view.getUint16(offset + 30, true);
      const fileCommentLength = view.getUint16(offset + 32, true);

      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > zipData.byteLength) {
        throw new Error("invalid zip: file name overflow");
      }

      const fileName = decoder.decode(zipData.subarray(fileNameStart, fileNameEnd));
      if (fileName && !fileName.endsWith("/")) {
        entries.push(fileName);
      }

      offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    return entries;
  }

  private async expandWorkflowArtifact(artifact: GHArtifact): Promise<Asset[]> {
    const os = getOS(artifact.name);
    const arch = getArch(artifact.name);

    if (os !== "" && arch !== "") {
      return [
        {
          name: artifact.name,
          os,
          arch,
          url: artifact.archive_download_url,
          type: ".zip",
          sha256: "",
          artifactName: artifact.name,
        },
      ];
    }

    try {
      const archive = await this.fetchBinary(artifact.archive_download_url);
      const entryNames = this.listZipEntries(archive);
      const inferredAssets = new Map<string, Asset>();

      for (const entry of entryNames) {
        const entryFileName = entry.split("/").pop() || entry;
        const entryOS = getOS(entryFileName);
        const entryArch = getArch(entryFileName);

        if (entryOS === "" || entryArch === "") {
          continue;
        }

        const key = `${entryOS}/${entryArch}`;
        if (inferredAssets.has(key)) {
          continue;
        }

        inferredAssets.set(key, {
          name: entryFileName,
          os: entryOS,
          arch: entryArch,
          url: artifact.archive_download_url,
          type: ".zip",
          sha256: "",
          artifactName: artifact.name,
          archivePath: entry,
        });
      }

      if (inferredAssets.size > 0) {
        console.log(
          `  inferred ${inferredAssets.size} platform artifact(s) from ${artifact.name}`
        );
        return Array.from(inferredAssets.values());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  failed to inspect artifact '${artifact.name}': ${msg}`);
    }

    // Fallback for single-file artifacts where os/arch are not encoded in the artifact name.
    const resolvedOS = os || "linux";
    const resolvedArch = arch || (resolvedOS === "darwin" ? "arm64" : "amd64");
    return [
      {
        name: artifact.name,
        os: resolvedOS,
        arch: resolvedArch,
        url: artifact.archive_download_url,
        type: ".zip",
        sha256: "",
        artifactName: artifact.name,
      },
    ];
  }

  private async getSumIndex(ghas: GHAsset[]): Promise<Record<string, string>> {
    let url = "";
    for (const ga of ghas) {
      if (this.isChecksumFile(ga)) {
        // Use API URL with Accept header for binary download
        url = ga.url;
        break;
      }
    }
    if (!url) return {};

    try {
      const headers: Record<string, string> = {
        Accept: "application/octet-stream",
        "User-Agent": "installer",
      };
      if (this.config.token) {
        headers["Authorization"] = `token ${this.config.token}`;
      }
      const resp = await fetch(url, { headers, redirect: "follow" });
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
