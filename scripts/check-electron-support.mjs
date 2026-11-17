// Checks that the Electron used by apps/desktop is within the last 2 stable major versions
// (docs/memoria/SICUREZZA.md, Electron checklist). Older majors stop getting security fixes.
// Usage: node scripts/check-electron-support.mjs   (CI runs it; it needs the npm registry)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SUPPORTED_MAJORS = 2;

/** Major version of a semver string, or NaN. */
export function majorOf(version) {
  const m = /^v?(\d+)\.\d+\.\d+/.exec(String(version));
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * True when `installed` is one of the last `window` majors before `latest` (inclusive).
 * A newer installed major than the published latest (a prerelease) also counts as supported.
 */
export function isWithinSupportedMajors(installed, latest, window = SUPPORTED_MAJORS) {
  const a = majorOf(installed);
  const b = majorOf(latest);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a > b - window;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function installedElectronVersion() {
  const pkg = resolve(repoRoot, 'apps/desktop/node_modules/electron/package.json');
  return JSON.parse(readFileSync(pkg, 'utf8')).version;
}

async function latestElectronVersion() {
  const res = await fetch('https://registry.npmjs.org/electron/latest', {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
  return (await res.json()).version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const installed = installedElectronVersion();
  const latest = await latestElectronVersion();
  if (isWithinSupportedMajors(installed, latest)) {
    console.log(
      `[electron] ${installed} is within the last ${SUPPORTED_MAJORS} majors (latest ${latest}).`,
    );
  } else {
    console.error(
      `[electron] ${installed} is older than the last ${SUPPORTED_MAJORS} majors (latest ${latest}): upgrade Electron.`,
    );
    process.exit(1);
  }
}
