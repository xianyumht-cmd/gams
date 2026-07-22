# SAL 接口分类目录

重组后共识别 `150` 个 SAL 标识符。

## 元素与渲染

- `SAL_CanvasSpriteReload`
- `SAL_addElement`
- `SAL_destroyElement`
- `SAL_getCanvas`
- `SAL_getElementCount`
- `SAL_getElementCurHeight`
- `SAL_getElementCurWidth`
- `SAL_getElementHeight`
- `SAL_getElementPosX`
- `SAL_getElementPosY`
- `SAL_getElementWidth`
- `SAL_getGlobalPosition`
- `SAL_getMaskFilledPercentage`
- `SAL_getTextSize`
- `SAL_getTextureInfoBySprite`
- `SAL_getTextureList`
- `SAL_getTextureUseage`
- `SAL_releaseTexture`
- `SAL_removeElement`
- `SAL_resetElement`
- `SAL_resetElementClip`
- `SAL_runAction`
- `SAL_setAnimationPlay`
- `SAL_setCanvas`
- `SAL_setElementAnchor`
- `SAL_setElementClip`
- `SAL_setElementIndex`
- `SAL_setElementListInfo`
- `SAL_setElementMirrorType`
- `SAL_setElementOpacity`
- `SAL_setElementScale`
- `SAL_setElementSize`
- `SAL_setElementVisible`
- `SAL_setFingerScale`
- `SAL_setMask`
- `SAL_setPosition`
- `SAL_setRotate`
- `SAL_setTextColor`
- `SAL_setTextFont`
- `SAL_setTextFontSize`
- `SAL_setTextFontStyle`
- `SAL_setTextFontWeight`
- `SAL_setTextStyle`
- `SAL_setVisibleChangeListener`
- `SAL_stopElementAction`

## 其他

- `SAL_alert`
- `SAL_checkSRCPreloaded`
- `SAL_drawShape`
- `SAL_enablePercentCoordinate`
- `SAL_fillMode`
- `SAL_getGlobalZoomRatio`
- `SAL_getResourceSize`
- `SAL_getScreenState`
- `SAL_getSystemInfo`
- `SAL_globalUpdate`
- `SAL_isAndroid`
- `SAL_isIOS`
- `SAL_isMobile`
- `SAL_needGetResourceSize`
- `SAL_ninePartDivide`
- `SAL_openMenu`
- `SAL_openWebView`
- `SAL_preload`
- `SAL_resetClip`
- `SAL_resize`
- `SAL_screenShotGL`
- `SAL_setBitmapFont`
- `SAL_setContainerOffset`
- `SAL_setFPS`
- `SAL_setLoadCompleteCallback`
- `SAL_setShadowMode`
- `SAL_setTransparencyFiltering`
- `SAL_stopPreload`

## 支付、广告与分享

- `SAL_openShareMenu`
- `SAL_payMoney`
- `SAL_recharge`
- `SAL_share`

## 用户、存储与平台

- `SAL_Login`
- `SAL_checkSession`
- `SAL_clearStorage`
- `SAL_getCurrency`
- `SAL_getGameInfo`
- `SAL_getSign`
- `SAL_getStorage`
- `SAL_getStorageInfo`
- `SAL_getUserData`
- `SAL_removeStorage`
- `SAL_setStorage`
- `SAL_updateUserInfoCoin`

## 网络与上报

- `SAL_collect`
- `SAL_getHTTPProtocol`
- `SAL_request`
- `SAL_sendMessage`
- `SAL_uploadImage`

## 视频与采集

- `SAL_Recorder`
- `SAL_VideoFinish`
- `SAL_getCapture`
- `SAL_getVideoTimeInfo`
- `SAL_pauseVideo`
- `SAL_playVideo`
- `SAL_resumeVideo`
- `SAL_setVideoLoop`
- `SAL_setVideoVolume`
- `SAL_showADVideo`
- `SAL_stopVideo`
- `SAL_videoFinish`
- `SAL_videoSeekTo`

## 输入与交互

- `SAL_addClick`
- `SAL_addRightClick`
- `SAL_addRightTouchDown`
- `SAL_addRightTouchUp`
- `SAL_addTouchCancel`
- `SAL_addTouchDown`
- `SAL_addTouchEnter`
- `SAL_addTouchMove`
- `SAL_addTouchUp`
- `SAL_callInput`
- `SAL_mouseWheel`
- `SAL_removeAllTouchEvent`
- `SAL_removeClick`
- `SAL_removeRightClick`
- `SAL_removeRightTouchDown`
- `SAL_removeRightTouchUp`
- `SAL_removeTouchCancel`
- `SAL_removeTouchDown`
- `SAL_removeTouchEnter`
- `SAL_removeTouchMove`
- `SAL_removeTouchUp`
- `SAL_setElementBlockTouch`
- `SAL_setElementMouseEnable`

## 运行时工具

- `SAL_clearInterval`
- `SAL_clearTimeout`
- `SAL_exit`
- `SAL_exitOrFullScreen`
- `SAL_log`
- `SAL_manualGC`
- `SAL_openDebugger`
- `SAL_setInterval`
- `SAL_setTimeout`
- `SAL_toolFunc`

## 音频

- `SAL_audioSeekTo`
- `SAL_deleteAudio`
- `SAL_getAudioInfo`
- `SAL_pauseAudio`
- `SAL_playAudio`
- `SAL_preloadAudio`
- `SAL_resumeAudio`
- `SAL_setAudioPlayRate`
- `SAL_setAudioVolume`
- `SAL_stopAudio`

## 维护说明

- SAL 名称是比混淆变量更稳定的行为锚点。
- 新版出现新增或删除时，先判断平台接口变化，再检查上层功能。
- 接口存在不代表当前作品一定调用，需要结合真实运行日志确认。
