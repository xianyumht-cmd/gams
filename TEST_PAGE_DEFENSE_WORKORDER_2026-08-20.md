# GAMS 测试页防御加固工单

- 工单日期：2026-08-20
- 工单类型：安全加固 / 认证链路防御 / 重复操作校验
- 目标页面：`https://m.66rpg.com/h5/1696089?ohp=v3&quality=32`
- 目标：确认并固化当前测试页对第三方脚本旧逻辑的拦截能力，补齐后端关键校验，避免旧缓存态、空登录态或重复操作沿用旧会话继续通过
- 结论摘要：当前页面已经具备有效防线，核心方向不是按钮、CSS 或前端点位，而是“登录态不再同步直给 + 异步回填 + 未通过即进入认证链 + 重复操作重验”。后续应把这一策略进一步下沉到后端接口层

> 说明：本文只列出第三方脚本当前已经暴露出来、最可能继续被调整的原始依赖片段，以及测试页当前已经生效的对应防御代码。本文不提供新的第三方更新实现。

## 一、问题背景

在多次手工复现中，测试页出现了以下稳定现象：

1. 第三方脚本辅助下，前几次操作可以正常走通。
2. 在重复操作达到一定次数后，会从 H5 页面跳转到认证相关页面。
3. 跳转前，点击事件是被正确记录到的，说明问题不在点击坐标或页面按钮结构本身。
4. 早期复现中，第三方脚本还出现过直接读取用户字段失败的异常。

这说明：

- 问题核心不是“点不到”。
- 问题核心是第三方脚本依赖的旧登录态注入方式、旧用户对象可用时机、旧重复操作状态复用方式，已经与当前测试页结构不兼容。

## 二、关键证据

### 1. 第三方脚本曾直接因用户字段不存在而报错

证据文件：

- [webview-runtime-session-2026-08-20T16-41-32-551/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T16-41-32-551/report.json)

关键错误：

```text
Uncaught TypeError: Cannot read properties of undefined (reading 'userRealName')
```

这说明第三方脚本默认假设某个用户对象在当前时刻已经存在，并且其中应包含：

- `userRealName`
- `userIsVisitor`
- 同类用户状态字段

### 2. 后续复现中，即使不再崩溃，仍然会带空登录态继续请求

证据文件：

- [webview-runtime-session-2026-08-20T17-06-56-173/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T17-06-56-173/report.json)

日志中能看到多类请求出现：

```text
uid=0
token=
```

这说明第三方脚本并不是每一步都重新确认真实登录态，而是存在“拿旧状态继续跑后续流程”的行为。

### 3. 当前页面已经具备明确的认证回跳链

当前页面和公共脚本中都能看到：

- `/ajax/user/getMobileUserInfo.json`
- `/sso/minicheck`
- `/sso/mobileLogin`
- `/mini/login`

这表明当前页面在登录态不足或无效时，不是静默继续，而是会主动进入认证链。

## 三、涉及文件

### 1. 第三方脚本

- [game-1.0.5.js](/D:/project2/gams/game-engine/release/game-1.0.5.js)

### 2. 当前测试页模板抓取

- [.h5-page.html](/D:/project2/gams/.h5-page.html:138)

### 3. 当前公共登录逻辑

- [Common-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/Common-202608190002.js:1802)
- [ssologin-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/ssologin-202608190002.js:280)

### 4. 关键运行日志

- [webview-runtime-session-2026-08-20T16-41-32-551/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T16-41-32-551/report.json)
- [webview-runtime-session-2026-08-20T16-48-48-300/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T16-48-48-300/report.json)
- [webview-runtime-session-2026-08-20T17-06-56-173/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T17-06-56-173/report.json)

## 四、对照表

| 编号 | 第三方脚本当前原始依赖点 | 第三方原始片段位置 | 当前测试页对应防御代码 | 当前防守意义 | 优先级 |
|---|---|---|---|---|---|
| DEF-001 | 同步读取实名/访客字段 | `game-1.0.5.js` offset `1209278` | `.h5-page.html` 初始化 `#data.user=false`；`Common.js` 重新初始化登录态 | 不再在页面初始阶段直接提供完整用户对象 | High |
| DEF-002 | 从缓存 `userData.token` 继续发请求 | `game-1.0.5.js` offset `1003776` | `Common.js` 每次 `login.init()` 先将 `uid=0`、`loginStatus=false` | 阻断旧缓存态直接贯穿后续步骤 | High |
| DEF-003 | 统一 XHR 封装继续打接口 | `game-1.0.5.js` offset `177209` | `ssologin.js` 与 `Common.js` 未通过时进入 `/sso/mobileLogin` | 低可信状态不继续放行，而是拉回认证链 | High |
| DEF-004 | 旧逻辑把 `#data.user` 当作同步真值 | 由报错与后续空态请求共同证明 | `Common.js getUserInfo/init` 与 `.h5-page.html` 占位逻辑 | 页面登录态变成“先空后补”，旧同步逻辑失效 | High |
| DEF-005 | 重复步骤沿用第一次成功后的状态 | 由多次成功后第九次失败现象证明 | `ajaxLoginCall/notLoginCall` 均重新 `login.init()` | 重复操作时重新核对状态，而不是无条件复用第一次结果 | Critical |

