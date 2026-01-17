/* eslint-disable no-console */
import { ESLint } from 'eslint';

interface ESLintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
}

interface ESLintFileReport {
  filePath: string;
  messages: ESLintMessage[];
}

interface FileCount {
  errors: number;
  warnings: number;
}

interface RuleCount extends FileCount {
  files: Partial<Record<string, FileCount>>;
}

/**
 * Updates the file count for a specific rule and file
 */
const updateFileCount = (
  counts: Partial<Record<string, RuleCount>>,
  rule: string,
  filePath: string,
  severity: number,
): void => {
  // Initialize rule counter if not exists
  counts[rule] ??= { errors: 0, warnings: 0, files: {} };

  // Update rule counters
  if (severity === 2) {
    counts[rule].errors++;
  } else if (severity === 1) {
    counts[rule].warnings++;
  }

  // Initialize or get existing file counter
  const existingCount = counts[rule].files[filePath] ?? { errors: 0, warnings: 0 };

  // Update file counters
  if (severity === 2) {
    existingCount.errors++;
  } else if (severity === 1) {
    existingCount.warnings++;
  }

  counts[rule].files[filePath] = existingCount;
};

/**
 * Processes ESLint results to count errors and warnings by rule and file
 */
const processLintResults = (data: ESLintFileReport[]): Partial<Record<string, RuleCount>> => {
  const counts: Partial<Record<string, RuleCount>> = {};

  for (const file of data) {
    for (const msg of file.messages) {
      const rule = msg.ruleId ?? 'unknown';
      updateFileCount(counts, rule, file.filePath, msg.severity);
    }
  }

  return counts;
};

/**
 * Prints the lint results summary to the console
 */
const printResults = (counts: Partial<Record<string, RuleCount>>): void => {
  const sorted = Object.entries(counts)
    .map(([rule, info]) => ({
      rule,
      total: (info?.errors ?? 0) + (info?.warnings ?? 0),
      ...info,
    }))
    .sort((a, b) => b.total - a.total);

  for (const { rule, errors, warnings, files } of sorted) {
    console.log(`\nRule: ${rule}`);
    console.log(`  Errors: ${errors}, Warnings: ${warnings}`);
    console.log('  Files:');

    if (files !== undefined) {
      const fileList = Object.entries(files)
        .map(([file, c]) => ({ file, total: (c?.errors ?? 0) + (c?.warnings ?? 0), ...c }))
        .sort((a, b) => b.total - a.total);

      for (const f of fileList) {
        console.log(`    ${f.file} — Errors: ${f.errors}, Warnings: ${f.warnings}`);
      }
    }
  }
  for (const { rule, errors } of sorted) {
    if (errors !== undefined && errors > 0) {
      console.log(`'${rule}': 'warn',`);
    }
  }
};

const main = async () => {
  // Run ESLint on src files only, matching the lint command from package.json
  const eslint = new ESLint({});
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);

  // Process and analyze results
  const data: ESLintFileReport[] = results as unknown as ESLintFileReport[];
  const counts = processLintResults(data);

  // Print summary
  printResults(counts);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
