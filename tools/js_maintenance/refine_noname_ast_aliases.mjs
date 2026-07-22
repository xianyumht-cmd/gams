#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const sourcePath = process.argv[2] || 'remote-script/src/noname.js';
const graphPath = process.argv[3] || 'docs/js-maintenance/noname-ast/noname-function-graph.json';
const outputDir = process.argv[4] || 'docs/js-maintenance/noname-ast';
const source = await fs.readFile(sourcePath, 'utf8');
const oldGraph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
const ast = acorn.parse(source, {
  ecmaVersion: 'latest',
  sourceType: 'script',
  locations: true,
  ranges: true,
  allowHashBang: true,
});

const METHOD_TERMS = [
  'init', 'hook', 'patch', 'sync', 'runtime', 'user', 'flower', 'mall', 'goods', 'order',
  'storage', 'xhr', 'jsonp', 'script', 'engine', 'panel', 'button', 'fullscreen', 'style',
  'viewport', 'render', 'create', 'load', 'save', 'wait', 'feature', 'state',
];
const IMPORTANT_METHODS = new Set([
  'getRuntimeHookScript', 'syncRuntimeState', 'patchMallViewData', 'initStorageHook',
  'buildCreateOrderResponse', 'patchGameFlowUrl', 'initXhrHook', 'initJsonpHook',
  'getFlowerCount', 'getUserId', 'createUserDataSnapshot', 'applyUserDataAccessors',
  'hookCurrentUserData', 'createPanel', 'createButton', 'setupFloatingWindow',
  'toggleFullscreen', 'rewriteScriptNode', 'isLegacyEngineUrl', 'start', 'init',
]);

function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(item => item.value.cooked ?? item.value.raw).join('');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  if (node.type === 'ParenthesizedExpression') return staticString(node.expression);
  return null;
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  const value = staticString(node);
  return value ?? '';
}

function expressionName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Super') return 'super';
  if (node.type === 'ChainExpression') return expressionName(node.expression);
  if (node.type === 'MemberExpression') {
    const owner = expressionName(node.object);
    const key = node.computed ? propertyName(node.property) : expressionName(node.property);
    return [owner, key].filter(Boolean).join('.');
  }
  return '';
}

function objectOwner(objectNode, ancestors) {
  const index = ancestors.lastIndexOf(objectNode);
  if (index < 0) return '';
  const parent = ancestors[index - 1];
  if (!parent) return '';
  if (parent.type === 'VariableDeclarator' && parent.init === objectNode) return expressionName(parent.id);
  if (parent.type === 'AssignmentExpression' && parent.right === objectNode) return expressionName(parent.left);
  if (parent.type === 'Property' && parent.value === objectNode) {
    const key = propertyName(parent.key);
    const outerObject = ancestors[index - 2];
    const outerOwner = outerObject?.type === 'ObjectExpression' ? objectOwner(outerObject, ancestors) : '';
    return [outerOwner, key].filter(Boolean).join('.');
  }
  return '';
}

function resolvedFunctionName(node, ancestors, fallbackIndex) {
  if (node.type === 'FunctionDeclaration' && node.id?.name) return node.id.name;
  if (node.id?.name) return node.id.name;
  const parent = ancestors.at(-2);
  if (parent?.type === 'VariableDeclarator') return expressionName(parent.id) || `anonymous@${fallbackIndex}`;
  if (parent?.type === 'AssignmentExpression') return expressionName(parent.left) || `anonymous@${fallbackIndex}`;
  if (parent?.type === 'Property' && parent.value === node) {
    const key = propertyName(parent.key);
    const objectNode = ancestors.at(-3);
    const owner = objectNode?.type === 'ObjectExpression' ? objectOwner(objectNode, ancestors) : '';
    return [owner, key].filter(Boolean).join('.') || key || `anonymous@${fallbackIndex}`;
  }
  if (parent?.type === 'MethodDefinition') return propertyName(parent.key) || `anonymous@${fallbackIndex}`;
  if (parent?.type === 'CallExpression') return `callback:${expressionName(parent.callee) || 'call'}@${fallbackIndex}`;
  return `anonymous@${fallbackIndex}`;
}

const oldByOffset = new Map(oldGraph.functions.map(item => [item.startOffset, item]));
const functions = [];
walk.fullAncestor(ast, (node, ancestors) => {
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return;
  const index = functions.length;
  const resolvedName = resolvedFunctionName(node, ancestors, index);
  const calls = new Set();
  walk.full(node.body ?? node, child => {
    if (child !== node && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(child.type)) return;
    if (child.type === 'CallExpression' || child.type === 'NewExpression') {
      const name = expressionName(child.callee);
      if (name) calls.add(name);
    }
  });
  const old = oldByOffset.get(node.start) || {};
  functions.push({
    startOffset: node.start,
    endOffset: node.end,
    startLine: node.loc.start.line,
    endLine: node.loc.end.line,
    oldName: old.name || '',
    resolvedName,
    owner: resolvedName.includes('.') ? resolvedName.split('.').slice(0, -1).join('.') : '',
    method: resolvedName.split('.').at(-1),
    calls: [...calls].sort(),
    categoryScores: old.categoryScores || {},
    dominantCategories: old.dominantCategories || [],
    sideEffectTags: old.sideEffectTags || [],
    stableStrings: old.stableStrings || [],
    assignedMembers: old.assignedMembers || [],
    storageKeys: old.storageKeys || [],
  });
});