## 五、第三方脚本当前原始片段

以下片段均来自本地文件 [game-1.0.5.js](/D:/project2/gams/game-engine/release/game-1.0.5.js)。由于源码为压缩混淆版本，这里展示的是可定位到的原始片段，而不是人工改写后的伪代码。

### DEF-001：同步读取实名/访客字段

定位：

- `game-1.0.5.js`
- 关键偏移：`1209278`

原始片段：

```js
NQ={email:SF['em'+'ai'+'l'],phone:SF['mo'+'bi'+'le'],real_email:SF['ve'+'r_'+'em'+'ai'+'l'],real_phone:SF['ve'+'r_'+'mo'+'bi'+'le'],ver_uid:SF['ui'+'d']}:(NQ=null,tQ=SF['al'+'er'+'t_'+'ms'+'g'],tz=SF['ne'+'xt'+'_t'+'im'+'e'],tC=SF['pl'+'ay'+'_t'+'im'+'e'],tp={userRealName:SF['re'+'al'+'_n'+'am'+'e'],userRealAge:SF['re'+'al'+'_a'+'ge'],userIsVisitor:SF['is'+'_v'+'is'+'it'+'or']},G2['oN'+'aF'+'X'](...),isM&&(SF['fo'+'rc'+'e_'+'lo'+'gi'+'n'],tq=SF['do'+'wn'+'lo'+'ad'+'_a'+'pp'+'_m'+'sg']))
```

解读：

- 第三方脚本默认认为当前流程里，`SF` 对象已经包含实名、年龄、访客态等字段。
- 一旦当前页面不再同步提供该对象，旧逻辑就会失效，甚至直接抛异常。

### DEF-002：继续从缓存 `userData.token` 取 token

定位：

- `game-1.0.5.js`
- 关键偏移：`1003776`

原始片段：

```js
this['ge'+'tR'+'an'+'kI'+'nd'+'ex']=function(SP,SS,Sf){
  SS={gindex:N2,rank_date:SS,rank_type:SP},
  this['is'+'Mo'+'bi'+'le']()&&(SS['to'+'ke'+'n']=this['us'+'er'+'Da'+'ta']['to'+'ke'+'n']),
  jj['se'+'nd'+'Ge'+'tA'+'ja'+'xJ'+'SO'+'N'](...)
}
```

解读：

- 第三方脚本会从内部缓存的 `this.userData.token` 继续构造后续请求。
- 如果页面改成“每次关键步骤都重新检查当前 uid/token 是否仍有效”，旧缓存态就不再可靠。

### DEF-003：统一 XHR 封装继续打接口

定位：

- `game-1.0.5.js`
- 关键偏移：`177209`

原始片段：

```js
var G2=new XMLHttpRequest();
G2['op'+'en'](F['fY'+'yj'+'m'],U,!![]);
G2['se'+'tR'+'eq'+'ue'+'st'+'He'+'ad'+'er'](F['TT'+'To'+'P'],F['cB'+'RF'+'y']);
G2['wi'+'th'+'Cr'+'ed'+'en'+'ti'+'al'+'s']=!![];
G2['on'+'re'+'ad'+'ys'+'ta'+'te'+'ch'+'an'+'ge']=function(){...};
G2['se'+'nd'](G3);
```

解读：

- 第三方脚本内部有自己的请求发送通道。
- 这意味着前端仅靠“页面看起来没按钮”之类的阻断并不可靠。
- 真正的防线必须落到服务端认证、会话重验、接口鉴权。

### DEF-004：旧逻辑曾把当前环境当成可持续利用态

定位：

- 第三方现象证据来自日志，不是单个独立函数
- 对应日志可见空 `uid=0`、空 `token=` 继续请求

证据文件：

- [webview-runtime-session-2026-08-20T17-06-56-173/report.json](/D:/project2/gams/tests/artifacts/webview-runtime-session-2026-08-20T17-06-56-173/report.json)

