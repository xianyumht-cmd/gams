#!/usr/bin/env node
// Diagnostic marker: page5-handler-source-slice
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outputDir = process.env.OUTPUT_DIR || "page5-handler-source-slice";
const secondPath = process.env.CURRENT_SECOND_PATH || "game-engine/release/game-1.0.5.js";
const needle = "SCGMenu";
const radius = 1800;

fs.mkdirSync(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function compactSnippet(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .slice(0, radius * 2 + needle.length + 200);
}

const source = fs.readFileSync(secondPath, "utf8");
const occurrences = [];
let cursor = 0;
while (cursor < source.length) {
  const index = source.indexOf(needle, cursor);
  if (index < 0) break;
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + needle.length + radius);
  const snippet = compactSnippet(source.slice(start, end));
  occurrences.push({
    index,
    start,
    end,
    prefixLength: index - start,
    suffixLength: end - index - needle.length,
    snippetSha256: sha256(Buffer.from(snippet)),
    snippet,
  });
  cursor = index + needle.length;
}

const nearbySignals = occurrences.map((item) => {
  const snippet = item.snippet;
  const localNeedleOffset = item.prefixLength;
  return {
    index: item.index,
    localNeedleOffset,
    hasOnClickText: snippet.includes("onClick"),
    hasPrototypeText: snippet.includes("prototype"),
    hasUndefinedGuardBefore: /typeof\s+SCGMenu|window\.SCGMenu|globalThis\.SCGMenu/.test(snippet.slice(0, localNeedleOffset + needle.length)),
    hasTryText: snippet.includes("try"),
    hasCatchText: snippet.includes("catch"),
    assignmentCharacters: [...snippet.matchAll(/(?:onClick|onclick|addEventListener|SCGMenu)/g)]
      .slice(0, 40)
      .map((match) => ({ value: match[0], offset: match.index })),
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-handler-source-slice",
  source: {
    path: secondPath,
    size: Buffer.byteLength(source),
    sha256: sha256(Buffer.from(source)),
  },
  needle,
  radius,
  occurrences,
  summary: {
    occurrenceCount: occurrences.length,
    occurrenceIndexes: occurrences.map((item) => item.index),
    contextsWithOnClickText: nearbySignals.filter((item) => item.hasOnClickText).length,
    contextsWithUndefinedGuardBefore: nearbySignals.filter((item) => item.hasUndefinedGuardBefore).length,
    contextsWithTryAndCatch: nearbySignals.filter((item) => item.hasTryText && item.hasCatchText).length,
  },
  nearbySignals,
  captureOk: occurrences.length > 0,
  candidatePrepared: false,
  correctionApplied: false,
  apkBuilt: false,
  productionDefaultChanged: false,
  runtimeFilesChanged: false,
  androidClientChanged: false,
  authorizationOutcomeModified: false,
  paymentCompleted: false,
};

fs.writeFileSync(
  path.join(outputDir, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);
console.log(JSON.stringify({ captureOk: report.captureOk, ...report.summary }, null, 2));
if (!report.captureOk) process.exitCode = 1;
