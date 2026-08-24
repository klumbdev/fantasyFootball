/* Wird von test_suite.js zusammen mit der Board-Logik ausgewertet - kein
 * eigenstaendiges Skript. P, S, recommend(), survival(), marginal(), needs(),
 * fillSlots(), myPicks() usw. stammen aus draft_board.html. */

"use strict";

/* ================= Grundgeruest ================= */

const MG = MANAGERS.profiles;
const MGNAMES = Object.keys(MG);
const LD = LASTDRAFT;

let seed = 1;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// Was ein Manager erfahrungsgemaess hoechstens hortet (aus dem 2025er-Board:
// bis zu 2 QB, 3 TE, 2 K, 2 DEF kamen real vor).
const OPPCAP = {QB: 2, RB: 9, WR: 9, TE: 3, K: 2, DST: 2};

function fresh(slot){
  S = {drafted: {}, mine: [], order: [], slot, teams: 8, v: 2,
       lineup: {QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1}};
}
const seatFor = pick => {
  const r = Math.ceil(pick / 8), i = (pick - 1) % 8;
  return r % 2 ? i + 1 : 8 - i;
};
// Nur Skill-Spieler tragen eine Projektion; K und DEF zaehlen fuer alle
// Strategien gleichermassen null. Der Vergleich bleibt damit fair.
const lineupPoints = () =>
  fillSlots().slots.reduce((a, s) => a + (s.p && s.p.proj ? s.p.proj : 0), 0);

// "B. Robinson" ist doppelt (Bijan/Brian). P ist nach ADP sortiert - der
// erste Treffer ist der relevante Spieler, also gewinnt der erste Eintrag.
const byName = {};
P.forEach(p => { if (!byName[p.yname]) byName[p.yname] = p; });

function bestAt(pos, cnt){
  const pool = avail().filter(p => p.pos === pos && p.sev !== "out" &&
                                   (cnt[pos] || 0) < OPPCAP[pos]);
  pool.sort((a, b) => (a.lrank || 100 + a.adp) - (b.lrank || 100 + b.adp));
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(Math.abs(rnd() + rnd() - 1) * 3))];
}

function oppPick(profile, round, cnt, script){
  if (script && script.list.length){
    while (script.list.length){
      const nm = script.list.shift(), p = byName[nm];
      if (!p){
        if (!script.warned[nm]){ console.log("   ?? Skriptname unbekannt: " + nm); script.warned[nm] = 1; }
        continue;
      }
      if (S.drafted[p.id]) continue;
      S.drafted[p.id] = "other"; S.order.push(p.id);
      cnt[p.pos] = (cnt[p.pos] || 0) + 1;
      return;
    }
  }
  // Gewohnheitstier-Modell: meistens dieselbe Position wie 2025 in dieser
  // Runde, sonst eine aus der Liga-Rundenverteilung.
  const r = Math.min(round, 15) - 1;
  const pos = rnd() < 0.65 ? profile[r] : LD[r][Math.floor(rnd() * 8)];
  for (const q of [pos, "RB", "WR", "TE", "QB", "DST", "K"]){
    const p = bestAt(q, cnt);
    if (p){ S.drafted[p.id] = "other"; S.order.push(p.id); cnt[q] = (cnt[q] || 0) + 1; return; }
  }
}

let nullRecs = 0;

