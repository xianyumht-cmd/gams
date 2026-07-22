# JavaScript 更新维护流程

1. 保存页面 HTML 和脚本列表。
2. 保存官方 game.js、SALInterface.js、webGLLib.js、GameInfoData.js。
3. 记录 URL、大小、SHA-256 和时间。
4. 生成新基线并与稳定基线比较。
5. 先看 Webpack、SAL、URL、路径和字段变化。
6. 在 canary 中适配，stable 不动。
7. 做受控页面测试和真实安卓测试。
8. 检查 APK、网络和缓存无核心明文。
9. 成功后切换 stable，失败立即回滚。

必测：无 VPN/VPN、首次激活、已有会话、解绑、刷新、返回、后台恢复、G 菜单、全屏、开关、登录、商城、存档、重置、超时和网络切换。
