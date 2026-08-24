#!/usr/bin/env node
/* Spielt vollstaendige Drafts durch und prueft die entstehenden Kader.
 *
 * Einzelne Funktionen zu testen haette die eigentlichen Fehler nicht gefunden:
 * vier QBs auf einer Bank, ein Kicker in Runde 7, ein Vorschlag mit null
 * Prozent Wahrscheinlichkeit. Die zeigen sich erst am fertigen Kader.
 *
 * Die Gegner draften nach der Positionsverteilung der Vorsaison (siehe
 * last_draft.json), nicht nach nationaler ADP - diese Liga zieht QBs frueh
 * und Defenses ab Runde sieben.
 *
 *   node tools/simulate_draft.js            400 Drafts, Kaderformen pruefen
 *   node tools/simulate_draft.js compare    Board gegen VOR und ADP
 */

const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "draft_board.html"), "utf8");
const logic = html.match(/<script>([\s\S]*)<\/script>/)[1].split("/* ---- Bedienung ---- */")[0];
const lastDraft = fs.readFileSync(path.join(__dirname, "last_draft.json"), "utf8");

// Board-Logik und Simulation im selben Kontext auswerten. Getrennt geht es
// nicht: const-Deklarationen aus einem eval bleiben in dessen Geltungsbereich.
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.document = {getElementById: () => ({})};
globalThis.MODE = process.argv[2] || "audit";

