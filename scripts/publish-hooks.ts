#!/usr/bin/env node
/**
 * Build and publish @jagit/shared, @jagit/agent-reporter, and all @jagit/hook-* packages to npm.
 *
 * Usage:
 *   pnpm tsx scripts/publish-hooks.ts [--dry-run] [--version bump|patch|minor|major]
 *
 * Options:
 *   --dry-run    Show what would be published without actually publishing
 *   --version    Version bump strategy: bump (same as patch), patch, minor, major
 *                If omitted, publishes current version as-is
 *
 * Prerequisites:
 *   - NPM_TOKEN env var set with a valid npm token
 *   - Logged into npm (`npm whoami` should work)
 *   - Clean working directory (no uncommitted changes)
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = join(import.meta.dirname, "..");
const PACKAGES_DIR = join(ROOT_DIR, "packages");

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
}

// Published in this order: shared dependencies before the hook CLIs that need them.
const LIBRARY_PACKAGES = ["shared", "agent-reporter"];

function getHookPackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("hook-"))
    .map((d) => d.name);
}

function getPublishablePackages(): string[] {
  return [...LIBRARY_PACKAGES, ...getHookPackages()];
}

function run(cmd: string, cwd: string = ROOT_DIR, dryRun: boolean = false): void {
  if (dryRun) {
    console.log(`[dry-run] Would run: ${cmd}`);
    return;
  }
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function readPackageJson(pkgDir: string): PackageJson {
  const path = join(PACKAGES_DIR, pkgDir, "package.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writePackageJson(pkgDir: string, pkg: PackageJson): void {
  const path = join(PACKAGES_DIR, pkgDir, "package.json");
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

function bumpVersion(pkgDir: string, strategy: "patch" | "minor" | "major"): string {
  const pkg = readPackageJson(pkgDir);
  const parts = pkg.version.split(".").map(Number);

  if (strategy === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (strategy === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }

  const newVersion = parts.join(".");
  pkg.version = newVersion;
  writePackageJson(pkgDir, pkg);

  return newVersion;
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const versionIdx = args.indexOf("--version");
  const versionStrategy = versionIdx !== -1 ? args[versionIdx + 1] as "bump" | "patch" | "minor" | "major" : null;

  if (dryRun) {
    console.log("🔍 Dry run mode - no changes will be made\n");
  }

  // Check prerequisites
  if (!dryRun) {
    try {
      execSync("npm whoami", { stdio: "pipe" });
    } catch {
      console.error("❌ Not logged into npm. Run `npm login` first.");
      process.exit(1);
    }

    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    if (status.trim()) {
      console.error("❌ Working directory has uncommitted changes. Commit or stash first.");
      process.exit(1);
    }
  }

  const publishPackages = getPublishablePackages();
  if (publishPackages.length === 0) {
    console.error("❌ No publishable packages found in packages/");
    process.exit(1);
  }

  console.log(`📦 Found ${publishPackages.length} packages to publish: ${publishPackages.join(", ")}\n`);

  // Step 1: Build all packages
  console.log("🔨 Building all packages...\n");
  run("pnpm -r build", ROOT_DIR, dryRun);
  console.log("");

  // Step 2: Version bump if requested
  if (versionStrategy) {
    const strategy = versionStrategy === "bump" ? "patch" : versionStrategy;
    console.log(`📈 Bumping version (${strategy})...\n`);

    for (const pkgDir of publishPackages) {
      const pkg = readPackageJson(pkgDir);
      const oldVersion = pkg.version;
      const newVersion = bumpVersion(pkgDir, strategy);
      console.log(`  ${pkg.name}: ${oldVersion} → ${newVersion}`);
    }
    console.log("");
  }

  // Step 3: Publish each package (shared libs first, so hook-* deps resolve on the registry)
  console.log("🚀 Publishing to npm...\n");

  for (const pkgDir of publishPackages) {
    const pkg = readPackageJson(pkgDir);
    console.log(`\n📦 Publishing ${pkg.name}@${pkg.version}...`);

    const pkgPath = join(PACKAGES_DIR, pkgDir);

    // Check if already published
    try {
      const published = execSync(`npm view ${pkg.name} version`, { encoding: "utf-8" }).trim();
      if (published === pkg.version && !dryRun) {
        console.log(`  ⚠️  Version ${pkg.version} already published, skipping`);
        continue;
      }
    } catch {
      // Package not found on npm, first publish
    }

    // pnpm publish (not npm publish) so workspace:* deps get rewritten to real versions.
    run(`pnpm publish --access public --no-git-checks`, pkgPath, dryRun);
    console.log(`  ✅ Published ${pkg.name}@${pkg.version}`);
  }

  console.log("\n✨ Done!");

  if (!dryRun && versionStrategy) {
    console.log("\n💡 Don't forget to commit the version bumps:");
    console.log("   git add packages/shared/package.json packages/agent-reporter/package.json packages/hook-*/package.json");
    console.log('   git commit -m "chore: bump published package versions"');
  }
}

main();
