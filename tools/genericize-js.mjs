#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as acorn from 'acorn';

const MARKER = 'GJS_ANONYMIZED_V1';
const TARGETS = [
  'remote-script/src/noname.js',
  'game-engine/release/game-1.0.5.js',
];
const DOC_PATH = 'docs/GENERIC_JS_ANONYMIZATION.md';
const PRIVATE_MAP_DEFAULT = '.gjs-private-map.json';

function parse(source, comments = []) {
  return acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowHashBang: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    onComment: comments,
  });
}

function classify(value, kind) {
  if (kind === 'regex') return 'RX';
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) return 'URL';
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(value)) return 'HOST';
  if (/^(?:\/|\.\/|\.\.\/)/.test(value)) return 'PATH';
  if (/^[.#\[]/.test(value) || /[>+~][.#\[]?/.test(value)) return 'SEL';
  if (/[^\x00-\x7f]/.test(value) || /\s/.test(value)) return 'TEXT';
  return kind === 'template' ? 'TPL' : 'STR';
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visitor);
    }
  }
}

function templateRange(source, node) {
  const raw = node?.value?.raw;
  if (!raw) return null;
  if (source.slice(node.start, node.end) === raw) return [node.start, node.end];
  const lo = Math.max(0, node.start - 2);
  const hi = Math.min(source.length, node.end + 2);
  const nearby = source.slice(lo, hi);
  const offset = nearby.indexOf(raw);
  if (offset < 0) {
    throw new Error(`Unable to locate template element at ${node.start}:${node.end}`);
  }
  return [lo + offset, lo + offset + raw.length];
}

function makePlan(source, file, state) {
  const comments = [];
  const ast = parse(source, comments);
  const items = [];
  const occupied = new Set();

  walk(ast, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (node.value === '' || node.value === 'use strict') return;
      items.push({
        start: node.start,
        end: node.end,
        originalSource: source.slice(node.start, node.end),
        value: node.value,
        kind: 'string',
      });
      return;
    }
    if (node.type === 'Literal' && node.regex) {
      items.push({
        start: node.start,
        end: node.end,
        originalSource: source.slice(node.start, node.end),
        value: node.regex.pattern || '',
        kind: 'regex',
      });
      return;
    }
    if (node.type === 'TemplateElement' && node.value?.raw) {
      const range = templateRange(source, node);
      if (!range) return;
      items.push({
        start: range[0],
        end: range[1],
        originalSource: source.slice(range[0], range[1]),
        value: node.value.raw,
        kind: 'template',
      });
    }
  });

  items.sort((a, b) => a.start - b.start || a.end - b.end);

  const replacements = [];
  for (const item of items) {
    const overlap = replacements.some((r) => item.start < r.end && item.end > r.start);
    if (overlap) continue;
    const category = classify(item.value, item.kind);
    state.counts[category] = (state.counts[category] || 0) + 1;
    const index = ++state.sequence;
    const placeholder = `__GJS_${category}_${String(index).padStart(6, '0')}__`;
    let genericSource;
    if (item.kind === 'regex') genericSource = `/__GJS_RX_${String(index).padStart(6, '0')}__/`;
    else if (item.kind === 'template') genericSource = placeholder;
    else genericSource = JSON.stringify(placeholder);
    replacements.push({ ...item, category, placeholder, genericSource, file });
    occupied.add(`${item.start}:${item.end}`);
  }

  // Remove every original comment. New generic markers are added after rewriting.
  for (const comment of comments) {
    const start = comment.start;
    const end = comment.end;
    const overlaps = replacements.some((r) => start < r.end && end > r.start);
    if (overlaps) continue;
    const original = source.slice(start, end);
    const blank = original.replace(/[^\r\n]/g, ' ');
    replacements.push({ start, end, originalSource: original, genericSource: blank, kind: 'comment', file });
  }

  replacements.sort((a, b) => b.start - a.start || b.end - a.end);
  return replacements;
}

function applyPlan(source, plan) {
  let out = source;
  for (const item of plan) {
    out = out.slice(0, item.start) + item.genericSource + out.slice(item.end);
  }
  return out;
}

