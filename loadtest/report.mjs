import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , dir = 'results', out = 'report.md'] = process.argv;
const context = existsSync(join(dir, 'context.json'))
  ? JSON.parse(readFileSync(join(dir, 'context.json'), 'utf8'))
  : {};

const metaFiles = readdirSync(dir).filter((file) => file.endsWith('.meta.json'));
const runs = metaFiles
  .map((file) => {
    const meta = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const label = `${meta.page}-${meta.vus}`;
    const summaryPath = join(dir, `${label}.json`);
    if (!existsSync(summaryPath)) {
      return { ...meta, missing: true };
    }
    const metrics = JSON.parse(readFileSync(summaryPath, 'utf8')).metrics;
    const duration = metrics.http_req_duration ?? {};
    const checks = metrics.checks ?? { passes: 0, fails: 0 };
    const requests = metrics.http_reqs ?? { count: 0, rate: 0 };
    const memory = [];
    const cpu = [];
    for (const line of readFileSync(join(dir, `${label}.stats`), 'utf8').split('\n')) {
      const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      const hit = clean.match(/([\d.]+)(KiB|MiB|GiB)\s*\/\s*[\d.]+\w+\|([\d.]+)%/);
      if (hit) {
        const scale = { KiB: 1 / 1024, MiB: 1, GiB: 1024 }[hit[2]];
        memory.push(Number(hit[1]) * scale);
        cpu.push(Number(hit[3]));
      }
    }
    const total = checks.passes + checks.fails;
    return {
      ...meta,
      rate: requests.rate,
      count: requests.count,
      median: duration.med ?? 0,
      p95: duration['p(95)'] ?? 0,
      p99: duration['p(99)'] ?? 0,
      failed: total === 0 ? 0 : (100 * checks.fails) / total,
      peakMemory: memory.length === 0 ? 0 : Math.max(...memory),
      averageCpu: cpu.length === 0 ? 0 : cpu.reduce((sum, value) => sum + value, 0) / cpu.length,
      cpuPerLoad: requests.count === 0 ? 0 : meta.cpuUsec / 1000 / requests.count,
    };
  })
  .sort((a, b) => a.page.localeCompare(b.page) || a.vus - b.vus);

const ms = (value) => `${Math.round(value).toLocaleString('en-US')} ms`;
const pages = [...new Set(runs.map((run) => run.page))];
const lines = [];

lines.push('# Load test report', '');
lines.push(
  `Commit \`${context.sha ?? 'unknown'}\` on \`${context.ref ?? 'unknown'}\` · ${context.date ?? new Date().toISOString()}`,
  '',
);
lines.push('| setting | value |', '|---|---|');
for (const [key, value] of Object.entries(context.settings ?? {})) {
  lines.push(`| ${key} | ${value} |`);
}
if (context.seed !== undefined) {
  lines.push(`| seeded rows | ${Object.entries(context.seed).map(([k, v]) => `${k} ${Number(v).toLocaleString('en-US')}`).join(', ')} |`);
}
lines.push('');

lines.push('## Capacity per page', '');
lines.push('| page | best loads/s | users at that rate | median there | lowest-load median | CPU per load | any failures | worst peak memory |', '|---|---|---|---|---|---|---|---|');
for (const page of pages) {
  const pageRuns = runs.filter((run) => run.page === page && !run.missing);
  if (pageRuns.length === 0) {
    lines.push(`| ${page} | no data | | | | | | |`);
    continue;
  }
  const best = pageRuns.reduce((a, b) => (b.rate > a.rate ? b : a));
  const lightest = pageRuns[0];
  const cpu = pageRuns.map((run) => run.cpuPerLoad).sort((a, b) => a - b)[Math.floor(pageRuns.length / 2)];
  const anyFailures = pageRuns.some((run) => run.failed > 0 || run.restarts > 0 || run.oomKilled);
  lines.push(
    `| ${page} | ${best.rate.toFixed(1)} | ${best.vus} | ${ms(best.median)} | ${ms(lightest.median)} | ${ms(cpu)} | ${anyFailures ? '⚠️ yes' : 'no'} | ${Math.round(Math.max(...pageRuns.map((run) => run.peakMemory)))} MB |`,
  );
}
lines.push('');

lines.push('## Every level', '');
lines.push('| page | users | loads/s | median | p95 | p99 | failed | CPU per load | avg CPU | peak memory | restarts |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const run of runs) {
  if (run.missing) {
    lines.push(`| ${run.page} | ${run.vus} | k6 produced no summary | | | | | | | | |`);
    continue;
  }
  lines.push(
    `| ${run.page} | ${run.vus} | ${run.rate.toFixed(1)} | ${ms(run.median)} | ${ms(run.p95)} | ${ms(run.p99)} | ${run.failed.toFixed(1)}% | ${ms(run.cpuPerLoad)} | ${Math.round(run.averageCpu)}% | ${Math.round(run.peakMemory)} MB | ${run.restarts}${run.oomKilled ? ' (OOM)' : ''} |`,
  );
}
lines.push('');

lines.push('## Heaviest queries per page', '');
for (const page of pages) {
  const path = join(dir, `${page}.queries.tsv`);
  if (!existsSync(path)) {
    continue;
  }
  const rows = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
  lines.push(`<details><summary>${page}</summary>`, '');
  lines.push('| calls | total ms | mean ms | plan ms | rows/call | pages/call | query |', '|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const [calls, total, mean, plan, rowsPerCall, pagesPerCall, query] = row.split('\t');
    lines.push(`| ${calls} | ${total} | ${mean} | ${plan} | ${rowsPerCall} | ${pagesPerCall} | \`${(query ?? '').replace(/\|/g, '\\|')}\` |`);
  }
  lines.push('', '</details>', '');
}

writeFileSync(out, `${lines.join('\n')}\n`);
process.stdout.write(`wrote ${out} (${runs.length} runs, ${pages.length} pages)\n`);