解读：

- 第三方并没有在每一步都等待页面重新给出有效用户态。
- 这正是“重复步骤沿用旧缓存”的体现。

### DEF-005：环境探测与异常环境上报

定位：

- `game-1.0.5.js`
- 关键偏移：`11568993`

原始片段：

```js
try{
  var M={};
  M[R]=J;
  window[f](v,M);
  var e=window[W][C]();
  function w(){
    var l=window[W][C]();
    if(i['mu'+'HI'+'Q'](i['id'+'en'+'d'](l,e),...)){
      window[D][H](x);
      if(window['to'+'p']!==window['se'+'lf']){...}
    }
  }
}
```

解读：

- 这说明第三方脚本本身也在尝试探测异常环境，并会上报。
- 它不是本次认证跳转的主因，但说明该脚本会根据环境做分支处理。

## 六、当前测试页已经生效的对应防御代码

### DEF-001 / DEF-004 对应：初始化时不直接提供真实用户对象

来源：

- [`.h5-page.html`](/D:/project2/gams/.h5-page.html:144)

当前代码：

```js
ssoLogin.setConf({
  whetherMinLogin: false,
  loginCall: [{obj: {}, callback: loginSuc, args: ""}],
  logoutCall: [{obj: {}, callback: loginOut, args: ""}],
  ajaxLoginCall: [{obj: {}, callback: ajaxLoginCall, args: ""}],
  notLoginCall : [{obj: {}, callback: notLoginCall, args: ""}],
  minIframeSrc: window.location.href,
  isAjax: true,
  dataKey: "user",
  isGamePage: !platMark,
  openNotic: false
});
var user = $.parseJSON('false');
$("#data").data("user", user);
```

当前效果：

- `#data.user` 在初始化阶段不是完整真实用户对象。
- 第三方旧逻辑不能再假设“页面一进来就能直接读到完整用户字段”。

### DEF-001 / DEF-002 / DEF-004 对应：每次初始化登录态时先清空

来源：

- [Common-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/Common-202608190002.js:1802)

当前代码：

```js
this.getUserInfo =function () {
  if(commonPlayer.platform == 0){
    return window.parent.$("#data").data("user");
  }else{
    return $("#data").data("user");
  }
};
this.init = function(callBack){
  var userInFo = this.getUserInfo();
  var funcFinish = function() {
    initUserData();
    callBack&&callBack();
  };
  commonPlayer.loginStatus = false;
  commonPlayer.userInfos.uid = 0;
  if(userInFo){
    commonPlayer.userInfos = JSON.parse(JSON.stringify(userInFo));
    commonPlayer.userInfos.uid = parseInt(userInFo.uid);
    if(commonPlayer.userInfos.uid > 0){
      commonPlayer.loginStatus = true;
      commonPlayer.sendFlower.sendFlowerState(funcFinish);
    }
  }
  if (!commonPlayer.loginStatus) {
    funcFinish();
  }
};
```

当前效果：

- 每次走 `login.init()` 都不是沿用旧值直接认定通过。
- 先把 `uid=0`、`loginStatus=false`，再根据当前实际回填结果决定是否进入登录态。

### DEF-003 对应：未登录或无效态时进入认证链

来源：

- [ssologin-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/ssologin-202608190002.js:29)
- [Common-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/Common-202608190002.js:1829)
- [`.h5-page.html`](/D:/project2/gams/.h5-page.html:305)

当前代码一：

```js
quickLogin: function () {
  if (window.org_box) {
    window.org_box.Login();
  } else {
    window.location.href = "/sso/mobileLogin?curUrl=" + loginUrl;
  }
}
```

当前代码二：

```js
this.midLogin = function(callBack){
  if(mark.WEB){
    window.parent.asUserOperate.userLogin();
  }else{
    location.href = `/sso/mobileLogin?curUrl=${encodeURIComponent(location.href.slice())}`
  }
  self.loginCallBack = callBack;
};
```

当前代码三：

```html
<iframe id="sso_cross_check_login_modal" style="display:none;" ... src="/sso/minicheck"></iframe>
```

当前效果：

- 当前页面不是简单前端拦截，而是明确存在认证回跳链。
- 旧脚本一旦拿不到真实有效态，就会被送去 `minicheck -> mobileLogin -> mini/login`。

### DEF-002 / DEF-005 对应：异步回填当前用户态

来源：

- [ssologin-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/ssologin-202608190002.js:280)

当前代码：

