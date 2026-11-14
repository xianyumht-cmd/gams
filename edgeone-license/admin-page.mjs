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
.key-box{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}.key{font:600 15px ui-monospace,Consolas,monospace;letter-spacing:.5px;color:#84eddb;overflow-wrap:anywhere}
.key-output{width:100%;min-height:150px;background:#0c1729;border:1px solid #344b69;border-radius:10px;padding:12px;color:#84eddb;font:600 13px/1.6 ui-monospace,Consolas,monospace;resize:vertical}.count-field{flex:0 0 106px;min-width:100px}
.empty{text-align:center;color:#8ca2bf;padding:24px 0;font-size:13px}
.mfa-qr{display:block;background:#fff;border-radius:12px;padding:12px;width:fit-content;max-width:100%;margin:15px 0}
.mfa-qr img{width:min(260px,100%);height:auto;display:block}
.mfa-details{margin:12px 0}.mfa-details summary{cursor:pointer;color:#90ddeb}
.mfa-codes{white-space:pre-wrap;word-break:break-word;line-height:1.9;color:#89eed4;font-family:ui-monospace,Consolas,monospace}
.mfa-form{margin-top:14px}.mfa-hidden{display:none}
.footer{font-size:12px;color:#748aa6;margin-top:25px;line-height:1.8}
@media(max-width:690px){.shell{margin-top:20px}.grid{grid-template-columns:1fr}.panel{padding:18px}.top{align-items:flex-start}.badge{font-size:11px}.card-actions{width:100%}.card-actions button{flex:1}h1{font-size:19px}}
</style></head><body>
<main class="shell">
<header class="top"><div class="brand"><div class="logo">G</div><div><h1>GG · 授权管理</h1><p class="sub">EdgeOne 私有授权中心 · 内部测试</p></div></div><span class="badge">仅限管理员</span></header>
<section id="login" class="panel login" hidden><h2>管理员登录</h2><p class="hint">使用 EdgeOne 项目环境变量 GG_ADMIN_PASSWORD 设置的密码登录。<br>无需 API Token，也无需 PowerShell。</p>
<form id="login-form" class="form"><div class="field"><label for="password">管理密码</label><input id="password" type="password" autocomplete="current-password" required autofocus></div><div class="field"><label for="totp">动态验证码（未启用可留空）</label><input id="totp" type="text" autocomplete="one-time-code" maxlength="23" placeholder="6 位验证码或 20 位恢复码"></div><button class="primary" type="submit">进入后台</button></form></section>
<section id="dashboard" hidden><div class="top"><p class="muted dashboard-caption">管理卡密、设备绑定和有效期</p><div class="tools"><button id="reload">刷新列表</button><button id="logout">退出登录</button></div></div>
<div class="grid"><section class="panel"><h2>生成新卡密</h2><p class="hint">有效期从首次成功激活时开始计算。生成后请立即复制并妥善保存，后台不保存明文。</p>
<div class="form"><div class="field"><label for="days">使用期限</label><select id="days"><option value="7">7 天</option><option value="30" selected>30 天</option><option value="90">90 天</option><option value="365">365 天</option><option value="0">永久</option></select></div><div class="field count-field"><label for="issue-count">生成数量</label><input id="issue-count" type="number" min="1" max="50" step="1" value="1" required></div><button id="issue" class="primary">生成卡密</button></div>
<div id="new-key" class="notice" hidden><p id="issue-summary" class="key-caption">新卡密（只显示本次）：</p><textarea id="key-text" class="key-output" readonly spellcheck="false" aria-label="本批次卡密"></textarea><div class="tools"><button id="copy">复制全部</button><button id="export">导出 TXT</button></div></div></section>
<section class="panel"><h2>管理说明</h2><p class="hint">解绑设备：允许将同一张卡密换到另一台设备，已开始的有效期不会重置。<br>停用卡密：立即阻止授权验证和脚本下载。<br>恢复卡密：取消停用，但不会延长到期时间。</p>
<span class="chip green">数据存储：EdgeOne 私有 Blob</span></section></div>
<section class="panel" id="mfa-panel">
  <h2>登录保护</h2><p id="mfa-state" class="hint">正在检查动态验证状态…</p>
  <button id="mfa-start" class="primary" hidden>使用手机扫码绑定</button>
  <section id="mfa-setup" hidden>
    <p class="hint">打开 iPhone 上的 Microsoft Authenticator → 添加账号（+）→ 其他账户 → 扫描二维码。二维码仅在本次绑定过程中显示。</p>
    <div class="mfa-qr"><img id="mfa-qr" alt="GG 管理员动态验证码绑定二维码"></div>
    <details class="mfa-details"><summary>无法扫码？显示手动绑定密钥</summary><p id="mfa-secret" class="key"></p></details>
    <div class="form mfa-form"><div class="field"><label for="mfa-code">输入手机上的 6 位验证码，确认启用</label>
      <input id="mfa-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></div>
      <button id="mfa-confirm" class="primary">确认启用</button></div>
  </section>
  <section id="mfa-recovery" class="notice" hidden><h2>请立即保存恢复码</h2>
    <p class="hint">这些恢复码各只能使用一次。请离线保存，不要截图分享或发送给任何人。关闭后将不再显示明文。</p>
    <p id="mfa-codes" class="mfa-codes"></p><div class="tools">
      <button id="mfa-copy">复制恢复码</button><button id="mfa-recovery-done" class="primary">我已保存</button></div>
  </section>
  <div id="mfa-disable-controls" hidden>
    <p class="hint">更换手机时建议先保留现有验证。若要停用，必须再次输入密码与动态验证码。</p>
    <div class="form"><div class="field"><label for="mfa-disable-password">管理密码</label>
      <input id="mfa-disable-password" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="mfa-disable-code">动态验证码或恢复码</label>
      <input id="mfa-disable-code" type="text" maxlength="23"></div>
      <button id="mfa-disable" class="danger">关闭两步验证</button>
    </div>
  </div>
</section>
<section class="panel"><div class="top list-top"><h2 class="list-heading">卡密列表</h2><span class="muted small" id="count"></span></div>
<div id="cards" class="card-list"><p class="empty">正在加载…</p></div><p id="more" class="hint more-hint" hidden>列表仅展示前 100 条，请清理旧数据或通过本地工具管理其余记录。</p></section></section>
<p id="message" class="notice" role="status" hidden></p><p class="footer">GG EdgeOne 内部候选版 · 管理会话有效期 2 小时 · 所有写入操作需管理员验证</p>
</main>
<script nonce="${nonce}">
'use strict';
const byId = id => document.getElementById(id);
let csrf = '';
let issueAttempt = null;
const message = (value, bad = false) => { const el = byId('message'); el.hidden = !value; el.textContent = value; el.classList.toggle('error', bad); };
const clearMfaSecrets = () => {
  byId('mfa-qr').removeAttribute('src');
  byId('mfa-secret').textContent = '';
  byId('mfa-codes').textContent = '';
  byId('mfa-code').value = '';
  byId('mfa-setup').hidden = true;
  byId('mfa-recovery').hidden = true;
};
const showLogin = () => { csrf = ''; issueAttempt = null; clearMfaSecrets(); byId('key-text').value = ''; byId('new-key').hidden = true; byId('login').hidden = false; byId('dashboard').hidden = true; };
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
async function refreshMfa() {
  const result = await request('mfa/status');
  const active = result.mode !== 'off';
  byId('mfa-state').textContent = result.mode === 'off' ?
    '尚未启用动态验证码。扫码绑定后登录需密码与手机验证码。' :
    result.mode === 'manual' ? '已通过 EdgeOne 环境变量启用两步验证。' :
    '已启用 Microsoft Authenticator 等 TOTP 验证器。剩余恢复码：' + result.recoveryRemaining + ' 个';
  byId('mfa-start').hidden = active;
  byId('mfa-disable-controls').hidden = result.mode !== 'managed';
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
    const result = await response.json(); csrf = result.csrf; showDashboard(); await refreshMfa(); await loadCards();
  } catch(e) { showLogin(); message(e.message, true); }
}
byId('login-form').onsubmit = async e => { e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { const result = await request('login', { password: byId('password').value, totp: byId('totp').value }); byId('password').value = ''; byId('totp').value = ''; csrf = result.csrf; showDashboard(); await refreshMfa(); message(result.usedRecovery ? '已使用一次性恢复码登录，请妥善保存剩余恢复码' : '登录成功'); await loadCards(); }
  catch(e) { message(e.message, true); } finally { button.disabled = false; }
};
byId('mfa-start').onclick = async () => {
  const button = byId('mfa-start'); button.disabled = true;
  try {
    clearMfaSecrets();
    const result = await request('mfa/setup');
    byId('mfa-qr').src = result.qr;
    byId('mfa-secret').textContent = result.secret;
    byId('mfa-setup').hidden = false;
    message('请用手机扫码，随后输入 6 位动态验证码确认绑定');
  } catch (e) { message(e.message, true); }
  finally { button.disabled = false; }
};
byId('mfa-confirm').onclick = async () => {
  const button = byId('mfa-confirm'); button.disabled = true;
  try {
    const result = await request('mfa/confirm', { totp: byId('mfa-code').value.trim() });
    csrf = result.csrf;
    clearMfaSecrets();
    byId('mfa-codes').textContent = result.codes.join('  ');
    byId('mfa-recovery').hidden = false;
    await refreshMfa();
    message('双重验证已启用！请立即保存恢复码');
  } catch (e) { message(e.message, true); }
  finally { button.disabled = false; }
};
byId('mfa-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(byId('mfa-codes').textContent);
    message('恢复码已复制，请保存到可信的密码管理器');
  } catch (e) { message('复制失败，请手动保存恢复码', true); }
};
byId('mfa-recovery-done').onclick = () => {
  byId('mfa-codes').textContent = ''; byId('mfa-recovery').hidden = true;
  message('恢复码已从页面清除');
};
byId('mfa-disable').onclick = async () => {
  if (!confirm('停用两步验证会降低管理后台的安全性，确定继续？')) return;
  const button = byId('mfa-disable'); button.disabled = true;
  try {
    const result = await request('mfa/disable', {
      password: byId('mfa-disable-password').value,
      totp: byId('mfa-disable-code').value.trim()
    });
    csrf = result.csrf;
    byId('mfa-disable-password').value = '';
    byId('mfa-disable-code').value = '';
    clearMfaSecrets(); await refreshMfa();
    message('双重验证已停用');
  } catch (e) { message(e.message, true); }
  finally { button.disabled = false; }
};
byId('issue').onclick = async () => {
  const button = byId('issue');
  const days = Number(byId('days').value);
  const count = Number(byId('issue-count').value);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    message('每批只能生成 1–50 张卡密', true); return;
  }
  if (!byId('new-key').hidden && !confirm('新的结果会覆盖当前页面的明文卡密。请确认已复制或导出，是否继续？')) return;
  const previous = issueAttempt;
  const matching = previous && previous.days === days && previous.count === count;
  issueAttempt = matching ? previous : { days, count, requestId: crypto.randomUUID().replace(/-/g, '') };
  button.disabled = true;
  try {
    const result = await request('issue', issueAttempt);
    const keys = result.keys || (result.key ? [result.key] : []);
    byId('key-text').value = keys.join('\\n');
    byId('issue-summary').textContent = '本批次已保存 ' + result.issued + ' / ' + result.requested + ' 张（仅本次显示明文）';
    byId('new-key').hidden = false;
    if (result.failed) {
      message('部分保存成功：请先复制已生成卡密，再点击生成卡密重试同一批次（不会重置已激活的卡）。', true);
    } else {
      issueAttempt = null;
      message('成功生成 ' + keys.length + ' 张卡密，请复制全部或导出 TXT 妥善保存');
    }
    try { await loadCards(); } catch(e) { message('卡密已生成，但列表刷新失败：' + e.message, true); }
  } catch(e) { message(e.message + '；再次点击将沿用相同批次重试', true); }
  finally { button.disabled = false; }
};
byId('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(byId('key-text').value); message('本批次卡密已复制到剪贴板'); }
  catch(e) { message('复制失败，请手动选中卡密复制：' + e.message, true); }
};
byId('export').onclick = () => {
  const content = byId('key-text').value;
  if (!content) return;
  const blob = new Blob([content + '\\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'GG-卡密-' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  message('已导出 TXT，文件包含明文卡密，请妥善保管');
};
byId('reload').onclick = async () => { try { await loadCards(); message('列表已刷新'); } catch(e) { message(e.message, true); } };
byId('logout').onclick = async () => { try { await request('logout'); showLogin(); message('已退出登录'); }
  catch(e) { message(e.message, true); } };
initialize();
</script></body></html>`;
}