function userPick(opt){
  const n = pickNo(), round = Math.ceil(n / 8);

  if (opt && opt.vorOnly){
    // Vergleichsstrategie: stur bester VOR, ohne Bedarf und Timing.
    const cap = {QB: 2, RB: 8, WR: 8, TE: 2, K: 1, DST: 1};
    const legal = x => myTeam().filter(y => y.pos === x.pos).length < cap[x.pos];
    let p = avail().filter(x => x.sev !== "out" && x.vorRank && legal(x))
                   .sort((a, b) => a.vorRank - b.vorRank)[0];
    if (!p) p = avail().filter(x => x.sev !== "out" && legal(x))[0];
    if (!p) return null;
    S.drafted[p.id] = "me"; S.order.push(p.id); S.mine.push(p.id);
    return p;
  }

  let pick = null;
  if (opt && opt.force){
    const pos = opt.force(round);
    if (pos){
      pick = avail().filter(p => p.pos === pos && p.sev !== "out")
        .sort((a, b) => (a.lrank || 100 + a.adp) - (b.lrank || 100 + b.adp))[0] || null;
    }
  }
  if (!pick){
    const rec = recommend();
    if (!rec) nullRecs++;
    else {
      let line = [rec.top, ...rec.alts].map(x => x.p);
      if (opt && opt.forbid) line = line.filter(p => !opt.forbid(p, round));
      if (line.length > 1 && opt &&
          (opt.sniped || (opt.follow != null && rnd() > opt.follow))) line.shift();
      pick = line[0] || null;
    }
    if (!pick){
      let pool = avail().filter(p => p.sev !== "out" &&
                                     marginal(p.pos, needs(), myTeam()) > 0);
      if (opt && opt.forbid) pool = pool.filter(p => !opt.forbid(p, round));
      pool.sort((a, b) => (a.vorRank || a.adp + 40) - (b.vorRank || b.adp + 40));
      pick = pool[0] || avail().filter(p => p.sev !== "out")[0] || null;
    }
  }
  if (!pick) return null;
  S.drafted[pick.id] = "me"; S.order.push(pick.id); S.mine.push(pick.id);
  return pick;
}

const PROBE = ["J. Allen", "T. McBride", "B. Bowers", "C. Loveland", "J. Chase"];

