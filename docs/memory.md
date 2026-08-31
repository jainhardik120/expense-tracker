# Memory footprint and self-hosting

Notes from measuring this app's runtime memory, taken while working out whether it
could move off Vercel onto an existing 1 GB ARM EC2 box. Kept because the numbers
were expensive to get and the conclusions are not obvious.

Measured 31 Aug 2026 against Next.js 16.1.6.

## Where to measure

Two environments were used, and they disagree enough to matter:

- **Local** (x86, unconstrained heap) — useful for A/B comparisons, but Node grows
  its heap to fill available RAM, so absolute numbers run high.
- **`helix-arm64` EC2** — t4g.micro, aarch64, Debian 13, Node 24.18, a
  `output: 'standalone'` build, hard-capped with
  `systemd-run --scope -p MemoryMax=… -p MemorySwapMax=0` so a runaway could not
  push other services into swap. This is the number that counts.

## What the memory actually is

Heap snapshot of the running server (`NODE_OPTIONS=--heapsnapshot-signal=SIGUSR2`,
then `kill -USR2`), at 291.8 MB RSS / 167.9 MB JS heap:

| bucket | size | what it is |
| --- | --- | --- |
| string | 81.5 MB | the bundled server JS **source text** |
| code | 27.5 MB | V8 bytecode compiled from it |
| array | 21.6 MB | |
| closure | 16.1 MB | |
| object | 8.2 MB | actual runtime data |
| RSS − heap | ~124 MB | V8/native overhead, WASM, buffers |

The largest single retainers are module bodies —
`module.exports=[384810,550809,e=>{"use strict";…` at 14.6 MB, and several more at
~5 MB each.

**The footprint is code, not data.** Only ~8 MB is objects. Tuning GC achieves
nothing here; loading less code is the only lever that moves the number.

## Source maps do not cost memory

Worth recording because it is a natural guess and it is wrong.

The build carries 377 `.map` files, 123.8 MB, referenced by 157
`sourceMappingURL` comments. Moving all of them out of `.next/server` and
restarting:

| | boot RSS |
| --- | --- |
| with `.map` files | 292.7 MB |
| without `.map` files | 316.8 MB |

No reduction — the difference is run-to-run variance, and it went the wrong way.
Node reads a source map lazily, only when symbolicating a stack trace. The Next.js
memory guide agrees: it lists disabling source maps as reducing memory *during the
build*, not at runtime.

They do cost disk, which matters on a box at 72% of 7.8 GB. `output: 'standalone'`
already excludes them, so self-hosting gets that saving for free.

## `preloadEntriesOnStart` — the largest lever

> When the Next.js server starts, it preloads each page's JavaScript modules into
> memory, rather than at request time.
> — [Next.js memory guide](https://nextjs.org/docs/app/guides/memory-usage)

This is precisely the 81.5 MB of resident module source seen above. A/B on
identical builds and request sequences:

| | default (`true`) | `preloadEntriesOnStart: false` |
| --- | --- | --- |
| boot, no traffic | 316.4 MB | **168.5 MB** |
| after login page | 383.7 MB | 266.1 MB |
| after all 8 routes | 390.4 MB | 233.1 MB |

~148 MB saved at boot, cold start unchanged (481 ms vs 479 ms). Enabled in
`next.config.ts`.

The docs caveat that footprint "will eventually be the same if all pages are
eventually requested". That convergence was not observed here (233 vs 390 after
hitting every route), but a single run is indicative rather than conclusive — GC
timing makes these noisy. The boot-time difference is large and repeatable, and
boot time is what matters if processes are ever made short-lived.

## What else applies from the Next.js memory guide

The build script is `next build --turbopack`, which rules out most of the page.

| Recommendation | Applies |
| --- | --- |
| `experimental.webpackMemoryOptimizations` | No — Webpack only |
| Webpack build worker | No — Webpack only |
| Disable Webpack cache | No — Webpack only |
| `--experimental-debug-memory-usage`, `--heap-prof` | Diagnostics, build-time |
| `typescript.ignoreBuildErrors` | Build-time; builds happen off-box |
| Disable source maps | Build-time only — see above |
| Edge runtime fix (v14.1.3) | No — on 16.1.6 |
| Reduce dependencies | **Yes** — see below |
| `preloadEntriesOnStart: false` | **Yes — 148 MB** |

