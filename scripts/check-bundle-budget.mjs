#!/usr/bin/env node
/**
 * Bundle-size budget gate (CI).
 *
 * Fails the build if the client JS bundle grows past budget — the cheapest,
 * most deterministic perf regression to catch (a heavy import bloating a
 * shared chunk taxes every route). Runs after `next build`, reading
 * `.next/build-manifest.json` + the emitted chunks. No deps, no infra.
 *
 * Budgets live in `bundle-budget.json` (gzipped KB):
 *   - shared:  first-load JS every route pays (rootMainFiles + polyfills +
 *              lowPriority). The highest-leverage number.
 *   - total:   sum of all client chunks — overall growth.
 *   - largest: biggest single chunk — a fat dependency landing in one file.
 *
 * Update a budget deliberately (with the diff that justifies it), never to
 * silence the gate.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Portable recursive *.js walk (avoids fs.globSync, which is Node 22+). */
function walkJs(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkJs(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const NEXT = resolve(repo, '.next');

const manifestPath = resolve(NEXT, 'build-manifest.json');
if (!existsSync(manifestPath)) {
    console.error('✗ .next/build-manifest.json not found — run `next build` first.');
    process.exit(1);
}

const budgets = JSON.parse(readFileSync(resolve(repo, 'bundle-budget.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const gz = (rel) => {
    const p = resolve(NEXT, rel);
    return existsSync(p) ? gzipSync(readFileSync(p)).length : 0;
};

const sharedFiles = [
    ...(manifest.rootMainFiles ?? []),
    ...(manifest.polyfillFiles ?? []),
    ...(manifest.lowPriorityFiles ?? []),
];
const shared = sharedFiles.reduce((s, f) => s + gz(f), 0);

const chunkPaths = walkJs(resolve(NEXT, 'static/chunks'));
const chunkSizes = chunkPaths.map((p) => gzipSync(readFileSync(p)).length);
const total = chunkSizes.reduce((s, n) => s + n, 0);
const largest = chunkSizes.reduce((m, n) => Math.max(m, n), 0);

const kb = (n) => n / 1024;
const rows = [
    { name: 'shared first-load JS', actual: kb(shared), budget: budgets.shared },
    { name: 'total client JS', actual: kb(total), budget: budgets.total },
    { name: 'largest single chunk', actual: kb(largest), budget: budgets.largest },
];

let failed = false;
console.log('Bundle-size budget (gzipped):\n');
for (const r of rows) {
    const ok = r.actual <= r.budget;
    if (!ok) failed = true;
    const pct = ((r.actual / r.budget) * 100).toFixed(0);
    console.log(
        `  ${ok ? '✓' : '✗'} ${r.name.padEnd(22)} ${r.actual.toFixed(1).padStart(7)} KB ` +
        `/ ${String(r.budget).padStart(4)} KB budget  (${pct}%)`,
    );
}

if (failed) {
    console.error('\n✗ Bundle budget exceeded. Trim the regression, or bump bundle-budget.json with the diff that justifies it.');
    process.exit(1);
}
console.log('\n✓ Within budget.');
