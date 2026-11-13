// Pre-commit secret scan. Runs gitleaks on staged changes when it is installed;
// otherwise prints a warning (CI always runs gitleaks on the full history).
import { spawnSync } from 'node:child_process';

const probe = spawnSync('gitleaks', ['version'], { stdio: 'ignore', shell: false });

if (probe.error || probe.status !== 0) {
  console.warn(
    '[gitleaks] not installed: skipping local secret scan. Install it with `winget install gitleaks`.',
  );
  process.exit(0);
}

const scan = spawnSync('gitleaks', ['git', '--pre-commit', '--staged', '--redact', '--no-banner'], {
  stdio: 'inherit',
  shell: false,
});

process.exit(scan.status ?? 1);
