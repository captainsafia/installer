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
