import { protocol } from "electron";
import path from "path";
import { getCurrentVaultPath } from "../store.js";

export const VAULT_PROTOCOL = "vault";

export function registerVaultProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: VAULT_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function decodeVaultRequestPath(requestUrl: string): string | null {
  const prefix = `${VAULT_PROTOCOL}://`;
  if (!requestUrl.startsWith(prefix)) {
    return null;
  }

  let rest = requestUrl.slice(prefix.length);
  const queryIndex = rest.search(/[?#]/);
  if (queryIndex !== -1) {
    rest = rest.slice(0, queryIndex);
  }

  if (!rest.startsWith("/")) {
    rest = `/${rest}`;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rest);
  } catch {
    return null;
  }

  decodedPath = decodedPath.replace(/^\/+/, "/");
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(decodedPath)) {
    decodedPath = decodedPath.slice(1);
  }
  return decodedPath;
}

function isPathInside(parent: string, child: string): boolean {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  if (childResolved === parentResolved) {
    return true;
  }
  const isCaseInsensitive =
    process.platform === "win32" || process.platform === "darwin";
  if (isCaseInsensitive) {
    const parentLower = parentResolved.toLowerCase();
    const childLower = childResolved.toLowerCase();
    if (childLower === parentLower) {
      return true;
    }
    return childLower.startsWith(`${parentLower}${path.sep}`);
  }
  return childResolved.startsWith(`${parentResolved}${path.sep}`);
}

export function registerVaultProtocol() {
  protocol.registerFileProtocol(VAULT_PROTOCOL, (request, callback) => {
    const decodedPath = decodeVaultRequestPath(request.url);
    if (!decodedPath) {
      callback({ error: -6 });
      return;
    }

    const vaultPath = getCurrentVaultPath();
    if (!vaultPath) {
      callback({ error: -6 });
      return;
    }

    const normalizedPath = path.normalize(decodedPath);
    if (!isPathInside(vaultPath, normalizedPath)) {
      callback({ error: -10 });
      return;
    }

    callback({ path: normalizedPath });
  });
}
