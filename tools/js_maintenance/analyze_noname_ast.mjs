#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const sourcePath = process.argv[2] || 'remote-script/src/noname.js';
const outputDir = process.argv[3] || 'docs/js-maintenance/noname-ast';
const source = await fs.readFile(sourcePath, 'utf8');
const ast = acorn.parse(source, {
  ecmaVersion: 'latest',
  sourceType: 'script',
  locations: true,
  ranges: true,
  allowHashBang: true,
});

const KNOWN_FUNCTIONS = {
  STy4gr: 'PC/H5入口适配',
  MInyap: '运行环境初始化',
  DjkL_Q: 'game.js识别与替换',
  zjEv2f: '页面数据和请求适配',
  PwDi7Ry: '用户状态适配',
  pXBC4W: 'G菜单与交互界面',
  applyUserDataAccessors: '用户数据访问器',
  createUserDataSnapshot: '用户数据快照',
  hookCurrentUserData: '当前用户对象挂接',
  patchMallViewData: '商城视图数据适配',
  buildCreateOrderResponse: '订单响应结构构造',
  initStorageHook: '存储适配初始化',
  getFlowerCount: '鲜花数值读取',
  getUserId: '用户标识读取',
};

const CATEGORY_MARKERS = {
  ui: ['document', 'createElement', 'querySelector', 'appendChild', 'insertBefore', 'style', 'fullscreen', 'MutationObserver', 'floating', 'panel'],
  engineLoading: ['game.js', 'script', 'src', 'HTMLScriptElement', 'rewriteScriptNode', 'engine/stable.js', 'space-z.ai'],
  userState: ['userData', 'uid', 'guid', 'isLogin', 'totalFlower', 'freshFlower', 'wildFlower', 'tempFlower', 'realFlower', 'haveFlower'],
  mallOrder: ['mallViewData', 'itemPrice', 'goods', 'goods_id', 'order_id', 'buy_num', 'createBuyOrder', 'get_goods_list'],
  storage: ['localStorage', 'sessionStorage', 'getItem', 'setItem', 'removeItem', 'showLocal', 'save'],
  network: ['XMLHttpRequest', 'fetch', 'JSONP', 'open', 'send', 'responseText', 'response'],
  lifecycle: ['DOMContentLoaded', 'load', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'visibilitychange'],
  compatibility: ['Object.defineProperty', 'defineProperty', 'getOwnPropertyDescriptor', 'prototype', 'navigator', 'location', 'origin'],
};

const STABLE_STRING_TERMS = [
  'game.js', 'engine/stable.js', 'space-z.ai', 'PropShop', 'get_goods_list', 'createBuyOrder',
  'mallViewData', 'itemPrice', 'userData', 'totalFlower', 'freshFlower', 'wildFlower',
  'tempFlower', 'realFlower', 'haveFlower', 'showLocal', 'localStorage', 'sessionStorage',
  '/website/hfplayer/', '66rpg.com', 'orange_feature_switch',
];

const PLATFORM_CALL_PREFIXES = [
  'document.', 'window.', 'location.', 'history.', 'localStorage.', 'sessionStorage.',
  'Object.', 'Reflect.', 'JSON.', 'XMLHttpRequest.', 'Element.', 'Node.',
  'HTMLScriptElement.', 'MutationObserver', 'requestAnimationFrame', 'setTimeout', 'setInterval',
];

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function propertyName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value ?? '');
  return '';
}

function expressionName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Super') return 'super';
  if (node.type === 'Literal') return String(node.value ?? '');
  if (node.type === 'MemberExpression') {
    const object = expressionName(node.object);
    const property = node.computed ? propertyName(node.property) : expressionName(node.property);
    return [object, property].filter(Boolean).join('.');
  }
  if (node.type === 'ChainExpression') return expressionName(node.expression);
  return '';
}