function runSim(slot, o){
  o = o || {};
  seed = o.seed != null ? o.seed : 1;
  fresh(slot);
  // Die diesjaehrige Sitzordnung ist unbekannt - Profile je Lauf neu verteilen.
  const names = MGNAMES.slice();
  for (let i = names.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const seating = {}; let k = 0;
  for (let s = 1; s <= 8; s++) if (s !== slot) seating[s] = names[k++];
  const cnt = {}; for (let s = 1; s <= 8; s++) cnt[s] = {};
  const script = o.script ? {list: o.script.slice(), warned: {}} : null;
  const probes = {}, seq = [], got = [];
  let userIdx = 0;
  for (let pick = 1; pick <= 120; pick++){
    const seat = seatFor(pick), round = Math.ceil(pick / 8);
    if (seat === slot){
      userIdx++;
      if (userIdx <= 4){
        probes[userIdx] = {};
        PROBE.forEach(nm => {
          const p = byName[nm];
          probes[userIdx][nm] = !!(p && !S.drafted[p.id]);
        });
      }
      const p = userPick(o.user);
      if (p){ seq.push(p.pos); got.push(p.yname); cnt[seat][p.pos] = (cnt[seat][p.pos] || 0) + 1; }
    } else {
      oppPick(MG[seating[seat]], round, cnt[seat], script);
    }
  }
  return {pts: lineupPoints(), team: myTeam(), seq, got, probes, seating};
}

function audit(team){
  const c = {}; team.forEach(p => c[p.pos] = (c[p.pos] || 0) + 1);
  const errs = [];
  const want = {QB: [1, 1], TE: [1, 2], K: [1, 1], DST: [1, 1], RB: [3, 7], WR: [3, 7]};
  for (const [pos, [lo, hi]] of Object.entries(want)){
    const nn = c[pos] || 0;
    if (nn < lo) errs.push("nur " + nn + " " + pos);
    if (nn > hi) errs.push(nn + " " + pos);
  }
  if (team.length !== 15) errs.push(team.length + " Spieler");
  if (fillSlots().slots.some(s => !s.p)) errs.push("Startplatz offen");
  if (team.some(p => p.sev === "out")) errs.push("Verletzter im Kader");
  team.filter(p => p.pos === "K" || p.pos === "DST").forEach(p => {
    const r = Math.ceil((S.order.indexOf(p.id) + 1) / 8);
    if (r < 12) errs.push(p.pos + " in Runde " + r);
  });
  return {c, errs};
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
const pct = x => Math.round(x * 100) + "%";
const verdicts = [];
function verdict(name, ok, detail){
  verdicts.push([name, ok]);
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + name + (detail ? " - " + detail : ""));
}

/* ================= 1. Hauptlauf ================= */

console.log("=".repeat(72));
console.log("1. HAUPTLAUF - 8 Slots x 40 Drafts gegen die Managerprofile von 2025");
console.log("=".repeat(72));

const main = {};            // slot -> {pts[], probes-Zaehler, seqCount, gotCount, byes3, risks}
let auditErrs = [];
for (let slot = 1; slot <= 8; slot++){
  const rec = {pts: [], avail: {}, seqCount: {}, gotCount: {}, byes3: 0, risks: []};
  for (let i = 0; i < 40; i++){
    const r = runSim(slot, {seed: 20000 + slot * 997 + i * 31});
    rec.pts.push(r.pts);
    const a = audit(r.team);
    a.errs.forEach(e => auditErrs.push("Slot " + slot + ": " + e));
    for (const [idx, m] of Object.entries(r.probes))
      for (const [nm, ok] of Object.entries(m)){
        rec.avail[idx] = rec.avail[idx] || {};
        rec.avail[idx][nm] = (rec.avail[idx][nm] || 0) + (ok ? 1 : 0);
      }
    r.seq.forEach((pos, ri) => {
      rec.seqCount[ri + 1] = rec.seqCount[ri + 1] || {};
      rec.seqCount[ri + 1][pos] = (rec.seqCount[ri + 1][pos] || 0) + 1;
    });
    r.got.slice(0, 4).forEach((nm, ri) => {
      rec.gotCount[ri + 1] = rec.gotCount[ri + 1] || {};
      rec.gotCount[ri + 1][nm] = (rec.gotCount[ri + 1][nm] || 0) + 1;
    });
    const bl = {};
    fillSlots().slots.forEach(s => {
      if (s.p && s.p.pos !== "K" && s.p.pos !== "DST") bl[s.p.bye] = (bl[s.p.bye] || 0) + 1;
    });
    if (Object.values(bl).some(x => x >= 3)) rec.byes3++;
    rec.risks.push(r.team.filter(p => p.sev === "risk").length);
  }
  main[slot] = rec;
}

const modal = cnts => Object.entries(cnts || {}).sort((a, b) => b[1] - a[1])[0];
console.log("\nSlot  Punkte(Starter)   modale Positionsfolge R1-R8");
for (let slot = 1; slot <= 8; slot++){
  const m = main[slot];
  const seq = [];
  for (let r = 1; r <= 8; r++){ const t = modal(m.seqCount[r]); seq.push(t ? t[0] : "-"); }
  console.log("  " + slot + "    " + Math.round(mean(m.pts)) + " +-" +
    Math.round(sd(m.pts)).toString().padEnd(6) + "  " + seq.join("  "));
}

console.log("\nVerfuegbarkeit der Schluesselspieler bei DEINEM Pick (P2/P3):");
console.log("Slot   Allen@P2  McBride@P2  Bowers@P3  Loveland@P3");
for (let slot = 1; slot <= 8; slot++){
  const a = main[slot].avail;
  const g = (idx, nm) => a[idx] && a[idx][nm] != null ? pct(a[idx][nm] / 40) : "  -";
  console.log("  " + slot + "    " + g(2, "J. Allen").padStart(7) + g(2, "T. McBride").padStart(11) +
    g(3, "B. Bowers").padStart(11) + g(3, "C. Loveland").padStart(12));
}

console.log("\nKader-Audit ueber 320 Drafts: " +
  (auditErrs.length ? auditErrs.length + " Verstoesse" : "keine Verstoesse"));
[...new Set(auditErrs)].slice(0, 8).forEach(e => console.log("   " + e));
verdict("Kein Regelverstoss in 320 Profildrafts", auditErrs.length === 0);
const riskAvg = mean([].concat(...Object.values(main).map(m => m.risks)));
console.log("   angeschlagene Spieler pro Kader im Schnitt: " + riskAvg.toFixed(1));

/* ================= 2. Invarianten ================= */

console.log("\n" + "=".repeat(72));
console.log("2. INVARIANTEN");
console.log("=".repeat(72));

const d1 = runSim(4, {seed: 42}), d2 = runSim(4, {seed: 42});
verdict("Determinismus (gleicher Seed, gleiches Ergebnis)",
  d1.pts === d2.pts && JSON.stringify(d1.got) === JSON.stringify(d2.got));

// Laufzeit im Zustand nach drei Runden - dort ist der Pool noch gross.
seed = 7; fresh(4);
for (let pick = 1; pick <= 24; pick++){
  if (seatFor(pick) === 4) userPick();
  else oppPick(MG[MGNAMES[pick % 7]], Math.ceil(pick / 8), {}, null);
}
let tMax = 0; const t0 = Date.now();
for (let i = 0; i < 300; i++){
  const s = Date.now(); recommend(); tMax = Math.max(tMax, Date.now() - s);
}
const tAvg = (Date.now() - t0) / 300;
verdict("recommend() schnell genug fuer die 45-Sekunden-Uhr",
  tAvg < 5 && tMax < 50, tAvg.toFixed(1) + " ms im Schnitt, max " + tMax + " ms");

let mono = true;
fresh(4);
for (const p of P.filter(x => x.adp <= 130).filter((_, i) => i % 9 === 0)){
  let last = 1;
  for (let n = 2; n <= 62; n += 3){
    const sv = survival(p, n);
    if (sv > last + 1e-9) mono = false;
    last = sv;
  }
}
verdict("Ueberlebenswahrscheinlichkeit faellt monoton", mono);

const missing = PROBE.filter(nm => !byName[nm]);
verdict("Alle Schluesselnamen im Datensatz auffindbar", missing.length === 0,
  missing.length ? "fehlt: " + missing.join(", ") : "");

/* ================= 3. Szenarien ================= */

console.log("\n" + "=".repeat(72));
console.log("3. SZENARIEN");
console.log("=".repeat(72));

function batch(nSims, slot, opts){
  const pts = [], extra = [];
  for (let i = 0; i < nSims; i++){
    const r = runSim(slot, Object.assign({seed: 50000 + i * 41 + slot}, opts));
    pts.push(r.pts); extra.push(r);
  }
  return {pts, extra};
}

// --- RB-Run: sieben RBs vor deinem Pick auf Slot 8 (der Fall aus dem Mock) ---
console.log("\nRB-Run - 7 RBs in Folge, du auf Slot 8:");
{
  const script = ["J. Gibbs", "B. Robinson", "J. Taylor", "C. McCaffrey",
                  "J. Cook III", "D. Henry", "D. Achane"];
  let bothWR = 0; const first2 = {};
  for (let i = 0; i < 20; i++){
    const r = runSim(8, {seed: 61000 + i * 17, script});
    if (r.seq[0] === "WR" && r.seq[1] === "WR") bothWR++;
    const key = r.got[0] + " + " + r.got[1];
    first2[key] = (first2[key] || 0) + 1;
  }
  Object.entries(first2).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .forEach(([k, n]) => console.log("   Picks 8+9: " + k + "  (" + n + "x)"));
  verdict("RB-Run wird mit zwei Elite-WRs beantwortet", bothWR >= 18, bothWR + "/20 mit WR+WR");
}

// --- QB-Run: Allen, Lamar, Maye weg bevor du dran bist (Slot 6) ---
console.log("\nQB-Run - drei QBs in den ersten fuenf Picks, du auf Slot 6:");
{
  const script = ["J. Allen", "L. Jackson", "D. Maye", "J. Gibbs", "B. Robinson"];
  const base = batch(20, 6, {});
  const run = [];
  let qbRounds = [];
  for (let i = 0; i < 20; i++){
    const r = runSim(6, {seed: 62000 + i * 13, script});
    run.push(r.pts);
    const qi = r.seq.indexOf("QB");
    qbRounds.push(qi >= 0 ? qi + 1 : 99);
  }
  qbRounds.sort((a, b) => a - b);
  const med = qbRounds[10];
  console.log("   QB kommt im Median in Runde " + med +
    " (frueh " + qbRounds[0] + ", spaet " + qbRounds[19] + ")");
  console.log("   Punkte: " + Math.round(mean(run)) + " gegen " +
    Math.round(mean(base.pts)) + " im Normalfall (" +
    Math.round(mean(run) - mean(base.pts)) + ")");
  verdict("Kein Panikgriff nach flachen QBs", med >= 4,
    "das QB-Feld hinter der Spitze ist flach, Warten ist richtig");
  verdict("QB-Run kostet keine 50 Punkte", mean(base.pts) - mean(run) < 50);
}

// --- TE-Leerlauf: die vier besten TEs weg bis Pick 25, du auf Slot 8 ---
console.log("\nTE-Leerlauf - McBride, Bowers, Loveland, Warren frueh weg, du auf Slot 8:");
{
  const script = ["J. Gibbs", "T. McBride", "B. Bowers", "B. Robinson", "C. Loveland",
                  "T. Warren", "C. McCaffrey", "J. Taylor", "D. Achane", "J. Cook III",
                  "S. Barkley", "D. Henry", "A. St. Brown", "K. Walker"];
  const base = batch(20, 8, {});
  const run = []; let teRounds = [], teGot = {};
  for (let i = 0; i < 20; i++){
    const r = runSim(8, {seed: 63000 + i * 19, script});
    run.push(r.pts);
    const ti = r.seq.indexOf("TE");
    teRounds.push(ti >= 0 ? ti + 1 : 99);
    const te = r.team.find(p => p.pos === "TE");
    if (te) teGot[te.yname] = (teGot[te.yname] || 0) + 1;
  }
  teRounds.sort((a, b) => a - b);
  console.log("   TE kommt im Median in Runde " + teRounds[10] + "; genommen wird: " +
    Object.entries(teGot).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => k + " (" + n + "x)").join(", "));
  console.log("   Punkte: " + Math.round(mean(run)) + " gegen " + Math.round(mean(base.pts)) +
    " im Normalfall (" + Math.round(mean(run) - mean(base.pts)) + ")");
  verdict("TE-Leerlauf: kein Zwangsgriff, Verlust begrenzt",
    mean(base.pts) - mean(run) < 55 && teRounds[10] >= 4);
}

