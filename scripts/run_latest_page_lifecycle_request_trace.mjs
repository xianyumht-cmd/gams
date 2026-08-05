#!/usr/bin/env node
// Diagnostic marker: page5-second-purchase-callchain-slice
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outputDir = process.env.OUTPUT_DIR || "page5-second-purchase-callchain-slice";
const sourcePath = process.env.CURRENT_SECOND_PATH || "/tmp/current-game-1.0.5.js";
const expectedSha256 = process.env.CURRENT_SECOND_SHA256 || "57765fbb8d9a0529ed1463623f1bed9c05052e76396a6aaa89fdd2ecc673bc72";
const radius = 5200;
const tokenRadius = 1400;

const targets = [
  { label: "SAL_Login", offset: 3522415, token: "SAL_Login" },
  { label: "jH", offset: 1935617, token: "jH" },
  { label: "scxSa", offset: 397012, token: "scxSa" },
  { label: "CxiCB", offset: 2035610, token: "CxiCB" },
  { label: "anonymous-after-CxiCB", offset: 2058919, token: null },
  { label: "anonymous-before-CxiCB", offset: 2046389, token: null },
  { label: "runtime-event-callback", offset: 1309128, token: null },
];

fs.mkdirSync(outputDir, { recursive: true });

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function redact(value) {
  return String(value || "")
    .replace(/([?&](?:token|access_token|auth|authorization|code|ticket|session|sid|key|password|pwd)=)[^&#\s"'`]+/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function formatMinified(value) {
  const input = redact(value);
  let output = "";
  let quote = null;
  let escaped = false;
  for (const char of input) {
    if (quote !== null) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      continue;
    }
    if (char === ";") output += ";\n";
    else if (char === "{") output += "{\n";
    else if (char === "}") output += "\n}\n";
    else output += char;
  }
  return output.replace(/\n{3,}/g, "\n\n").slice(0, radius * 3);
}

function exactTokenPositions(source, token) {
  if (!token) return [];
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(^|[^A-Za-z0-9_$])(${escaped})(?=$|[^A-Za-z0-9_$])`, "g");
  const positions = [];
  let match;
  while ((match = expression.exec(source)) !== null) {
    positions.push(match.index + match[1].length);
    if (positions.length >= 5000) break;
  }
  return positions;
}

const source = fs.readFileSync(sourcePath, "utf8");
const sourceSha256 = sha256(Buffer.from(source));
if (sourceSha256 !== expectedSha256) throw new Error(`runtime sha mismatch: ${sourceSha256}`);

const tokenInventory = {};
for (const target of targets) {
  if (!target.token || tokenInventory[target.token]) continue;
  const positions = exactTokenPositions(source, target.token);
  tokenInventory[target.token] = { count: positions.length, positions };
}

const slices = targets.map((target) => {
  if (target.offset < 0 || target.offset >= source.length) throw new Error(`offset outside source: ${target.label} ${target.offset}`);
  const start = Math.max(0, target.offset - radius);
  const end = Math.min(source.length, target.offset + radius);
  const raw = redact(source.slice(start, end));
  const positions = target.token ? tokenInventory[target.token].positions : [];
  const nearestTokenOffset = positions.length
    ? positions.reduce((best, item) => Math.abs(item - target.offset) < Math.abs(best - target.offset) ? item : best, positions[0])
    : null;
  const nearestStart = nearestTokenOffset === null ? null : Math.max(0, nearestTokenOffset - tokenRadius);
  const nearestEnd = nearestTokenOffset === null ? null : Math.min(source.length, nearestTokenOffset + target.token.length + tokenRadius);
  const nearestRaw = nearestTokenOffset === null ? null : redact(source.slice(nearestStart, nearestEnd));
  return {
    label: target.label,
    traceOffset: target.offset,
    token: target.token,
    start,
    end,
    sourceLength: source.length,
    snippetSha256: sha256(Buffer.from(raw)),
    raw,
    formatted: formatMinified(raw),
    tokenOccurrenceCount: target.token ? tokenInventory[target.token].count : null,
    nearestTokenOffset,
    nearestTokenDistance: nearestTokenOffset === null ? null : nearestTokenOffset - target.offset,
    nearestTokenContext: nearestRaw === null ? null : {
      start: nearestStart,
      end: nearestEnd,
      snippetSha256: sha256(Buffer.from(nearestRaw)),
      raw: nearestRaw,
      formatted: formatMinified(nearestRaw),
    },
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "page5-second-purchase-callchain-slice",
  captureOk: slices.length === targets.length,
  candidatePrepared: false,
  correctionApplied: false,
  sourcePathClass: "isolated-implementation-runtime",
  sourceSize: Buffer.byteLength(source),
  sourceSha256,
  expectedSha256,
  radius,
  targets,
  tokenInventory,
  slices,
  summary: {
    sliceCount: slices.length,
    targetCount: targets.length,
    exactTokenTargets: targets.filter((item) => item.token).length,
    exactTokenMatches: slices.filter((item) => item.token && item.nearestTokenOffset !== null).length,
    runtimeFilesChanged: false,
    productionDefaultChanged: false,
    androidClientChanged: false,
    apkBuilt: false,
    paymentCompleted: false,
  },
};

fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ captureOk: report.captureOk, sourceSha256, ...report.summary }, null, 2));
if (!report.captureOk) process.exitCode = 1;