const SIM = `
const LASTDRAFT = JSON.parse(${JSON.stringify(lastDraft)}).rounds;
let seed = 1;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const boardRank = p => p.lrank ? p.lrank : (p.adp || 300);

// Gegnermodell aus der Vorsaison: Position nach Rundenverteilung ziehen,
// dann den Besten dieser Position nehmen. Bildet ab, dass diese Liga QBs
// frueh und Defenses ab Runde 7 zieht - beides weicht vom Markt ab.
function opponentPick(round){
  const dist = LASTDRAFT[Math.min(round, 15) - 1];
  const order = [dist[Math.floor(rnd() * dist.length)], "RB", "WR", "TE", "QB", "K", "DST"];
  for (const pos of order){
    const pool = avail().filter(p => p.pos === pos && p.sev !== "out")
                        .sort((a, b) => boardRank(a) - boardRank(b));
    if (!pool.length) continue;
    const k = Math.min(pool.length - 1, Math.floor(Math.abs(rnd() + rnd() - 1) * 4));
    const p = pool[k];
    S.drafted[p.id] = "other"; S.order.push(p.id);
    return p;
  }
}
function fresh(slot){
  S = {drafted:{}, mine:[], order:[], slot, teams:8, v:2,
       lineup:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:1,DST:1}};
}
const lineupPoints = () =>
  fillSlots().slots.reduce((a, s) => a + (s.p && s.p.proj ? s.p.proj : 0), 0);

function myPick(strategy){
  let p = null;
  const cap = {QB:2, RB:8, WR:8, TE:2, K:1, DST:1};
  const legal = x => myTeam().filter(y => y.pos === x.pos).length < cap[x.pos];
  if (strategy === "board"){ const r = recommend(); p = r && r.top.p; }
  else if (strategy === "adp") p = avail().filter(x => x.sev !== "out" && legal(x)).sort((a,b)=>a.adp-b.adp)[0];
  else if (strategy === "vor") p = avail().filter(x => x.sev !== "out" && x.vorRank && legal(x)).sort((a,b)=>a.vorRank-b.vorRank)[0];
  if (!p) p = avail().filter(x => x.sev !== "out" && legal(x))[0];
  if (!p) return;
  S.drafted[p.id] = "me"; S.order.push(p.id); S.mine.push(p.id);
}
function runDraft(slot, strategy, sd){
  seed = sd; fresh(slot);
  const mine = new Set(myPicks().slice(0, 15));
  for (let pick = 1; pick <= 120; pick++){
    if (mine.has(pick)) myPick(strategy);
    else opponentPick(Math.ceil(pick / 8));
  }
  return lineupPoints();
}


if (MODE === "compare"){
console.log("=== Strategievergleich: 20 Drafts je Slot, Punkte der Startaufstellung ===\\n");
console.log("Slot   Board    nur VOR    nur ADP    Vorsprung");
const tot = {board:0, vor:0, adp:0};
for (let slot = 1; slot <= 8; slot++){
  const avg = {};
  for (const st of ["board","vor","adp"]){
    let s = 0;
    for (let i = 0; i < 20; i++) s += runDraft(slot, st, 1000 + i * 31 + slot);
    avg[st] = s / 20; tot[st] += avg[st];
  }
  const d = avg.board - Math.max(avg.vor, avg.adp);
  console.log(\`  \${slot}   \${avg.board.toFixed(0).padStart(6)}  \${avg.vor.toFixed(0).padStart(9)}  \${avg.adp.toFixed(0).padStart(9)}   \${(d>=0?"+":"")+d.toFixed(0)}\`);
}
console.log(\`\\nMittel  \${(tot.board/8).toFixed(0)}     \${(tot.vor/8).toFixed(0)}       \${(tot.adp/8).toFixed(0)}\`);

} else {
// ---- 400 Drafts: Kaderform pruefen und typische Verlaeufe sammeln ----
const shapes = {}, byRound = {}, gone = {}, errs = [];
for (let slot = 1; slot <= 8; slot++){
  for (let i = 0; i < 50; i++){
    seed = 7000 + i * 13 + slot * 101; fresh(slot);
    const mine = new Set(myPicks().slice(0, 15));
    const myRounds = {};
    for (let pick = 1; pick <= 120; pick++){
      if (mine.has(pick)){
        const before = S.mine.length; myPick("board");
        if (S.mine.length > before){
          const p = P.find(x => x.id === S.mine[S.mine.length-1]);
          myRounds[Math.ceil(pick/8)] = p;
        }
      } else opponentPick(Math.ceil(pick/8));
    }
    const team = myTeam(), c = {};
    team.forEach(p => c[p.pos] = (c[p.pos]||0)+1);
    const key = ["QB","RB","WR","TE","K","DST"].map(p => (c[p]||0)).join("-");
    shapes[key] = (shapes[key]||0)+1;

    // Regelverstoesse sammeln
    if ((c.QB||0) > 1) errs.push(\`Slot \${slot}: \${c.QB} QB\`);
    if ((c.TE||0) > 2) errs.push(\`Slot \${slot}: \${c.TE} TE\`);
    if ((c.K||0) > 1 || (c.DST||0) > 1) errs.push(\`Slot \${slot}: \${c.K} K / \${c.DST} DST\`);
    if (team.length !== 15) errs.push(\`Slot \${slot}: \${team.length} Spieler\`);
    if (fillSlots().slots.some(s => !s.p)) errs.push(\`Slot \${slot}: Startplatz offen\`);
    if (team.some(p => p.sev === "out")) errs.push(\`Slot \${slot}: Verletzter im Kader\`);
    team.filter(p => p.pos==="K"||p.pos==="DST").forEach(p => {
      const r = Math.ceil((S.order.indexOf(p.id)+1)/8);
      if (r < 12) errs.push(\`Slot \${slot}: \${p.pos} in Runde \${r}\`);
    });

    for (const [r, p] of Object.entries(myRounds)){
      byRound[slot] = byRound[slot] || {};
      byRound[slot][r] = byRound[slot][r] || {};
      byRound[slot][r][p.pos] = (byRound[slot][r][p.pos]||0)+1;
    }
    ["J. Allen","T. McBride","B. Bowers","J. Gibbs","J. Chase"].forEach(nm => {
      const p = P.find(x => x.yname === nm);
      if (p && S.drafted[p.id]){
        const r = Math.ceil((S.order.indexOf(p.id)+1)/8);
        gone[nm] = gone[nm] || []; gone[nm].push(r);
      }
    });
  }
}
console.log("=== 400 simulierte Drafts: Kaderform (QB-RB-WR-TE-K-DST) ===");
Object.entries(shapes).sort((a,b)=>b[1]-a[1]).forEach(([k,n]) =>
  console.log(\`   \${k}   \${String(n).padStart(3)}x   \${(n/4).toFixed(0)}%\`));
console.log("\\nRegelverstoesse:", errs.length ? errs.length : "keine");
[...new Set(errs)].slice(0,6).forEach(e => console.log("   " + e));

console.log("\\n=== Wann gehen die Schluesselspieler weg? (Median-Runde) ===");
for (const [nm, rs] of Object.entries(gone)){
  rs.sort((a,b)=>a-b);
  console.log(\`   \${nm.padEnd(12)} Runde \${rs[Math.floor(rs.length/2)]}   (frueh \${rs[0]}, spaet \${rs[rs.length-1]})\`);
}
console.log("\\n=== Was das Board je Runde nimmt (haeufigste Position) ===");
console.log("Slot  R1   R2   R3   R4   R5   R6   R7   R8");
for (let slot=1; slot<=8; slot++){
  const row=[];
  for (let r=1; r<=8; r++){
    const c=(byRound[slot]||{})[r]||{};
    const best=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
    row.push(best ? (best[0]+"("+Math.round(best[1]/50*100)+"%)").padEnd(5) : "  -  ");
  }
  console.log("  "+slot+"   "+row.join(" "));
}

}

`;
eval(logic + SIM);
