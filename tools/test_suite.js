#!/usr/bin/env node
/* Testsuite gegen den Draft-Agenten.
 *
 * Laedt die Entscheidungslogik zur Laufzeit aus draft_board.html (immer der
 * echte Stand, nie eine Kopie), setzt ihr die Gegnerprofile aus dem
 * Vorsaison-Draft entgegen und prueft:
 *
 *   1  Hauptlauf     320 Drafts gegen profilierte Gegner, Kader-Audit,
 *                    Verfuegbarkeit der Schluesselspieler je Slot
 *   2  Invarianten   Determinismus, Laufzeit, Monotonie der Wahrscheinlichkeit
 *   3  Szenarien     RB-Run, QB-Run, TE-Leerlauf, staendig weggeschnappt,
 *                    Empfehlung nur zu 70% befolgt, Verletzungswelle
 *   4  A/B           QB frueh vs spaet, TE frueh vs spaet, RB- vs WR-Start
 *   5  Replay        deine eigene 2025er-Reihenfolge gegen das Board
 *   6  Dossier       was jeder Gegner erfahrungsgemaess tut
 *
 * Schreibt zum Schluss CHEATSHEET.md fuer den Draftabend.
 *
 *   node tools/test_suite.js
 */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "draft_board.html"), "utf8");
const logic = html.match(/<script>([\s\S]*)<\/script>/)[1].split("/* ---- Bedienung ---- */")[0];
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.document = {getElementById: () => ({})};
const MANAGERS = JSON.parse(fs.readFileSync(path.join(__dirname, "managers_2025.json"), "utf8"));
const LASTDRAFT = JSON.parse(fs.readFileSync(path.join(__dirname, "last_draft.json"), "utf8")).rounds;
const body = fs.readFileSync(path.join(__dirname, "test_suite_body.js"), "utf8");
// eval ist hier Absicht und ungefaehrlich: es fuehrt ausschliesslich unsere
// eigenen, lokalen Dateien aus (draft_board.html + test_suite_body.js) - kein
// fremder Input. Der Umweg existiert, damit die Tests immer gegen die echte
// Board-Logik laufen statt gegen eine einfrierende Kopie.
eval(logic + "\n" + body);
