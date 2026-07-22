# game.js 引擎层地图

`game.js` 是完整 Webpack 网页引擎，不是小补丁。

| 项目 | 值 |
|---|---|
| 文件大小 | 11589175 |
| SHA-256 | 51ae52887d0c0475870e4c985edf747a14672f0908221779826934f37b73db43 |
| Webpack 模块数 | 1 |
| SAL 数量 | 122 |
| 绝对 URL 数 | 0 |
| 相对路径数 | 44 |

## 维护分区

1. Webpack 启动和模块装配。
2. SAL 平台适配。
3. 用户与登录。
4. 商城、商品和订单。
5. 存档、设置和状态同步。
6. Canvas/WebGL、场景和交互。
7. 音视频与资源加载。
8. 网络、错误处理和统计。
9. 完整性和调试环境检查。

## 更新时优先比较

- 入口模块和直接依赖。
- SAL 的新增、删除和改名。
- 用户、商城、订单、存档字段次数突变。
- URL、相对路径和关键错误字符串。
- 文件末尾启动逻辑。

## SAL 索引

- `SAL_Login`
- `SAL_Recorder`
- `SAL_VideoFinish`
- `SAL_addClick`
- `SAL_addElement`
- `SAL_addRightClick`
- `SAL_addRightTouchDown`
- `SAL_addRightTouchUp`
- `SAL_addTouchCancel`
- `SAL_addTouchDown`
- `SAL_addTouchEnter`
- `SAL_addTouchMove`
- `SAL_addTouchUp`
- `SAL_alert`
- `SAL_audioSeekTo`
- `SAL_callInput`
- `SAL_checkSRCPreloaded`
- `SAL_checkSession`
- `SAL_clearInterval`
- `SAL_clearStorage`
- `SAL_clearTimeout`
- `SAL_collect`
- `SAL_destroyElement`
- `SAL_exit`
- `SAL_exitOrFullScreen`
- `SAL_getAudioInfo`
- `SAL_getCanvas`
- `SAL_getCapture`
- `SAL_getCurrency`
- `SAL_getElementCount`
- `SAL_getElementCurHeight`
- `SAL_getElementCurWidth`
- `SAL_getElementHeight`
- `SAL_getElementPosX`
- `SAL_getElementPosY`
- `SAL_getElementWidth`
- `SAL_getGameInfo`
- `SAL_getGlobalZoomRatio`
- `SAL_getHTTPProtocol`
- `SAL_getScreenState`
- `SAL_getSign`
- `SAL_getStorage`
- `SAL_getStorageInfo`
- `SAL_getTextSize`
- `SAL_getUserData`
- `SAL_getVideoTimeInfo`
- `SAL_globalUpdate`
- `SAL_log`
- `SAL_manualGC`
- `SAL_mouseWheel`
- `SAL_ninePartDivide`
- `SAL_openDebugger`
- `SAL_openMenu`
- `SAL_openShareMenu`
- `SAL_openWebView`
- `SAL_pauseAudio`
- `SAL_pauseVideo`
- `SAL_payMoney`
- `SAL_playAudio`
- `SAL_playVideo`
- `SAL_preload`
- `SAL_recharge`
- `SAL_removeClick`
- `SAL_removeElement`
- `SAL_removeRightClick`
- `SAL_removeRightTouchDown`
- `SAL_removeRightTouchUp`
- `SAL_removeStorage`
- `SAL_removeTouchCancel`
- `SAL_removeTouchDown`
- `SAL_removeTouchEnter`
- `SAL_removeTouchMove`
- `SAL_removeTouchUp`
- `SAL_request`
- `SAL_resetElement`
- `SAL_resetElementClip`
- `SAL_resumeAudio`
- `SAL_resumeVideo`
- `SAL_runAction`
- `SAL_sendMessage`
- `SAL_setAnimationPlay`
- `SAL_setAudioPlayRate`
- `SAL_setAudioVolume`
- `SAL_setBitmapFont`
- `SAL_setCanvas`
- `SAL_setContainerOffset`
- `SAL_setElementAnchor`
- `SAL_setElementBlockTouch`
- `SAL_setElementClip`
- `SAL_setElementIndex`
- `SAL_setElementListInfo`
- `SAL_setElementMirrorType`
- `SAL_setElementMouseEnable`
- `SAL_setElementOpacity`
- `SAL_setElementScale`
- `SAL_setElementSize`
- `SAL_setElementVisible`
- `SAL_setFPS`
- `SAL_setInterval`
- `SAL_setMask`
- `SAL_setPosition`
- `SAL_setRotate`
- `SAL_setStorage`
- `SAL_setTextColor`
- `SAL_setTextFont`
- `SAL_setTextFontSize`
- `SAL_setTextStyle`
- `SAL_setTimeout`
- `SAL_setTransparencyFiltering`
- `SAL_setVideoLoop`
- `SAL_setVideoVolume`
- `SAL_setVisibleChangeListener`
- `SAL_share`
- `SAL_showADVideo`
- `SAL_stopAudio`
- `SAL_stopElementAction`
- `SAL_stopVideo`
- `SAL_toolFunc`
- `SAL_updateUserInfoCoin`
- `SAL_uploadImage`
- `SAL_videoFinish`
- `SAL_videoSeekTo`