## Dependency cost

Incremental RSS of a bare `import` on top of a 43.7 MB baseline Node process.
These overstate the bundled cost (Next tree-shakes; `drizzle-orm/node-postgres`
alone probes at +239 MB yet the whole app boots at 168 MB) but rank the
candidates usefully:

```
drizzle-orm/node-postgres  +239 MB   required
better-auth                 +43 MB   required
@aws-sdk/client-ses         +26 MB   an SMTP client is a fraction of this
@vercel/otel                +24 MB   exports to nothing when self-hosted
ai                          +22 MB   only needed for /api/chat
winston                     +14 MB   console logging is free
pg                          +14 MB   required
```

`instrumentation.ts` calls `registerOTel()` unconditionally. On Vercel that feeds
their tracing; self-hosted with no collector it is pure cost.

## Fitting it on EC2

Cap trials on the ARM box, standalone build, no swap allowed to the scope
(`pages` = 6 routes, `pdf` = a full-year report render):

```
cap=320M  pages ok   pdf OOM-killed
cap=336M  pages ok   pdf 500      peak 287MB
cap=352M  pages ok   pdf 200      peak 321MB   marginal — failed on a repeat
cap=384M  pages ok   pdf 200      peak 356–377MB  (2 of 3 runs)
cap=400M  pages ok   pdf 200      peak 291MB
```

Some of those 500s were the Postgres `53300` connection ceiling, not OOM — they
occurred at peaks *below* the cap. Genuine OOM kills were at 320 MB and under.

Steady state, 400 MB cap: 184 MB booted, 291 MB after browsing, 273 MB settled.
Peak during a PDF render: **356–377 MB**.

So, before the `preloadEntriesOnStart` saving:

- **~400 MB** if the web process renders PDFs
- **~320 MB** if it does not
- ~200 MB covers boot and idle only; it dies under real traffic

**PDF rendering is the single biggest driver** — 90–100 MB of peak over the
pages-only figure, for an operation run occasionally. Rendering it in a
short-lived child process that exits would return that memory immediately.

### Host state at the time

| | helix-arm64 | Netbird |
| --- | --- | --- |
| RAM | 928 MB | 928 MB |
| available | 445 MB | 396 MB |
| swap used | **837 MB** of 2815 | 45 MB of 2815 |
| running | next-server 242 MB, redpanda, caddy, step-ca, openfga | docker + netbird stack |

The helix box is over-committed before anything is added to it.

## Running several Next.js apps

The number that decides this: **a Next server costs ~250 MB steady regardless of
what the app does.** Two independent data points on the same hardware — the helix
app's own `next-server` at 242 MB, this app at 273 MB. Most of it is framework, so
it does **not** amortise across apps. Five always-on servers is ~1.25 GB.

Options, best first for a personal low-traffic setup:

1. **systemd socket activation with idle shutdown.** systemd holds the port,
   starts the app on the first connection, stops it after an idle timeout. Cold
   start is 479–481 ms, so the first request after idle pays half a second.
   Five apps with one in use is ~170–270 MB rather than ~1.25 GB. Caddy is
   already on the box and can route by hostname.
2. **Next multi-zone** — several apps behind one server via `basePath`. Best
   possible memory (one framework instance), at the cost of independent deploys.
3. **Static export** for anything that needs no server — costs Caddy nothing.
4. **A bigger instance.** `t4g.small` (2 GB) removes the question; given the helix
   box is already 837 MB into swap, it is arguably due one regardless.

## Reproducing

```sh
# heap snapshot of a running server
NODE_OPTIONS="--heapsnapshot-signal=SIGUSR2" pnpm start
kill -USR2 <pid>          # writes Heap.*.heapsnapshot to cwd

# capped run on the box, so a runaway cannot disturb other services
sudo systemd-run --unit=et --scope -p MemoryMax=400M -p MemorySwapMax=0 \
  --setenv=NODE_OPTIONS="--max-old-space-size=224" node server.js
sudo cat /sys/fs/cgroup/system.slice/et.scope/memory.peak
```

Read RSS with `ps -eo pid,rss,comm --sort=-rss | grep next-server` — matching the
process by name alone picks up wrapper shells and reports nonsense.
