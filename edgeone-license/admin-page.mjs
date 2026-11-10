/** Self-contained admin UI: no external CDN, framework, or browser-side secrets. */
export function adminHtml(nonce) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GG · 授权管理</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Microsoft YaHei UI","Microsoft YaHei",sans-serif;background:#0a1021;color:#e9f5ff}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 80% -25%,#13476a 0,transparent 50%),#0a1021}
.shell{width:min(1070px,calc(100% - 32px));margin:34px auto 80px}.top{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:25px}
.brand{display:flex;align-items:center;gap:13px}.logo{display:grid;place-items:center;width:47px;height:47px;border-radius:16px;background:linear-gradient(140deg,#00c5e4,#2573ff);font-size:24px;font-weight:900;color:#071326}
h1,h2,p{margin:0}h1{font-size:22px;letter-spacing:.3px}h2{font-size:17px;margin:0 0 16px}.sub{font-size:12px;color:#879ab5;margin-top:4px}
.badge{font-size:12px;background:#12394c;border:1px solid #1d6981;color:#76e6f4;padding:7px 10px;border-radius:18px}
.panel{background:rgba(18,30,51,.94);border:1px solid #263a55;border-radius:19px;padding:24px;box-shadow:0 18px 45px #02071032;margin-bottom:17px}
.login{max-width:470px;margin:60px auto 0}.hint{color:#9eb0c9;font-size:13px;line-height:1.8;margin-bottom:18px}
.form{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.field{display:flex;flex-direction:column;gap:9px;flex:1;min-width:175px}
label{font-size:13px;color:#a4b9d3}input,select{width:100%;height:43px;background:#0c1729;border:1px solid #344b69;border-radius:11px;padding:0 13px;color:#f2f9ff;outline:none;font:inherit;font-size:14px}
input:focus,select:focus{border-color:#27c4e6;box-shadow:0 0 0 3px #27c4e626}button{border:0;border-radius:11px;padding:11px 16px;font:inherit;font-size:13px;cursor:pointer;min-height:41px;color:#e5f4ff;background:#293d5d;transition:background .15s}
button:hover{background:#36557d}button:disabled{opacity:.48;cursor:wait}.primary{background:#06aed4;color:#031522;font-weight:700}.primary:hover{background:#52d9ee}.danger{color:#ffb7bd;background:#50303c}.danger:hover{background:#753944}
.muted{color:#92a7c2}.tools{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.grid{display:grid;grid-template-columns:1fr 1fr;gap:17px}
.notice{font-size:13px;border-radius:12px;margin-top:15px;line-height:1.6;padding:12px 14px;background:#0b293c;border:1px solid #225574;color:#a6e9f5}
.small{font-size:12px}.dashboard-caption{font-size:13px}.key-caption{margin-bottom:8px}.list-top{margin-bottom:16px}.list-heading{margin:0}.more-hint{margin-top:13px}
.notice.error{background:#40202b;border-color:#7e3744;color:#ffc1c6}.card-list{display:flex;flex-direction:column;gap:10px}
.card{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#101e34;border:1px solid #2a415d;border-radius:12px;padding:14px}
.card-info{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.hash{font-size:13px;color:#d4e9fc;font-family:ui-monospace,Consolas,monospace}
.chip{font-size:11px;padding:5px 8px;border-radius:8px;background:#253953;color:#c3d8ef}.chip.green{background:#123e3b;color:#77edd7}.chip.red{background:#4b2c36;color:#ffb6ba}
.card-meta{margin-top:7px;font-size:12px;color:#839ab5}.card-actions{display:flex;gap:7px;flex-wrap:wrap}
.key-box{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.key{font:600 15px ui-monospace,Consolas,monospace;letter-spacing:.5px;color:#84eddb;overflow-wrap:anywhere}
.empty{text-align:center;color:#8ca2bf;padding:24px 0;font-size:13px}.footer{font-size:12px;color:#748aa6;margin-top:25px;line-height:1.8}
@media(max-width:690px){.shell{margin-top:20px}.grid{grid-template-columns:1fr}.panel{padding:18px}.top{align-items:flex-start}.badge{font-size:11px}.card-actions{width:100%}.card-actions button{flex:1}h1{font-size:19px}}
</style></head><body>
<main class="shell">
<header class="top"><div class="brand"><div class="logo">G</div><div><h1>GG · 授权管理</h1><p class="sub">EdgeOne 私有授权中心 · 内部测试</p></div></div><span class="badge">仅限管理员</span></header>
<section id="login" class="panel login" hidden><h2>管理员登录</h2><p class="hint">使用 EdgeOne 项目环境变量 GG_ADMIN_PASSWORD 设置的密码登录。<br>无需 API Token，也无需 PowerShell。</p>
<form id="login-form" class="form"><div class="field"><label for="password">管理密码</label><input id="password" type="password" autocomplete="current-password" required autofocus></div><button class="primary" type="submit">进入后台</button></form></section>
<section id="dashboard" hidden><div class="top"><p class="muted dashboard-caption">管理卡密、设备绑定和有效期</p><div class="tools"><button id="reload">刷新列表</button><button id="logout">退出登录</button></div></div>
<div class="grid"><section class="panel"><h2>生成新卡密</h2><p class="hint">有效期从首次成功激活时开始计算。生成后请立即复制并妥善保存，后台不保存明文。</p>
<div class="form"><div class="field"><label for="days">使用期限</label><select id="days"><option value="7">7 天</option><option value="30" selected>30 天</option><option value="90">90 天</option><option value="365">365 天</option><option value="0">永久</option></select></div><button id="issue" class="primary">生成卡密</button></div>
<div id="new-key" class="notice" hidden><p class="key-caption">新卡密（只显示本次）：</p><div class="key-box"><span id="key-text" class="key"></span><button id="copy">复制卡密</button></div></div></section>
<section class="panel"><h2>管理说明</h2><p class="hint">解绑设备：允许将同一张卡密换到另一台设备，已开始的有效期不会重置。<br>停用卡密：立即阻止授权验证和脚本下载。<br>恢复卡密：取消停用，但不会延长到期时间。</p>
<span class="chip green">数据存储：EdgeOne 私有 Blob</span></section></div>
<section class="panel"><div class="top list-top"><h2 class="list-heading">卡密列表</h2><span class="muted small" id="count"></span></div>
<div id="cards" class="card-list"><p class="empty">正在加载…</p></div><p id="more" class="hint more-hint" hidden>列表仅展示前 100 条，请清理旧数据或通过本地工具管理其余记录。</p></section></section>
<p id="message" class="notice" role="status" hidden></p><p class="footer">GG EdgeOne 内部候选版 · 管理会话有效期 8 小时 · 所有写入操作需管理员验证</p>
</main>
<script nonce="${nonce}">
'use strict';
const byId = id => document.getElementById(id);
let csrf = '';
const message = (value, bad = false) => { const el = byId('message'); el.hidden = !value; el.textContent = value; el.classList.toggle('error', bad); };
const showLogin = () => { csrf = ''; byId('key-text').textContent = ''; byId('new-key').hidden = true; byId('login').hidden = false; byId('dashboard').hidden = true; };
const showDashboard = () => { byId('login').hidden = true; byId('dashboard').hidden = false; };
async function request(action, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-GG-Admin-CSRF'] = csrf;
  const response = await fetch('/api/admin/' + action, { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(data || {}) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && action !== 'login') showLogin();
    throw new Error(result.message || '请求失败');
  }
  return result;
}
function formatDate(value) { return value > 0 ? new Date(value * 1000).toLocaleString('zh-CN') : '首次激活后起算'; }
function addChip(parent, text, color) { const el = document.createElement('span'); el.className = 'chip ' + (color || ''); el.textContent = text; parent.append(el); }
function addButton(parent, title, action, id, danger = false) {
  const btn = document.createElement('button'); btn.textContent = title; btn.className = danger ? 'danger' : '';
  btn.onclick = async () => {
    const warnings = { unbind: '确定解绑此卡的设备？原设备将失去授权，新设备可重新激活。', revoke: '确定停用此卡密？已激活设备也将无法再次验证。', restore: '确定恢复这张卡密？' };
    if (!confirm(warnings[action])) return;
    btn.disabled = true;
    try { await request(action, { id }); message('操作已完成：' + title); await loadCards(); }
    catch (e) { message(e.message, true); } finally { btn.disabled = false; }
  };
  parent.append(btn);
}
async function loadCards() {
  const target = byId('cards'); target.replaceChildren();
  const result = await request('list');
  byId('count').textContent = result.cards.length + ' 张';
  byId('more').hidden = !result.hasMore;
  if (!result.cards.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '还没有卡密，先生成一张吧'; target.append(empty); return; }
  for (const card of result.cards) {
    const row = document.createElement('article'); row.className = 'card';
    const left = document.createElement('div');
    const line = document.createElement('div'); line.className = 'card-info';
    const id = document.createElement('span'); id.className = 'hash'; id.textContent = card.shortId; id.title = '卡密加密索引（不是原始激活码）'; line.append(id);
    addChip(line, card.disabled ? '已停用' : '正常', card.disabled ? 'red' : 'green');
    addChip(line, card.bound ? '已绑定' : '未绑定', card.bound ? '' : 'green');
    addChip(line, card.permanent ? '永久' : card.durationDays + ' 天'); left.append(line);
    const meta = document.createElement('p'); meta.className = 'card-meta';
    meta.textContent = (card.permanent ? '永久有效' : '到期：' + formatDate(card.expiresAt)) + (card.createdAt ? ' · 创建：' + formatDate(card.createdAt) : ' · 旧版记录');
    left.append(meta); row.append(left);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    if (card.bound) addButton(actions, '解绑设备', 'unbind', card.id);
    addButton(actions, card.disabled ? '恢复' : '停用', card.disabled ? 'restore' : 'revoke', card.id, !card.disabled);
    row.append(actions); target.append(row);
  }
}
async function initialize() {
  try { const response = await fetch('/api/admin/session', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) { showLogin(); return; }
    const result = await response.json(); csrf = result.csrf; showDashboard(); await loadCards();
  } catch(e) { showLogin(); message(e.message, true); }
}
byId('login-form').onsubmit = async e => { e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { const result = await request('login', { password: byId('password').value }); byId('password').value = ''; csrf = result.csrf; showDashboard(); message('登录成功'); await loadCards(); }
  catch(e) { message(e.message, true); } finally { button.disabled = false; }
};
byId('issue').onclick = async () => { const button = byId('issue'); button.disabled = true;
  try { const result = await request('issue', { days: Number(byId('days').value) }); byId('key-text').textContent = result.key;
    byId('new-key').hidden = false; message('新卡密创建成功，请复制保存'); await loadCards(); }
  catch(e) { message(e.message, true); } finally { button.disabled = false; }
};
byId('copy').onclick = async () => { try { await navigator.clipboard.writeText(byId('key-text').textContent); message('卡密已复制到剪贴板'); }
  catch(e) { message('复制失败，请手动选中卡密复制：' + e.message, true); }
};
byId('reload').onclick = async () => { try { await loadCards(); message('列表已刷新'); } catch(e) { message(e.message, true); } };
byId('logout').onclick = async () => { try { await request('logout'); showLogin(); byId('new-key').hidden = true; byId('key-text').textContent = ''; message('已退出登录'); }
  catch(e) { message(e.message, true); } };
initialize();
</script></body></html>`;
}