function genericHeader(file) {
  if (file.endsWith('/noname.js')) {
    return `// ==UserScript==\n// @name         generic-configurable-script\n// @namespace    generic\n// @version      0.0.0-generic\n// @description  generic configurable script template\n// @run-at       document-start\n// @match        https://example.invalid/*\n// @grant        none\n// ==/UserScript==\n/* ${MARKER} */\n`;
  }
  return `/* ${MARKER} */\n`;
}

function buildAll(readSource) {
  const state = { sequence: 0, counts: {} };
  const results = [];
  for (const file of TARGETS) {
    const source = readSource(file);
    if (source.includes(MARKER)) throw new Error(`${file} is already genericized`);
    const plan = makePlan(source, file, state);
    let generic = applyPlan(source, plan);
    generic = genericHeader(file) + generic.replace(/^\s+/, '');
    results.push({ file, source, plan, generic });
  }
  return { results, state };
}

function countByFile(result) {
  const counts = {};
  for (const item of result.plan) {
    if (!item.placeholder) continue;
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return counts;
}

function renderDoc(bundle) {
  const lines = [
    '# Generic JS anonymization registry',
    '',
    `Marker: \`${MARKER}\``,
    '',
    '## Scope',
    '',
    'This branch contains generic JS templates. Original business-specific literal values and original comments are intentionally not copied into this document.',
    '',
    'Processed files:',
    ...bundle.results.map((r) => `- \`${r.file}\``),
    '',
    '## Transformation rules',
    '',
    '- Original comments are removed and replaced only by neutral generic markers/metadata.',
    '- Every non-empty JavaScript string literal is replaced by a numbered neutral placeholder, except the standard `use strict` directive.',
    '- Regular-expression literals are replaced by neutral numbered regular expressions.',
    '- Static text inside template literals is replaced by neutral numbered placeholders.',
    '- Placeholder numbering is deterministic for the same source revision and file order.',
    '- No original literal value is stored in this branch by the genericizer.',
    '- The anonymous files are configuration templates; restore required placeholders before runtime validation or release packaging.',
    '',
    '## Placeholder classes',
    '',
    '| Prefix | Neutral category |',
    '| --- | --- |',
    '| `__GJS_URL_` | URL-shaped literal |',
    '| `__GJS_HOST_` | host-shaped literal |',
    '| `__GJS_PATH_` | path-shaped literal |',
    '| `__GJS_SEL_` | selector-shaped literal |',
    '| `__GJS_TEXT_` | display/text-shaped literal |',
    '| `__GJS_TPL_` | template-literal text |',
    '| `__GJS_RX_` | regular expression |',
    '| `__GJS_STR_` | other string literal |',
    '',
    '## Change registry',
    '',
    '| File | Placeholder counts |',
    '| --- | --- |',
    ...bundle.results.map((r) => {
      const counts = countByFile(r);
      const summary = Object.keys(counts).sort().map((k) => `${k}:${counts[k]}`).join(', ') || 'none';
      return `| \`${r.file}\` | ${summary} |`;
    }),
    '',
    `Total placeholders: **${bundle.state.sequence}**`,
    '',
    '## Restore original values only when needed',
    '',
    'The helper can reconstruct a private placeholder map from another Git ref without committing original values to this branch:',
    '',
    '```bash',
    `node tools/genericize-js.mjs private-map main ${PRIVATE_MAP_DEFAULT}`,
    '```',
    '',
    `The generated \`${PRIVATE_MAP_DEFAULT}\` contains original values. Keep it local and never commit it.`,
    '',
    'Restore selected placeholders into one anonymous file:',
    '',
    '```bash',
    `node tools/genericize-js.mjs restore ${PRIVATE_MAP_DEFAULT} remote-script/src/noname.js __GJS_TEXT_000001__`,
    '```',
    '',
    'Pass more placeholder IDs at the end of the command to restore several values at once. Re-run `verify` afterward.',
    '',
    '## Verification',
    '',
    '```bash',
    'node tools/genericize-js.mjs verify',
    '```',
    '',
    'Verification checks that both targets carry the anonymization marker, still parse as JavaScript, contain no original comments, and expose no non-placeholder string/template/regular-expression literal other than the standard directive and the generic metadata header.',
    '',
    'Release hashes/signatures are not regenerated by this anonymization task. Regenerate release metadata only after the required placeholders have been restored and runtime validation has passed.',
    '',
  ];
  return lines.join('\n');
}

function cmdApply() {
  const bundle = buildAll((file) => fs.readFileSync(file, 'utf8'));
  for (const result of bundle.results) {
    fs.writeFileSync(result.file, result.generic, 'utf8');
  }
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  fs.writeFileSync(DOC_PATH, renderDoc(bundle), 'utf8');
  console.log(`genericized ${bundle.results.length} files; placeholders=${bundle.state.sequence}`);
}

function sourceFromRef(ref, file) {
  return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function cmdPrivateMap(ref = 'main', out = PRIVATE_MAP_DEFAULT) {
  const bundle = buildAll((file) => sourceFromRef(ref, file));
  const entries = {};
  for (const result of bundle.results) {
    for (const item of result.plan) {
      if (!item.placeholder) continue;
      entries[item.placeholder] = {
        file: item.file,
        category: item.category,
        genericSource: item.genericSource,
        originalSource: item.originalSource,
      };
    }
  }
  fs.writeFileSync(out, JSON.stringify({ marker: MARKER, ref, entries }, null, 2) + '\n', 'utf8');
  console.log(`private map written to ${out}; do not commit it`);
}

function cmdRestore(mapFile, file, placeholders) {
  if (!mapFile || !file || !placeholders.length) {
    throw new Error('restore requires: <map-file> <file> <placeholder...>');
  }
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  let source = fs.readFileSync(file, 'utf8');
  for (const key of placeholders) {
    const entry = map.entries?.[key];
    if (!entry) throw new Error(`placeholder not found in map: ${key}`);
    if (entry.file !== file) throw new Error(`${key} belongs to ${entry.file}, not ${file}`);
    if (!source.includes(entry.genericSource)) throw new Error(`${key} is not present in ${file}`);
    source = source.replace(entry.genericSource, entry.originalSource);
  }
  fs.writeFileSync(file, source, 'utf8');
  console.log(`restored ${placeholders.length} placeholder(s) in ${file}`);
}

function collectLeaks(source, file) {
  const comments = [];
  const ast = parse(source, comments);
  const leaks = [];
  walk(ast, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (node.value === '' || node.value === 'use strict') return;
      if (/^__GJS_[A-Z]+_\d{6}__$/.test(node.value)) return;
      leaks.push(`string@${node.start}`);
    } else if (node.type === 'Literal' && node.regex) {
      if (/^__GJS_RX_\d{6}__$/.test(node.regex.pattern || '')) return;
      leaks.push(`regex@${node.start}`);
    } else if (node.type === 'TemplateElement' && node.value?.raw) {
      if (/^__GJS_[A-Z]+_\d{6}__$/.test(node.value.raw)) return;
      leaks.push(`template@${node.start}`);
    }
  });

  // The generic userscript header is intentionally retained; no other comments are allowed.
  const allowedComment = (value) => {
    const text = String(value || '').trim();
    return text.includes(MARKER) ||
      text === '==UserScript==' ||
      text === '==/UserScript==' ||
      /^@(name|namespace|version|description|run-at|match|grant)\b/.test(text);
  };
  for (const comment of comments) {
    if (!allowedComment(comment.value)) leaks.push(`comment@${comment.start}`);
  }

  if (!source.includes(MARKER)) leaks.push('missing-marker');
  if (file.endsWith('/noname.js') && !source.includes('https://example.invalid/*')) leaks.push('missing-generic-match');
  return leaks;
}

function cmdVerify() {
  let failed = false;
  for (const file of TARGETS) {
    const source = fs.readFileSync(file, 'utf8');
    const leaks = collectLeaks(source, file);
    if (leaks.length) {
      failed = true;
      console.error(`${file}: verification failed: ${leaks.slice(0, 20).join(', ')}`);
    } else {
      console.log(`${file}: verified`);
    }
  }
  if (failed) process.exit(2);
}

const [command = 'verify', ...args] = process.argv.slice(2);
try {
  if (command === 'apply') cmdApply();
  else if (command === 'verify') cmdVerify();
  else if (command === 'private-map') cmdPrivateMap(args[0] || 'main', args[1] || PRIVATE_MAP_DEFAULT);
  else if (command === 'restore') cmdRestore(args[0], args[1], args.slice(2));
  else throw new Error(`unknown command: ${command}`);
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
