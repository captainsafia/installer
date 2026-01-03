export interface Query {
  user: string;
  program: string;
  release: string;
  asProgram: string;
  select: string;
  moveToPath: boolean;
  search: boolean;
  insecure: boolean;
  sudoMove: boolean; // deprecated
  os: string;
  arch: string;
}

export interface Asset {
  name: string;
  os: string;
  arch: string;
  url: string;
  type: string;
  sha256: string;
}

export function assetKey(a: Asset): string {
  return `${a.os}/${a.arch}`;
}

export function isMac(a: Asset): boolean {
  return a.os === "darwin";
}

export function isMacM1(a: Asset): boolean {
  return isMac(a) && a.arch === "arm64";
}

export function hasM1(assets: Asset[]): boolean {
  return assets.some((a) => isMacM1(a));
}

export interface QueryResult {
  user: string;
  program: string;
  release: string;
  asProgram: string;
  select: string;
  moveToPath: boolean;
  search: boolean;
  insecure: boolean;
  sudoMove: boolean;
  os: string;
  arch: string;
  resolvedRelease: string;
  timestamp: Date;
  assets: Asset[];
  m1Asset: boolean;
}

// GitHub API types
export interface GHAsset {
  browser_download_url: string;
  content_type: string;
  created_at: string;
  download_count: number;
  id: number;
  label: string;
  name: string;
  size: number;
  state: string;
  updated_at: string;
  uploader: {
    id: number;
    login: string;
  };
  url: string;
}

export interface GHRelease {
  assets: GHAsset[];
  assets_url: string;
  author: {
    id: number;
    login: string;
  };
  body: string;
  created_at: string;
  draft: boolean;
  html_url: string;
  id: number;
  name: string | null;
  prerelease: boolean;
  published_at: string;
  tag_name: string;
  tarball_url: string;
  target_commitish: string;
  upload_url: string;
  url: string;
  zipball_url: string;
}

// GitHub workflow artifacts API types
export interface GHArtifact {
  id: number;
  node_id: string;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
  workflow_run?: {
    id: number;
    repository_id: number;
    head_repository_id: number;
    head_branch: string;
    head_sha: string;
  };
}

export interface GHArtifactsResponse {
  total_count: number;
  artifacts: GHArtifact[];
}

export interface GHWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  event: string;
  pull_requests: { number: number }[];
  created_at: string;
  updated_at: string;
}

export interface GHWorkflowRunsResponse {
  total_count: number;
  workflow_runs: GHWorkflowRun[];
}

export interface GHPullRequest {
  number: number;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