// --- Staendig weggeschnappt: du bekommst nie die Erstempfehlung ---
console.log("\nWeggeschnappt - jede Erstempfehlung ist weg, du nimmst die Zweitwahl:");
{
  const slots = [1, 4, 8]; let deltas = [];
  for (const slot of slots){
    const base = batch(20, slot, {});
    const snip = batch(20, slot, {user: {sniped: true}});
    deltas.push(mean(base.pts) - mean(snip.pts));
    console.log("   Slot " + slot + ": " + Math.round(mean(snip.pts)) + " statt " +
      Math.round(mean(base.pts)) + "  (" + Math.round(mean(snip.pts) - mean(base.pts)) + ")");
  }
  // 15 erzwungene Zweitwahlen pro Draft - fair ist der Verlust JE Wegschnappen,
  // nicht die Summe eines Falls, der real nie eintritt.
  const perSnipe = Math.max(...deltas) / 15;
  verdict("Zweitwahl traegt: unter 6 Punkten je Wegschnappen",
    perSnipe < 6, perSnipe.toFixed(1) + " Punkte pro erzwungener Zweitwahl im schlechtesten Slot");
}

// --- Du folgst dem Board nur zu 70 Prozent ---
console.log("\nEigensinn - Empfehlung nur zu 70% befolgt, sonst die Alternative:");
{
  const slots = [1, 4, 8]; let deltas = [];
  for (const slot of slots){
    const base = batch(20, slot, {});
    const dev = batch(20, slot, {user: {follow: 0.7}});
    deltas.push(mean(base.pts) - mean(dev.pts));
  }
  verdict("Abweichen kostet wenig (unter 25 Punkten)",
    Math.max(...deltas) < 25,
    "im Mittel " + Math.round(mean(deltas)) + " Punkte");
}

