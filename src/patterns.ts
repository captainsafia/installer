// OS patterns
// '\b' ([^a-zA-Z0-9_]) is not ideal for matching the boundary
// Since RegExp does not support lookaheads & lookbehinds in all environments,
// we use (?:[^a-zA-Z0-9]|^) to match the beginning of the substring,
// and (?:[^a-zA-Z0-9]|$) to match the end of the substring.

const osReDarwin = /(?:[^a-zA-Z0-9]|^)(darwin|mac|osx)/i;
const osReDragonfly = /(?:[^a-zA-Z0-9]|^)(dragonfly)/i;
const osReWindows = /(?:[^a-zA-Z0-9]|^)(win)/i;
const osReMisc =
  /(?:[^a-zA-Z0-9]|^)(aix|android|illumos|ios|linux|freebsd|netbsd|openbsd|plan9|solaris)/i;

// Architecture patterns
const archReAmd64 = /(amd64|x86_64)(?:[^a-zA-Z0-9]|$)/i;
const archRe386 = /(386|686|x86_32)(?:[^a-zA-Z0-9]|$)/i;
const archReArm64 = /(arm64|aarch64|aarch_64)(?:[^a-zA-Z0-9]|$)/i;
const archReArm = /(arm(v[567]|32)?[eh]?[fl]?)(?:[^a-zA-Z0-9]|$)/i;
const archReLoong64 = /(loong64|loongarch64)(?:[^a-zA-Z0-9]|$)/i;
const archRePPC64 = /(ppc64|powerpc64)(?:[^a-zA-Z0-9]|$)/i;
const archRePPC64LE = /(ppc64le|powerpc64le|ppcle_64)(?:[^a-zA-Z0-9]|$)/i;
const archReRiscv64 = /(riscv64)/i; // also match riscv64gc
const archReMisc =
  /(?:[^a-zA-Z0-9]|^)(mips|mips64|mips64le|mipsle|s390x|s390_64|wasm)(?:[^a-zA-Z0-9]|$)/i;

const fuzzArchAmd64 = /(x?64(bit)?)\b/i;
const fuzzArch386 = /(x?32(bit)?|x86)\b/i;

export const checksumRe = /(checksums|sha256sums)/i;
// Note: .exe must be checked separately since it doesn't follow the typical archive pattern
export const fileExtRe = /(\.tar)?(\.[a-z][a-z0-9]+)$/;
export const exeExtRe = /\.exe$/i;
export const searchGithubRe = /https:\/\/github\.com\/(\w+)\/(\w+)/;

export function getOS(s: string): string {
  s = s.toLowerCase();
  if (osReDarwin.test(s)) return "darwin";
  if (osReDragonfly.test(s)) return "dragonfly";
  if (osReWindows.test(s)) return "windows";
  const miscMatch = s.match(osReMisc);
  if (miscMatch) return miscMatch[1];
  return "";
}

export function getArch(s: string): string {
  s = s.toLowerCase();
  if (archReLoong64.test(s)) return "loong64";
  if (archRePPC64.test(s)) return "ppc64";
  if (archRePPC64LE.test(s)) return "ppc64le";
  if (archReRiscv64.test(s)) return "riscv64";
  if (archReArm64.test(s)) return "arm64";
  if (archReAmd64.test(s)) return "amd64";
  if (archReArm.test(s)) return "arm";
  if (archRe386.test(s)) return "386";

  const miscMatch = s.match(archReMisc);
  if (miscMatch) {
    const arch = miscMatch[1];
    if (arch === "s390_64") return "s390x";
    return arch;
  }

  // fuzz match 'x?64(bit)?'
  if (fuzzArchAmd64.test(s)) return "amd64";
  // fuzz match 'x?32(bit)?'
  if (fuzzArch386.test(s)) return "386";

  return "";
}

export function getFileExt(s: string): string {
  // Check for .exe first (Windows executables)
  if (exeExtRe.test(s)) return ".exe";
  const match = s.match(fileExtRe);
  return match ? match[0] : "";
}

export function splitHalf(s: string, by: string): [string, string] {
  const i = s.indexOf(by);
  if (i === -1) return [s, ""];
  return [s.slice(0, i), s.slice(i + by.length)];
}
