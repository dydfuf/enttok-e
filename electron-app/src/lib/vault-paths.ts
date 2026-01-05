export const DEFAULT_ASSETS_FOLDER = "assets";
export const DEFAULT_DAILY_FOLDER = "daily";

type VaultFolderValidation = {
  valid: boolean;
  normalized: string;
  error?: string;
};

function validateVaultFolder(
  value: string | null | undefined,
  fallback: string
): VaultFolderValidation {
  if (!value) {
    return { valid: true, normalized: fallback };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true, normalized: fallback };
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return {
      valid: false,
      normalized: fallback,
      error: "Use a relative folder inside the vault.",
    };
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { valid: true, normalized: fallback };
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return {
      valid: false,
      normalized: fallback,
      error: "Path cannot include '.' or '..' segments.",
    };
  }

  return { valid: true, normalized: segments.join("/") };
}

export function validateAssetsFolder(
  value: string | null | undefined
): VaultFolderValidation {
  return validateVaultFolder(value, DEFAULT_ASSETS_FOLDER);
}

export function validateDailyFolder(
  value: string | null | undefined
): VaultFolderValidation {
  return validateVaultFolder(value, DEFAULT_DAILY_FOLDER);
}

export function joinPath(base: string, ...parts: string[]): string {
  const separator = base.includes("\\") ? "\\" : "/";
  const baseClean = base.replace(/[\\/]+$/, "");
  const extraSegments = parts
    .flatMap((part) => part.split(/[\\/]+/))
    .filter(Boolean);
  if (!baseClean) {
    const prefix = base.startsWith("/") ? separator : "";
    return `${prefix}${extraSegments.join(separator)}`;
  }
  return [baseClean, ...extraSegments].join(separator);
}

type SplitPath = {
  root: string;
  segments: string[];
};

function splitPath(value: string): SplitPath {
  const normalized = value.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^([A-Za-z]:)(\/|$)/);
  if (driveMatch) {
    const root = `${driveMatch[1]}/`;
    const rest = normalized.slice(root.length);
    return { root, segments: rest.split("/").filter(Boolean) };
  }
  if (normalized.startsWith("/")) {
    const rest = normalized.slice(1);
    return { root: "/", segments: rest.split("/").filter(Boolean) };
  }
  return { root: "", segments: normalized.split("/").filter(Boolean) };
}

export function relativePathFromFile(fromFile: string, toFile: string): string {
  const from = splitPath(fromFile);
  const to = splitPath(toFile);
  const fromRoot = from.root.toLowerCase();
  const toRoot = to.root.toLowerCase();

  if (fromRoot !== toRoot) {
    return toFile.replace(/\\/g, "/");
  }

  const fromDir = from.segments.slice(0, -1);
  const toSegments = to.segments;
  const isWindows = from.root.includes(":");

  let common = 0;
  while (common < fromDir.length && common < toSegments.length) {
    const fromSeg = isWindows ? fromDir[common].toLowerCase() : fromDir[common];
    const toSeg = isWindows ? toSegments[common].toLowerCase() : toSegments[common];
    if (fromSeg !== toSeg) {
      break;
    }
    common += 1;
  }

  const upCount = fromDir.length - common;
  const relSegments = [
    ...Array.from({ length: upCount }, () => ".."),
    ...toSegments.slice(common),
  ];

  return relSegments.length === 0 ? "." : relSegments.join("/");
}

function hasUrlScheme(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isAbsolutePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}

export function resolvePathFromFile(
  fromFile: string,
  relativePath: string
): string {
  const trimmed = relativePath.trim();
  if (!trimmed) {
    return trimmed;
  }
  const normalized = trimmed.replace(/\\/g, "/");
  if (isAbsolutePath(normalized)) {
    return normalized;
  }

  const from = splitPath(fromFile);
  const baseSegments = from.segments.slice(0, -1);
  const parts = normalized.split("/").filter(Boolean);
  const resolvedSegments = [...baseSegments];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
      continue;
    }
    resolvedSegments.push(part);
  }

  const joined = resolvedSegments.join("/");
  if (from.root) {
    return joined ? `${from.root}${joined}` : from.root;
  }
  return joined;
}

export function toFileUrl(filePath: string): string {
  if (hasUrlScheme(filePath)) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, "/");
  const withPrefix = normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
  return encodeURI(withPrefix);
}

export function toVaultUrl(filePath: string): string {
  if (hasUrlScheme(filePath)) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, "/");
  const withPrefix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`vault://${withPrefix}`);
}

export function resolveAssetUrl(
  noteFilePath: string | null | undefined,
  assetPath: string
): string {
  const trimmed = assetPath.trim();
  if (!trimmed || hasUrlScheme(trimmed)) {
    return trimmed;
  }
  if (isAbsolutePath(trimmed)) {
    return toVaultUrl(trimmed);
  }
  if (!noteFilePath) {
    return trimmed;
  }
  return toVaultUrl(resolvePathFromFile(noteFilePath, trimmed));
}