function functionName(node, ancestors, index) {
  if (node.type === 'FunctionDeclaration' && node.id?.name) return node.id.name;
  if ((node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && node.id?.name) return node.id.name;
  const parent = ancestors.at(-2);
  if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') return parent.id.name;
  if (parent?.type === 'AssignmentExpression') return expressionName(parent.left) || `anonymous@${index}`;
  if (parent?.type === 'Property' || parent?.type === 'MethodDefinition') return propertyName(parent.key) || `anonymous@${index}`;
  if (parent?.type === 'CallExpression') return `callback:${expressionName(parent.callee) || 'call'}@${index}`;
  return `anonymous@${index}`;
}

function extractStableStrings(text) {
  const result = new Set();
  const pattern = /(['"])((?:\\.|(?!\1).){1,240})\1/g;
  for (const match of text.matchAll(pattern)) {
    const value = match[2];
    if (STABLE_STRING_TERMS.some(term => value.includes(term)) || /^https?:\/\//i.test(value) || /^\/[A-Za-z]/.test(value)) {
      result.add(value.slice(0, 240));
    }
  }
  return [...result].sort();
}

function storageKeysFromNode(node) {
  const keys = [];
  if (node.type !== 'CallExpression') return keys;
  const name = expressionName(node.callee);
  if (!/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)$/.test(name)) return keys;
  const first = node.arguments?.[0];
  if (first?.type === 'Literal' && typeof first.value === 'string') keys.push(first.value);
  return keys;
}

function categoryScores(text, calls, strings) {
  const joined = `${text}\n${calls.join('\n')}\n${strings.join('\n')}`;
  const scores = {};
  for (const [category, markers] of Object.entries(CATEGORY_MARKERS)) {
    scores[category] = markers.reduce((sum, marker) => sum + (joined.split(marker).length - 1), 0);
  }
  return scores;
}

function sideEffectTags(text, calls) {
  const tags = new Set();
  const joined = `${text}\n${calls.join('\n')}`;
  const checks = {
    modifiesDom: ['createElement', 'appendChild', 'insertBefore', 'removeChild', 'innerHTML', 'textContent', 'style.'],
    modifiesPrototype: ['prototype', 'Object.defineProperty', 'getOwnPropertyDescriptor'],
    readsOrWritesStorage: ['localStorage', 'sessionStorage', 'getItem', 'setItem', 'removeItem'],
    interceptsNetwork: ['XMLHttpRequest', 'responseText', 'JSONP', 'fetch'],
    redirectsScript: ['HTMLScriptElement', 'script.src', 'rewriteScriptNode', 'engine/stable.js', 'game.js'],
    schedulesWork: ['requestAnimationFrame', 'setTimeout', 'setInterval'],
    touchesNavigation: ['location.', 'history.', 'replace(', 'assign('],
  };
  for (const [tag, markers] of Object.entries(checks)) {
    if (markers.some(marker => joined.includes(marker))) tags.add(tag);
  }
  return [...tags].sort();
}

const functionNodes = [];
walk.fullAncestor(ast, (node, ancestors) => {
  if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
    functionNodes.push({ node, ancestors: [...ancestors] });
  }
});

const preliminary = functionNodes.map(({ node, ancestors }, index) => ({
  node,
  ancestors,
  index,
  name: functionName(node, ancestors, index),
}));
const knownNames = new Set(preliminary.map(item => item.name));
const functions = [];
const edges = new Map();

for (const item of preliminary) {
  const { node, name, index } = item;
  const text = source.slice(node.start, node.end);
  const calls = [];
  const storageKeys = new Set();
  const assignedMembers = new Set();
  const referencedIdentifiers = new Set();

  walk.full(node.body ?? node, child => {
    if (child !== node && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(child.type)) return;
    if (child.type === 'CallExpression' || child.type === 'NewExpression') {
      const call = expressionName(child.callee);
      if (call) calls.push(call);
      for (const key of storageKeysFromNode(child)) storageKeys.add(key);
    }
    if (child.type === 'AssignmentExpression' || child.type === 'UpdateExpression') {
      const target = expressionName(child.left ?? child.argument);
      if (target) assignedMembers.add(target);
    }
    if (child.type === 'Identifier') referencedIdentifiers.add(child.name);
  });

  const uniqueCalls = [...new Set(calls)].sort();
  const internalCalls = uniqueCalls.filter(call => knownNames.has(call));
  const platformCalls = uniqueCalls.filter(call => PLATFORM_CALL_PREFIXES.some(prefix => call.startsWith(prefix))).sort();
  const strings = extractStableStrings(text);
  const categories = categoryScores(text, uniqueCalls, strings);
  const dominantCategories = Object.entries(categories)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, score]) => ({ category, score }));

  for (const target of internalCalls) {
    const key = `${name}\u0000${target}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  }

  functions.push({
    id: `${name}@${node.start}`,
    name,
    knownDescription: KNOWN_FUNCTIONS[name] || '',
    type: node.type,
    async: Boolean(node.async),
    generator: Boolean(node.generator),
    startOffset: node.start,
    endOffset: node.end,
    length: node.end - node.start,
    startLine: node.loc.start.line,
    endLine: node.loc.end.line,
    parameterCount: node.params?.length || 0,
    sourceSha256: sha256(text),
    calls: uniqueCalls,
    internalCalls,
    platformCalls,
    storageKeys: [...storageKeys].sort(),
    assignedMembers: [...assignedMembers].filter(value => value.length <= 160).sort().slice(0, 120),
    stableStrings: strings.slice(0, 120),
    referencedKnownFunctions: [...referencedIdentifiers].filter(value => knownNames.has(value)).sort(),
    categoryScores: categories,
    dominantCategories,
    sideEffectTags: sideEffectTags(text, uniqueCalls),
  });
}

const topLevelCalls = [];
walk.ancestor(ast, {
  CallExpression(node, ancestors) {
    const insideFunction = ancestors.slice(0, -1).some(ancestor =>
      ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(ancestor.type)
    );
    if (!insideFunction) {
      const callee = expressionName(node.callee);
      if (callee) topLevelCalls.push({ callee, line: node.loc.start.line, offset: node.start });
    }
  },
});

const callGraph = [...edges.entries()].map(([key, count]) => {
  const [from, to] = key.split('\u0000');
  return { from, to, count };
}).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

const categoryIndex = {};
for (const category of Object.keys(CATEGORY_MARKERS)) {
  categoryIndex[category] = functions
    .filter(item => item.categoryScores[category] > 0)
    .sort((a, b) => b.categoryScores[category] - a.categoryScores[category])
    .slice(0, 40)
    .map(item => ({ name: item.name, line: item.startLine, score: item.categoryScores[category], description: item.knownDescription }));
}

const roots = functions
  .filter(item => topLevelCalls.some(call => call.callee === item.name))
  .map(item => ({ name: item.name, line: item.startLine, description: item.knownDescription }));

const report = {
  schemaVersion: 1,
  source: {
    path: sourcePath,
    size: Buffer.byteLength(source),
    sha256: sha256(source),
    lineCount: source.split('\n').length,
  },
  summary: {
    functionCount: functions.length,
    namedFunctionCount: functions.filter(item => !item.name.startsWith('anonymous@') && !item.name.startsWith('callback:')).length,
    callGraphEdgeCount: callGraph.length,
    topLevelCallCount: topLevelCalls.length,
    detectedRootCount: roots.length,
  },
  topLevelCalls: [...new Map(topLevelCalls.map(item => [`${item.callee}:${item.line}`, item])).values()],
  roots,
  knownFunctionIndex: Object.fromEntries(Object.entries(KNOWN_FUNCTIONS).map(([name, description]) => [name, {
    description,
    functions: functions.filter(item => item.name === name).map(item => ({ id: item.id, line: item.startLine, endLine: item.endLine, length: item.length })),
  }])),
  categoryIndex,
  callGraph,
  functions,
};

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.map(value => String(value).replaceAll('|', '\\|')).join(' | ')} |`),
  ].join('\n');
}

