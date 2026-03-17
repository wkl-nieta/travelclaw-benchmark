#!/usr/bin/env node
/**
 * run.mjs — benchmark runner for travelclaw travel.js
 *
 * Usage:
 *   node lib/run.mjs --travel <path/to/travel.js> [--rounds 10] [--char "可莉"] [--pic <uuid>] [--out results.json]
 *
 * Runs N rounds of suggest→gen, writes JSON results to --out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const travelJs   = get('--travel', null);
const rounds     = parseInt(get('--rounds', '10'), 10);
const outFile    = get('--out', '/tmp/tcbench_results.json');
const cloneMs    = parseInt(get('--clone-ms', '0'), 10);
const freshClone = get('--fresh-clone', 'false') === 'true';
let   charName   = get('--char', null);
let   picUuid    = get('--pic', null);

if (!travelJs) { console.error('Usage: node lib/run.mjs --travel <path/to/travel.js> [--rounds 10] [--char ...] [--pic ...] [--out results.json]'); process.exit(1); }

const node = `node --input-type=module 2>/dev/null; node`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function ms() { return Date.now(); }

// ── Step 0: auto-adopt if char/pic not provided ───────────────────────────────
let soulMs = 0;
if (!charName || !picUuid) {
  process.stderr.write('🔍 Reading SOUL.md...\n');
  const t0soul = Date.now();
  try {
    const soul = JSON.parse(run(`node "${travelJs}" soul 2>/dev/null`));
    soulMs = Date.now() - t0soul;
    charName = charName || soul.name;
    picUuid  = picUuid  || soul.picture_uuid;
    process.stderr.write(`✅ Character: ${charName}  pic: ${picUuid}  (${soulMs}ms)\n`);
  } catch (e) {
    soulMs = Date.now() - t0soul;
    process.stderr.write(`⚠️  SOUL.md missing or no portrait — running adopt...\n`);
    if (!charName) { process.stderr.write('❌ --char required when no SOUL.md\n'); process.exit(1); }
    const adopted = JSON.parse(run(`node "${travelJs}" adopt "${charName}" 2>/dev/null`));
    picUuid = adopted.picture_uuid;
    process.stderr.write(`✅ Adopted: ${charName}  pic: ${picUuid}\n`);
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
const results = [];
const visited = [];

process.stderr.write(`\n📊 Benchmark: ${rounds} rounds · character: ${charName}\n${'─'.repeat(60)}\n`);

for (let i = 1; i <= rounds; i++) {
  process.stderr.write(`\n[${i}/${rounds}] suggest...`);
  const t0 = ms();
  let dest;
  try {
    dest = JSON.parse(run(`node "${travelJs}" suggest "${visited.join(',')}" 2>/dev/null`));
  } catch (e) {
    process.stderr.write(` FAILED: ${e.message}\n`);
    results.push({ round: i, scene: 'SUGGEST_FAILED', suggest_ms: ms() - t0, gen_ms: 0, status: 'ERROR', url: '', from_ref: false });
    continue;
  }
  const suggest_ms = ms() - t0;
  visited.push(dest.uuid);
  process.stderr.write(` ${suggest_ms}ms → "${dest.name}" ${dest.from_ref ? '[ref]' : '[api]'}\n[${i}/${rounds}] gen...`);

  const t1 = ms();
  let g;
  try {
    g = JSON.parse(run(`node "${travelJs}" gen "${charName}" "${picUuid}" "${dest.uuid}" 2>/dev/null`));
  } catch (e) {
    process.stderr.write(` FAILED: ${e.message}\n`);
    results.push({ round: i, scene: dest.name, suggest_ms, gen_ms: ms() - t1, status: 'ERROR', url: '', from_ref: dest.from_ref ?? false });
    continue;
  }
  const gen_ms = ms() - t1;
  process.stderr.write(` ${gen_ms}ms → ${g.status}  ${g.url || 'no url'}\n`);

  results.push({
    round: i,
    scene: dest.name,
    suggest_ms,
    gen_ms,
    status: g.status,
    url: g.url || '',
    from_ref: dest.from_ref ?? false,
  });
}

const firstRound = results[0];
const coldStart = {
  clone_ms:          cloneMs,
  fresh_clone:       freshClone,
  soul_ms:           soulMs,
  first_suggest_ms:  firstRound?.suggest_ms ?? 0,
  first_gen_ms:      firstRound?.gen_ms ?? 0,
  total_ms:          cloneMs + soulMs + (firstRound?.suggest_ms ?? 0) + (firstRound?.gen_ms ?? 0),
};

process.stderr.write(`\n⚡ Cold start: clone ${cloneMs}ms · soul ${soulMs}ms · suggest ${coldStart.first_suggest_ms}ms · gen ${coldStart.first_gen_ms}ms = ${coldStart.total_ms}ms total\n`);

const output = {
  meta: { char: charName, pic: picUuid, fresh_clone: freshClone, cold_start: coldStart },
  rounds: results,
};
writeFileSync(outFile, JSON.stringify(output, null, 2));

// ── Summary ───────────────────────────────────────────────────────────────────
const ok   = results.filter(r => r.status === 'SUCCESS');
const fail = results.filter(r => r.status !== 'SUCCESS');

process.stderr.write(`\n${'─'.repeat(60)}\n`);
process.stderr.write(`✅ ${ok.length}/${results.length} SUCCESS  ❌ ${fail.length} FAILED\n`);
if (ok.length) {
  const times = ok.map(r => r.gen_ms);
  process.stderr.write(`⏱  Gen: avg ${Math.round(times.reduce((a,b)=>a+b,0)/times.length/1000)}s  min ${Math.round(Math.min(...times)/1000)}s  max ${Math.round(Math.max(...times)/1000)}s\n`);
}
process.stderr.write(`📄 Results → ${outFile}\n`);
process.stdout.write(outFile + '\n');