const names = new Set(functions.map(item => item.resolvedName));
const simpleMethodIndex = new Map();
for (const item of functions) {
  const list = simpleMethodIndex.get(item.method) || [];
  list.push(item.resolvedName);
  simpleMethodIndex.set(item.method, list);
}

function resolveCall(call) {
  if (names.has(call)) return call;
  const method = call.split('.').at(-1);
  const matches = simpleMethodIndex.get(method) || [];
  if (matches.length === 1) return matches[0];
  return '';
}

const edges = new Map();
for (const item of functions) {
  for (const call of item.calls) {
    const target = resolveCall(call);
    if (!target) continue;
    const key = `${item.resolvedName}\u0000${target}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
}
const callGraph = [...edges.entries()].map(([key, count]) => {
  const [from, to] = key.split('\u0000');
  return { from, to, count };
}).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

const owners = {};
for (const item of functions) {
  if (!item.owner) continue;
  if (!owners[item.owner]) owners[item.owner] = [];
  owners[item.owner].push({
    method: item.method,
    resolvedName: item.resolvedName,
    startLine: item.startLine,
    endLine: item.endLine,
    dominantCategories: item.dominantCategories,
    sideEffectTags: item.sideEffectTags,
  });
}
for (const values of Object.values(owners)) values.sort((a, b) => a.startLine - b.startLine);

const meaningful = functions.filter(item =>
  IMPORTANT_METHODS.has(item.method) ||
  METHOD_TERMS.some(term => item.method.toLowerCase().includes(term)) ||
  item.sideEffectTags.length >= 2 ||
  item.stableStrings.length > 0
).sort((a, b) => a.startLine - b.startLine);

const important = meaningful.filter(item => IMPORTANT_METHODS.has(item.method));
const aliasesResolved = functions.filter(item =>
  item.oldName && item.oldName !== item.resolvedName &&
  (item.oldName.startsWith('anonymous@') || item.oldName.startsWith('callback:') || item.resolvedName.includes('.'))
);

const report = {
  schemaVersion: 1,
  source: oldGraph.source,
  summary: {
    functionCount: functions.length,
    resolvedObjectMethodCount: functions.filter(item => item.owner).length,
    aliasImprovementCount: aliasesResolved.length,
    resolvedCallGraphEdgeCount: callGraph.length,
    ownerCount: Object.keys(owners).length,
    meaningfulFunctionCount: meaningful.length,
  },
  importantMethods: important,
  owners,
  callGraph,
  functions,
};

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.map(value => String(value).replaceAll('|', '\\|')).join(' | ')} |`),
  ].join('\n');
}

const ownerRows = Object.entries(owners)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 30)
  .map(([owner, methods]) => [`\`${owner}\``, methods.length, methods.slice(0, 12).map(item => `\`${item.method}\``).join(', ')]);
const importantRows = important.map(item => [
  `\`${item.resolvedName}\``,
  `${item.startLine}-${item.endLine}`,
  item.dominantCategories.map(value => value.category).join(', ') || '-',
  item.sideEffectTags.join(', ') || '-',
]);
const meaningfulRows = meaningful.slice(0, 100).map(item => [
  `\`${item.resolvedName}\``,
  `${item.startLine}-${item.endLine}`,
  item.dominantCategories.map(value => value.category).join(', ') || '-',
]);

const markdown = `# noname.js 计算属性与对象方法解析

本报告对 AST 第一版中的计算属性名进行静态字符串求值，将可解析的匿名方法还原为 \`对象.方法\`。

## 摘要

- 函数节点：\`${report.summary.functionCount}\`
- 已解析对象方法：\`${report.summary.resolvedObjectMethodCount}\`
- 名称映射改进：\`${report.summary.aliasImprovementCount}\`
- 解析后调用边：\`${report.summary.resolvedCallGraphEdgeCount}\`
- 对象拥有者：\`${report.summary.ownerCount}\`
- 有维护意义的函数：\`${report.summary.meaningfulFunctionCount}\`

## 主要对象

${table(['对象', '方法数', '部分方法'], ownerRows)}

## 重点方法

${importantRows.length ? table(['方法', '行范围', '分类', '副作用'], importantRows) : '没有匹配到预设重点方法。'}

## 维护相关方法索引

${table(['方法', '行范围', '分类'], meaningfulRows)}

## 注意

- 这里只解析纯字符串拼接属性，例如 \`"initSt" + "orageHook"\`。
- 数组索引、RC4 解码或运行时计算属性仍不会被静态还原。
- 对象方法名称比第一版匿名编号更适合维护，但版本升级后仍应以字段、接口和平台 API 为最终锚点。
- 报告用于兼容定位，不代表某项分支在所有页面和作品中都会执行。
`;

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'noname-resolved-methods.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(path.join(outputDir, 'resolved-methods.md'), markdown, 'utf8');
console.log(JSON.stringify({ ...report.summary, outputDir }, null, 2));