const knownRows = Object.entries(report.knownFunctionIndex).map(([name, value]) => [
  `\`${name}\``,
  value.description,
  value.functions.map(item => `${item.line}-${item.endLine}`).join('<br>') || '未定义',
]);
const rootRows = roots.map(item => [`\`${item.name}\``, item.line, item.description || '-']);
const categorySections = Object.entries(categoryIndex).map(([category, values]) => {
  const rows = values.slice(0, 15).map(item => [`\`${item.name}\``, item.line, item.score, item.description || '-']);
  return `### ${category}\n\n${markdownTable(['函数', '起始行', '得分', '说明'], rows)}`;
}).join('\n\n');

const markdown = `# noname.js 函数级行为图

本报告由 AST 静态分析生成，只记录函数边界、调用关系和行为标签，不复制函数全文。

## 基线

- 文件：\`${sourcePath}\`
- 字节：\`${report.source.size}\`
- SHA-256：\`${report.source.sha256}\`
- 行数：\`${report.source.lineCount}\`
- 函数节点：\`${report.summary.functionCount}\`
- 调用图边：\`${report.summary.callGraphEdgeCount}\`
- 顶层调用：\`${report.summary.topLevelCallCount}\`

## 已知核心函数

${markdownTable(['函数', '职责', '行范围'], knownRows)}

## 顶层初始化根

${rootRows.length ? markdownTable(['函数', '行', '说明'], rootRows) : '未发现可直接映射的命名顶层根；请结合 topLevelCalls 和回调入口判断。'}

## 分类索引

${categorySections}

## 使用方法

1. 功能失效时先根据分类索引定位候选函数。
2. 查看 JSON 中该函数的 \`internalCalls\`、\`platformCalls\`、\`stableStrings\` 和 \`assignedMembers\`。
3. 更新后重新生成报告，比较函数边界、调用边和行为标签变化。
4. 混淆函数名可能变化；稳定字符串、平台 API 和数据字段比名称更可靠。
5. AST 图说明代码依赖，不代表某个分支一定在真实页面中执行。
`;

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'noname-function-graph.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(path.join(outputDir, 'README.md'), markdown, 'utf8');
console.log(JSON.stringify({
  functionCount: report.summary.functionCount,
  callGraphEdgeCount: report.summary.callGraphEdgeCount,
  topLevelCallCount: report.summary.topLevelCallCount,
  roots: report.roots,
  outputDir,
}, null, 2));
