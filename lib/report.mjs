#!/usr/bin/env node
/**
 * report.mjs — generate HTML benchmark report from results JSON
 *
 * Usage:
 *   node lib/report.mjs --results results.json [--out report.html] [--repo talesofai/travelclaw] [--branch compact] [--char "可莉"]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args   = process.argv.slice(2);
const get    = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const inFile  = get('--results', '/tmp/tcbench_results.json');
const outFile = get('--out', '/tmp/tcbench_report.html');
const repo    = get('--repo', 'talesofai/travelclaw');
const branch  = get('--branch', 'main');
const charArg = get('--char', '');

const data   = JSON.parse(readFileSync(inFile, 'utf8'));
const today  = new Date().toISOString().slice(0, 10);

const ok     = data.filter(r => r.status === 'SUCCESS');
const fail   = data.filter(r => r.status !== 'SUCCESS');
const avgGen = ok.length ? Math.round(ok.reduce((s, r) => s + r.gen_ms, 0) / ok.length / 1000 * 10) / 10 : 0;
const minGen = ok.length ? Math.round(Math.min(...ok.map(r => r.gen_ms)) / 1000 * 10) / 10 : 0;
const maxGen = ok.length ? Math.round(Math.max(...ok.map(r => r.gen_ms)) / 1000 * 10) / 10 : 0;
const avgSug = data.length ? Math.round(data.reduce((s, r) => s + r.suggest_ms, 0) / data.length / 1000 * 10) / 10 : 0;
const rate   = data.length ? Math.round(ok.length / data.length * 100) : 0;
const refCount = data.filter(r => r.from_ref).length;
const apiCount = data.filter(r => !r.from_ref && r.status !== 'ERROR').length;

const rows = data.map(r => {
  const cls  = r.status === 'SUCCESS' ? '' : ' class="fail"';
  const img  = r.url ? `<a href="${r.url}" target="_blank">↗</a>` : '—';
  const src  = r.from_ref ? '<span class="tag ref">ref</span>' : '<span class="tag api">api</span>';
  return `<tr${cls}>
    <td>${r.round}</td>
    <td>${r.scene}</td>
    <td>${src}</td>
    <td>${(r.suggest_ms/1000).toFixed(1)}s</td>
    <td>${(r.gen_ms/1000).toFixed(1)}s</td>
    <td class="s-${r.status === 'SUCCESS' ? 'ok' : 'err'}">${r.status}</td>
    <td>${img}</td>
  </tr>`;
}).join('');

const cards = ok.filter(r => r.url).map(r => `
  <div class="card">
    <img src="${r.url}" alt="${r.scene}" loading="lazy"/>
    <div class="cap">
      <strong>#${r.round} ${r.scene}</strong>
      suggest ${(r.suggest_ms/1000).toFixed(1)}s · gen ${(r.gen_ms/1000).toFixed(1)}s · ${r.from_ref ? 'ref' : 'api'}
    </div>
  </div>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>travelclaw benchmark — ${repo}@${branch}</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:1200px;margin:0 auto;padding:2rem;color:#1a1a1a;background:#fafafa}
h1{font-size:1.5rem;margin:0 0 .25rem}
.sub{color:#666;font-size:.85rem;margin-bottom:2rem}
.sub a{color:#3b5bdb;text-decoration:none}.sub a:hover{text-decoration:underline}
.stats{display:flex;flex-wrap:wrap;gap:.8rem;margin-bottom:2rem}
.stat{background:#fff;border:1px solid #e8eaed;border-radius:10px;padding:.8rem 1.2rem;min-width:100px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.v{font-size:1.7rem;font-weight:700;color:#3b5bdb;line-height:1}.l{font-size:.72rem;color:#777;margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:3rem;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07)}
th{background:#3b5bdb;color:#fff;padding:9px 11px;text-align:left;font-weight:600}
td{padding:7px 11px;border-bottom:1px solid #f0f0f0}tr:last-child td{border-bottom:none}
tr:hover td{background:#f5f7ff}tr.fail td{background:#fff5f5}
.s-ok{color:#2f9e44;font-weight:700}.s-err{color:#c92a2a;font-weight:700}
.tag{display:inline-block;font-size:.7rem;padding:1px 6px;border-radius:4px;font-weight:600}
.tag.ref{background:#e8f4ff;color:#1c7ed6}.tag.api{background:#f0fff4;color:#2f9e44}
h2{border-bottom:2px solid #3b5bdb;padding-bottom:.4rem;margin-top:2.5rem;font-size:1.1rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
.card{background:#fff;border:1px solid #e8eaed;border-radius:10px;overflow:hidden;break-inside:avoid;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card img{width:100%;height:300px;object-fit:cover;display:block}
.cap{padding:.55rem .75rem;font-size:.75rem;color:#444;line-height:1.5}
.cap strong{display:block;margin-bottom:2px;color:#1a1a1a}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600}
.badge.ok{background:#d3f9d8;color:#2b8a3e}.badge.fail{background:#ffe3e3;color:#c92a2a}
@media print{.card{page-break-inside:avoid}}
</style>
</head>
<body>
<h1>🌏 travelclaw benchmark</h1>
<div class="sub">
  <a href="https://github.com/${repo}/tree/${branch}" target="_blank">${repo}@${branch}</a>
  &nbsp;·&nbsp; ${today}
  &nbsp;·&nbsp; ${charArg || 'character from SOUL.md'}
  &nbsp;·&nbsp; model: 8_image_edit
</div>

<div class="stats">
  <div class="stat"><div class="v">${data.length}</div><div class="l">Rounds</div></div>
  <div class="stat"><div class="v">${ok.length}</div><div class="l">Success</div></div>
  <div class="stat"><div class="v">${fail.length}</div><div class="l">Failed</div></div>
  <div class="stat"><div class="v">${rate}%</div><div class="l">Success Rate</div></div>
  <div class="stat"><div class="v">${avgSug}s</div><div class="l">Avg Suggest</div></div>
  <div class="stat"><div class="v">${avgGen}s</div><div class="l">Avg Gen</div></div>
  <div class="stat"><div class="v">${minGen}s</div><div class="l">Min Gen</div></div>
  <div class="stat"><div class="v">${maxGen}s</div><div class="l">Max Gen</div></div>
  <div class="stat"><div class="v">${refCount}</div><div class="l">From ref</div></div>
  <div class="stat"><div class="v">${apiCount}</div><div class="l">From API</div></div>
</div>

<h2>Results</h2>
<table>
  <thead><tr><th>#</th><th>Scene</th><th>Source</th><th>Suggest</th><th>Gen</th><th>Status</th><th>Image</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<h2>Generated Images (${ok.filter(r=>r.url).length})</h2>
<div class="grid">${cards}</div>
</body>
</html>`;

writeFileSync(outFile, html);
process.stderr.write(`📄 Report → ${outFile}\n`);
process.stdout.write(outFile + '\n');
