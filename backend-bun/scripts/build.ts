import { $ } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

type Platform = "darwin" | "win32" | "linux";
type Arch = "arm64" | "x64";

function getBunTarget(platform: Platform, arch: Arch): string {
  const platformMap = { darwin: "darwin", win32: "windows", linux: "linux" };
  return `bun-${platformMap[platform]}-${arch}`;
}

function getOutputName(platform: Platform): string {
  return platform === "win32" ? "backend-bun.exe" : "backend-bun";
}

async function build() {
  const distDir = join(import.meta.dir, "..", "dist");
  const platform = process.platform as Platform;
  const arch = process.arch as Arch;

  // Clean dist directory
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const target = getBunTarget(platform, arch);
  const output = getOutputName(platform);
  const outputPath = join(distDir, output);

  console.log(`Building for ${platform}-${arch}...`);

  try {
    await $`bun build --compile --target=${target} ./src/index.ts --outfile=${outputPath}`;
    console.log(`  ✓ ${output}`);
  } catch (error) {
    console.error(`  ✗ Failed to build:`, error);
    process.exit(1);
  }

  console.log("\nBuild complete!");
  console.log(`Output: ${outputPath}`);
}

build().catch(console.error);