// --- Verletzungswelle: die zwoelf besten Spieler alle angeschlagen ---
console.log("\nVerletzungswelle - Top 12 nach VOR ploetzlich alle 'angeschlagen':");
{
  const top = P.filter(p => p.vorRank && p.vorRank <= 12);
  const before = top.map(p => [p, p.sev, p.injNote]);
  top.forEach(p => { if (!p.sev){ p.sev = "risk"; p.injNote = "Test"; } });
  let eliteCount = [], outCount = 0;
  for (let i = 0; i < 20; i++){
    const r = runSim(4, {seed: 64000 + i * 23});
    eliteCount.push(r.team.filter(p => p.vorRank && p.vorRank <= 15).length);
    outCount += r.team.filter(p => p.sev === "out").length;
  }
  before.forEach(([p, s, n]) => { p.sev = s; p.injNote = n; });
  verdict("Elite wird trotz Risiko-Etikett nicht gemieden",
    mean(eliteCount) >= 3, mean(eliteCount).toFixed(1) + " Top-15-Spieler pro Kader");
  verdict("Dauerhaft Ausgefallene bleiben draussen", outCount === 0);
}

/* ================= 4. A/B: gibt es eine bessere feste Reihenfolge? ================= */

console.log("\n" + "=".repeat(72));
console.log("4. A/B - feste Vorgaben gegen die freie Board-Entscheidung");
console.log("=".repeat(72));

