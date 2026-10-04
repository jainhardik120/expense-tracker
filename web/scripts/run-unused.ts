import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forwardedArgs = process.argv.slice(2);
const knipArgs = forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;

const run = (label: string, command: string, args: string[]): boolean => {
  const result = spawnSync(command, args, { cwd: WEB_DIR, stdio: 'inherit' });
  if (result.error !== undefined) {
    process.stderr.write(`\n✗ ${label} failed to start: ${result.error.message}\n`);
    return false;
  }
  return (result.status ?? 1) === 0;
};

const steps: Array<[label: string, command: string, args: string[]]> = [
  ['trpc procedure usage', 'pnpm', ['exec', 'tsx', './scripts/check-trpc-procedure-usage.ts']],
  ['knip', 'pnpm', ['exec', 'knip', ...knipArgs]],
];

const failed = steps.filter(([label, command, args]) => !run(label, command, args));

if (failed.length > 0) {
  process.stderr.write(`\n✗ unused check failed: ${failed.map(([label]) => label).join(', ')}\n`);
  process.exit(1);
}
