// Offline audio render + analysis.
//
// Opens the game's sound test page in headless Chromium and renders, through an
// OfflineAudioContext and the game's own mixer / limiter / reverb, every sound id, every
// music state, the ambience beds and a 40-trigger stress test. Writes WAVs, spectrograms
// (ffmpeg) and report.json / report.md to scripts/out/audio/.
//
//   npm run audio:render
//   URL=http://localhost:5173/ node scripts/audio-render.mjs
//
// Exits non-zero if anything is silent, contains NaN, clips (true peak > -0.3 dBFS) or the
// page logs an error.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { launch, serve } from './verify/lib.mjs';

const outDir = new URL('./out/audio/', import.meta.url).pathname;
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
  console.warn('ffmpeg not found: spectrograms will be skipped');
}

const { base, close } = await serve(5203);
const { browser, page, problems } = await launch();
const results = [];
const stressAll = [];
const t0 = Date.now();
try {
  await page.goto(`${base}?soundboard=1`);
  await page.waitForFunction(() => !!window.__audioLab, null, { timeout: 120000 });
  const cat = await page.evaluate(() => window.__audioLab.catalog());
  const jobs = [
    ...cat.sounds.map((id) => ['renderSound', id]),
    ...cat.music.map((m) => ['renderMusic', m]),
    ...cat.ambience.map((t) => ['renderAmbience', t]),
  ];
  for (const [fn, arg] of jobs) {
    const r = await page.evaluate(([f, a]) => window.__audioLab[f](a), [fn, arg]);
    results.push(r);
    process.stdout.write(`${r.name.padEnd(22)} ${fmt(r.metrics.lufsMax)} LUFS-M  peak ${fmt(r.metrics.truePeakDb)} dBTP ${r.metrics.flags.join(' ')}\n`);
  }
  for (const mode of ['mixed', 'close', 'flood']) {
    const s = await page.evaluate((m) => window.__audioLab.renderStress(m), mode);
    results.push(s);
    stressAll.push(s);
    process.stdout.write(`${s.name.padEnd(22)} ${JSON.stringify(s.extra)}\n`);
  }
} finally {
  await browser.close();
  await close();
}

function fmt(x, d = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  return x.toFixed(d);
}
const pct = (x) => `${Math.round(x * 100)}%`;

for (const r of results) {
  const wav = `${outDir}${r.name}.wav`;
  writeFileSync(wav, Buffer.from(r.wav, 'base64'));
  if (hasFfmpeg) {
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-lavfi', 'showspectrumpic=s=800x300', `${outDir}${r.name}.png`], { stdio: 'ignore' });
    } catch (e) {
      console.warn(`spectrogram failed for ${r.name}: ${e.message}`);
    }
  }
}

const report = results.map(({ wav, ...rest }) => rest);
writeFileSync(`${outDir}report.json`, JSON.stringify({ generated: new Date().toISOString(), sampleRate: 48000, settings: { sfx: 0.7, music: 0.35 }, items: report }, null, 2));

const bad = report.filter((r) => r.metrics.flags.some((f) => f === 'SILENT' || f === 'NaN' || f === 'CLIP'));
const warn = report.filter((r) => r.metrics.flags.some((f) => f === 'LONG-TAIL' || f === 'DC'));

const md = [];
md.push('# Audio render report', '');
md.push(`Generated ${new Date().toISOString()} · 48 kHz · rendered offline through the game's mix bus (reverb, limiter, ceiling) at default settings (effects 0.7, music 0.35). Sounds are triggered at the camera at volume 1.`, '');
md.push('Columns: **LUFS-M** = max momentary loudness (400 ms), **LUFS-I** = integrated gated loudness, **TP** = true peak (4x oversampled), **raw** = sample peak with the master limiter bypassed, **centroid** = spectral centroid, then energy share below 120 Hz / 120 Hz-2 kHz / above 2 kHz / above 6 kHz.', '');
md.push(`Result: ${bad.length ? `**${bad.length} failing item(s)**` : '**no silent, NaN or clipping items**'}; ${warn.length} warning(s); ${problems.length} page problem(s).`, '');
let group = '';
const header = '| name | dur s | active s | LUFS-M | LUFS-I | RMS dB | TP dBFS | raw dBFS | crest dB | centroid Hz | <120 | 120-2k | >2k | >6k | DC | flags |';
const sep = '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|';
for (const r of report) {
  if (r.group !== group) {
    group = r.group;
    md.push('', `## ${group}`, '', header, sep);
  }
  const m = r.metrics;
  md.push(
    `| ${r.name} | ${fmt(m.duration, 2)} | ${fmt(m.active, 2)} | ${fmt(m.lufsMax)} | ${fmt(m.lufs)} | ${fmt(m.rmsDb)} | ${fmt(m.truePeakDb)} | ${fmt(r.rawPeakDb)} | ${fmt(m.crest)} | ${Math.round(m.centroid)} | ${pct(m.low)} | ${pct(m.mid)} | ${pct(m.high)} | ${pct(m.air)} | ${m.dc.toExponential(1)} | ${m.flags.join(' ')} |`,
  );
}
for (const s of stressAll) {
  md.push('', `## Stress test: ${s.name}`, '');
  for (const [k, v] of Object.entries(s.extra)) md.push(`- ${k}: ${v}`);
  md.push(`- output true peak: ${fmt(s.metrics.truePeakDb, 2)} dBFS, raw (limiter bypassed) peak: ${fmt(s.rawPeakDb, 2)} dBFS`);
}
const slow = report.filter((r) => r.extra?.renderMs !== undefined).sort((a, b) => b.extra.renderMs - a.extra.renderMs).slice(0, 8);
md.push('', '## Slowest sounds to synthesise (all variants, ms)', '');
for (const r of slow) md.push(`- ${r.name}: ${r.extra.renderMs} ms (${r.extra.variants} variants)`);
if (problems.length) md.push('', '## Page problems', '', ...problems.map((p) => `- ${p}`));
writeFileSync(`${outDir}report.md`, md.join('\n') + '\n');

console.log(`\n${results.length} items rendered in ${Math.round((Date.now() - t0) / 1000)} s -> ${outDir}`);
for (const s of stressAll) console.log(`${s.name}: ${JSON.stringify(s.extra)}`);
for (const r of warn) console.log(`warning: ${r.name} ${r.metrics.flags.join(' ')}`);
for (const r of bad) console.log(`FAIL: ${r.name} ${r.metrics.flags.join(' ')}`);
for (const p of problems) console.log(`FAIL: ${p}`);
process.exit(bad.length || problems.length ? 1 : 0);