function ab(label, variants){
  console.log("\n" + label);
  const rows = {};
  for (const [name, user] of variants){
    const per = [];
    for (const slot of [1, 4, 8]){
      const b = batch(20, slot, user ? {user} : {});
      per.push(mean(b.pts));
    }
    rows[name] = mean(per);
    console.log("   " + name.padEnd(30) + Math.round(mean(per)) + "  (Slots 1/4/8: " +
      per.map(x => Math.round(x)).join(" / ") + ")");
  }
  return rows;
}

const abQB = ab("QB-Timing:", [
  ["Board entscheidet frei", null],
  ["QB in Runde 2 erzwingen", {force: r => r === 2 ? "QB" : null}],
  ["QB verboten bis Runde 8", {forbid: (p, r) => p.pos === "QB" && r < 8}],
]);
const abTE = ab("TE-Timing:", [
  ["Board entscheidet frei", null],
  ["TE in Runde 3 erzwingen", {force: r => r === 3 ? "TE" : null}],
  ["TE verboten bis Runde 8", {forbid: (p, r) => p.pos === "TE" && r < 8}],
]);
const abRB = ab("Start-Muster:", [
  ["Board entscheidet frei", null],
  ["RB-RB erzwingen (R1+R2)", {force: r => r <= 2 ? "RB" : null}],
  ["WR-WR erzwingen (R1+R2)", {force: r => r <= 2 ? "WR" : null}],
]);
verdict("Keine feste Vorgabe schlaegt das Board deutlich (>15 Punkte)",
  Math.max(...Object.values(abQB), ...Object.values(abTE), ...Object.values(abRB)) <
  abQB["Board entscheidet frei"] + 15);

/* ================= 5. Replay: dein 2025er-Ich gegen das Board ================= */

console.log("\n" + "=".repeat(72));
console.log("5. REPLAY - deine 2025er-Reihenfolge (WR,RB,QB,WR,RB,...) gegen das Board");
console.log("=".repeat(72));