```js
my.ajaxAsync = function () {
  var _that = this;
  $.ajax({
    url: webUrl + '/ajax/user/getMobileUserInfo.json?&stamp;' + new Date().toString(),
    type: 'get',
    dataType: 'jsonp',
    jsonp: 'jsonCallBack',
    data: {},
    success: function (data) {
      var baseData = data.data, status = data.status;
      if (parseInt(baseData.userInfos.uid) <= 0) {
        $('#sso_cross_check_login_modal').attr('src', '/sso/minicheck');
      } else {
        _that.setLoginInfo(baseData.userInfos);
        if (_conf.openNotic) {
          ssoLogin.notice();
        }
      }
      _private.checkCallBack(_conf.ajaxLoginCall);
    }
  });
}
```

当前效果：

- 页面不是信任前端本地缓存，而是异步向当前体系确认用户状态。
- 如果返回 `uid <= 0`，直接触发认证检查。

### DEF-005 对应：重复步骤也重新初始化登录态

来源：

- [Common-202608190002.js](/D:/project2/gams/tests/artifacts/version-compare/Common-202608190002.js:1886)

当前代码：

```js
ajaxLoginCall = function () {
  commonPlayer.login.init(function(){
    initGame();
  })
};
notLoginCall = function(){
  console.log("没有登录进入游戏");
  commonPlayer.login.init(function(){
    initGame();
  })
};
```

当前效果：

- 自动登录回调和未登录回调都重新走 `login.init()`。
- 这意味着重复步骤不是默认延续第一次成功态，而是重新确认当前状态。

## 七、后端必须继续加固的事项

以下事项为本工单的核心实施项，优先级高于任何前端样式、按钮、DOM 调整：

### TASK-001：关键接口不信任前端 uid

- 所有敏感接口必须以真实会话、服务端 token、服务端状态为准。
- 前端传来的 `uid` 只能作为辅助信息，不能单独作为授权依据。
- 若当前接口链路中仍存在“只要 uid 合法就继续”的逻辑，必须移除。

### TASK-002：重复操作增加短时会话重验

- 每次重复关键操作前，服务端都应重新校验当前会话是否仍有效。
- 如果会话为空、过期、降级、丢失绑定，直接拒绝并返回认证要求。
- 不能只在页面首次加载时判一次登录态。

### TASK-003：敏感接口增加一次性参数或短时签名

- 对关键步骤增加 `nonce`、时效戳、单次签名或短时令牌。
- 避免旧缓存态、旧请求参数在后续重复操作中直接复用。

### TASK-004：认证检查必须落在后端

- 前端的 `/sso/minicheck`、`/mobileLogin` 只是用户路径，不应是唯一防线。
- 后端接口必须能在任何时候单独判断：
  - 当前是否已登录
  - 当前是否有权限
  - 当前重复步骤是否需要重新认证

### TASK-005：记录重复操作失败的服务端审计日志

- 建议记录：
  - 请求时间
  - 当前用户会话状态
  - token 是否为空
  - uid 是否为空或为 0
  - 是否命中重复重验策略
  - 是否转入认证链

这样下次复盘时，不需要只靠前端运行日志反推。

## 八、验收标准

程序员完成本工单后，至少应满足以下验收条件：

1. 页面初始化时仍然不直接暴露完整同步用户对象。
2. 关键流程必须依赖异步确认后的真实用户态，而不是页面模板直接注入的旧缓存值。
3. 重复操作达到任意次数时，只要服务端会话条件不满足，就必须稳定进入认证链或被接口拒绝。
4. 仅凭空 `uid`、空 `token`、旧缓存态，不应继续通过关键后续流程。
5. 前端与后端日志都能明确说明：
   - 当前是否未登录
   - 当前是否触发重复操作重验
   - 当前是否因后端校验失败而被送去认证

## 九、建议修复顺序

1. 先核查所有关键接口是否仍信任前端 `uid`。
2. 再为重复操作链路补齐短时会话重验。
3. 再补充 nonce / 时效签名 / 单次令牌。
4. 最后补日志与告警。

## 十、给程序员的最终结论

当前测试页已经证明一个方向是有效的：

- 不再在页面初始阶段直接提供完整用户字段
- 不再把 `#data.user` 当成必定已就绪的同步对象
- 每次关键回调重新初始化登录态
- 登录态不足时进入认证链

如果要继续加强，重点不在前端点位和样式，而在后端：

- 不信任前端 uid
- 重复操作做服务端重验
- 关键步骤加入一次性约束
- 保留并强化当前“先空、后补、未过即认证”的结构

这才是抵御第三方旧逻辑继续试图适配的正确方向。
