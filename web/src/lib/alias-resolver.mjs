import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Resolves the '@/…' alias the way tsconfig does, for Node's test runner.
 *
 * Bundlers read tsconfig's paths; Node does not, so importing anything that
 * reaches for '@/types' fails outright. That is why the suites here only ever
 * covered files with no alias imports — a rule about where a test can reach
 * rather than about what is worth testing.
 */
const SRC = new URL('../', import.meta.url);

/** ESM has no directory resolution, and the alias is written without an extension. */
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true;

const asFileUrl = (base) => {
  const found = candidates(base).find(isFile);
  return found === undefined ? undefined : { url: pathToFileURL(found).href, shortCircuit: true };
};

export const resolve = (specifier, context, nextResolve) => {
  if (specifier.startsWith('@/')) {
    return (
      asFileUrl(fileURLToPath(new URL(specifier.slice('@/'.length), SRC))) ??
      nextResolve(specifier, context)
    );
  }
  // TypeScript writes relative imports without an extension too, so a file
  // reached through the alias brings the same problem with it.
  if (specifier.startsWith('.') && context.parentURL !== undefined) {
    return (
      asFileUrl(fileURLToPath(new URL(specifier, context.parentURL))) ??
      nextResolve(specifier, context)
    );
  }
  return nextResolve(specifier, context);
};