{
  const prof = MANAGERS.userProfile2025;
  const you = [], board = [], vor = [];
  for (let slot = 1; slot <= 8; slot++){
    for (let i = 0; i < 12; i++){
      const sd_ = 70000 + slot * 771 + i * 37;
      board.push(runSim(slot, {seed: sd_}).pts);
      you.push(runSim(slot, {seed: sd_, user: {force: r => prof[r - 1]}}).pts);
      vor.push(runSim(slot, {seed: sd_, user: {vorOnly: true}}).pts);
    }
  }
  console.log("   Board:                " + Math.round(mean(board)));
  console.log("   Deine 2025er-Folge:   " + Math.round(mean(you)) +
    "  (" + Math.round(mean(you) - mean(board)) + ")");
  console.log("   Stur bester VOR:      " + Math.round(mean(vor)) +
    "  (" + Math.round(mean(vor) - mean(board)) + ")");
  verdict("Board schlaegt deine 2025er-Reihenfolge", mean(board) > mean(you));

  // Bye-Ballung: wie oft landen drei Skill-Starter in derselben Woche?
  let bBoard = 0, bVor = 0;
  for (let slot = 1; slot <= 8; slot++){
    for (let i = 0; i < 10; i++){
      const sd_ = 80000 + slot * 311 + i * 53;
      runSim(slot, {seed: sd_});
      const bl = {};
      fillSlots().slots.forEach(s => {
        if (s.p && s.p.pos !== "K" && s.p.pos !== "DST") bl[s.p.bye] = (bl[s.p.bye] || 0) + 1;
      });
      if (Object.values(bl).some(x => x >= 3)) bBoard++;
      runSim(slot, {seed: sd_, user: {vorOnly: true}});
      const b2 = {};
      fillSlots().slots.forEach(s => {
        if (s.p && s.p.pos !== "K" && s.p.pos !== "DST") b2[s.p.bye] = (b2[s.p.bye] || 0) + 1;
      });
      if (Object.values(b2).some(x => x >= 3)) bVor++;
    }
  }
  console.log("   Drei Starter in derselben Bye-Woche: Board " + pct(bBoard / 80) +
    ", ohne Bye-Logik " + pct(bVor / 80));
  verdict("Bye-Logik reduziert Ballungen", bBoard <= bVor);
}

console.log("\nOffene Empfehlungsluecken (recommend lieferte null): " + nullRecs);
verdict("Immer eine Empfehlung vorhanden", nullRecs === 0);

/* ================= 6. Dossier ================= */

console.log("\n" + "=".repeat(72));
console.log("6. GEGNER-DOSSIER (aus dem 2025er-Draft)");
console.log("=".repeat(72));
const qbR = prof => prof.map((p, i) => p === "QB" ? i + 1 : 0).filter(Boolean);
const firstR = (prof, pos) => { const i = prof.indexOf(pos); return i < 0 ? "-" : i + 1; };
console.log("\nManager     Platz  QB-Runden  1.TE  1.DEF  1.K   Eigenheit");
for (const nm of MGNAMES){
  const p = MG[nm];
  console.log("  " + nm.padEnd(10) + String(MANAGERS.standings2025[nm]).padStart(4) +
    ("R" + qbR(p).join("+R")).padStart(10) + String(firstR(p, "TE")).padStart(6) +
    String(firstR(p, "DST")).padStart(7) + String(firstR(p, "K")).padStart(5) +
    "   " + MANAGERS.notable[nm]);
}
console.log("\n  Auffaellig: die zwei spaetesten Erst-QBs (peter R9, Lukas R8) wurden");
console.log("  Erster und Dritter; der frueheste (Malocher, Lamar R2) wurde Letzter.");

/* ================= Fazit + Cheatsheet ================= */

console.log("\n" + "=".repeat(72));
const fails = verdicts.filter(v => !v[1]);
console.log("FAZIT: " + (verdicts.length - fails.length) + "/" + verdicts.length +
  " Pruefungen bestanden" + (fails.length ? " - OFFEN: " + fails.map(f => f[0]).join("; ") : ""));
console.log("=".repeat(72));

/* CHEATSHEET.md fuer den Draftabend schreiben */
{
  let md = "# Spickzettel Draftabend\n\n*Football Fanatics 2 · 24.08.2026, 20:15 · 8 Teams · 45 s pro Pick*\n\n";
  md += "Alle Zahlen aus Simulationen gegen die Managerprofile des 2025er-Drafts\n";
  md += "(je Slot 40 vollstaendige Drafts). Punkte = projizierte Saisonpunkte der\n";
  md += "Skill-Starter mit eurem Scoring (6 Punkte je Pass-TD).\n\n";
  md += "## Sobald die Reihenfolge ausgelost ist (ca. 19:45)\n\n";
  md += "Board oeffnen, **Reset**, Teams 8, deinen Slot setzen. Danach gilt die Zeile\n";
  md += "deines Slots:\n\n";
  md += "| Slot | Picks 1-4 | typische Folge R1-R8 | Punkte |\n|---|---|---|---|\n";
  for (let slot = 1; slot <= 8; slot++){
    fresh(slot);
    const picks = myPicks().slice(0, 4).join(", ");
    const m = main[slot], seq = [];
    for (let r = 1; r <= 8; r++){ const t = modal(m.seqCount[r]); seq.push(t ? t[0] : "-"); }
    md += "| **" + slot + "** | " + picks + " | " + seq.join(" ") + " | ~" + Math.round(mean(m.pts)) + " |\n";
  }
  md += "\n## Wer ist bei deinem Pick realistisch noch da?\n\n";
  md += "| Slot | Allen @P2 | McBride @P2 | Bowers @P3 | Loveland @P3 |\n|---|---|---|---|---|\n";
  for (let slot = 1; slot <= 8; slot++){
    const a = main[slot].avail;
    const g = (idx, nm) => a[idx] && a[idx][nm] != null ? pct(a[idx][nm] / 40) : "-";
    md += "| " + slot + " | " + g(2, "J. Allen") + " | " + g(2, "T. McBride") + " | " +
      g(3, "B. Bowers") + " | " + g(3, "C. Loveland") + " |\n";
  }
  md += "\n## Haeufigste Picks des Boards in den ersten Runden\n\n";
  for (let slot = 1; slot <= 8; slot++){
    const m = main[slot], parts = [];
    for (let r = 1; r <= 3; r++){
      const top = Object.entries(m.gotCount[r] || {}).sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([k]) => k).join(" / ");
      parts.push("R" + r + ": " + top);
    }
    md += "- **Slot " + slot + "** — " + parts.join(" · ") + "\n";
  }
  md += "\n## Deine Gegner (aus dem 2025er-Draft)\n\n";
  md += "| Manager | Platz 2025 | QB | erster TE | erste DEF | erster K |\n|---|---|---|---|---|---|\n";
  for (const nm of MGNAMES){
    const p = MG[nm];
    md += "| " + nm + " | " + MANAGERS.standings2025[nm] + " | R" + qbR(p).join(" + R") +
      " | R" + firstR(p, "TE") + " | R" + firstR(p, "DST") + " | R" + firstR(p, "K") + " |\n";
  }
  md += "\n- **Malocher** nimmt den QB frueh (Lamar R2) — sitzt er kurz nach dir, ist Allen frueher weg.\n";
  md += "- **Mika** nimmt QB R3 und TE R4 — der zweite fruehe QB/TE-Zugriff.\n";
  md += "- **Dominik** zieht die erste Defense (R7), **Saison-Out** den ersten Kicker (R11). Beides ignorieren.\n";
  md += "- **peter** (Meister) und **Lukas** (Dritter) warteten am laengsten auf ihren QB.\n";
  md += "\n## Merksaetze\n\n";
  md += "1. Dem violetten Feld folgen — die Zweitwahl kostet im Schnitt fast nichts, Eigensinn ist erlaubt.\n";
  md += "2. Ein QB, ein TE, ein Kicker, eine Defense. Keine Backups auf diesen Positionen.\n";
  md += "3. Kicker und Defense erst Runde 14/15, egal was die anderen tun.\n";
  md += "4. Ein RB- oder WR-Run der anderen ist dein Rabatt auf die jeweils andere Position.\n";
  md += "5. Wenn du rausfliegst: Pickliste kopieren, in 'Picks abgleichen' einfuegen, weiter.\n";
  md += "\n*Sag nach der Auslosung kurz durch, wer auf welchem Slot sitzt — dann sage ich dir,*\n";
  md += "*was die Sitznachbarn erfahrungsgemaess vor dir wegnehmen.*\n";
  fs.writeFileSync(path.join(root, "CHEATSHEET.md"), md);
  console.log("\nCHEATSHEET.md geschrieben (" + md.length + " Zeichen)");
}
