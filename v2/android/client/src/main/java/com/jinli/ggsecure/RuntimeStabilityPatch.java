package com.jinli.ggsecure;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class RuntimeStabilityPatch {
    private static final String STORAGE_MARKER = "[\"initSt\"+\"orageH\"+\"ook\"]()";
    private static final String XHR_MARKER = "[\"initXh\"+\"rHook\"](...vUYe8N)";
    private static final String JSONP_MARKER = "[\"initJs\"+\"onpHoo\"+\"k\"]()";
    private static final String GUARD_MARKER = "void function(){var G=window,V='";

    private static final String STORAGE_BODY = """
              const marker=Symbol.for("gg.runtime.storage-hook.v2");
              if(window[marker]) {
                return
              }
              Object["entrie"+"s"](mIpEbB)["forEach"](([publicName,backingName])=> {
                const legacyDescriptor=Object.getOwnPropertyDescriptor(Object.prototype,publicName);
                if(legacyDescriptor&&legacyDescriptor.configurable) {
                  delete Object.prototype[publicName]
                }
                const currentDescriptor=Object.getOwnPropertyDescriptor(window,publicName);
                if(currentDescriptor&&!currentDescriptor.configurable) {
                  return
                }
                Object.defineProperty(window,publicName, {
                  get:()=> {
                    const value=window[backingName];
                    return publicName==="mallViewData"?zjEv2f["patchMallViewData"](value):value
                  },
                  set(value) {
                    window[backingName]=publicName==="showLocal"&&value===false?true:value
                  },
                  enumerable:false,
                  configurable:true
                })
              });
              Object.defineProperty(window,marker, {
                value:true,
                enumerable:false,
                configurable:true,
                writable:false
              })
            """;

    private static final String XHR_BODY = """
              const marker=Symbol.for("gg.runtime.xhr-open.v2"),
              requestUrlKey=Symbol.for("gg.runtime.xhr-url.v2"),
              prototype=XMLHttpRequest.prototype;
              if(prototype[marker]) {
                return
              }
              const originalOpen=prototype.open;
              Object.defineProperty(prototype,marker, {
                value:originalOpen,
                enumerable:false,
                configurable:true,
                writable:false
              });
              prototype.open=function(...args) {
                let patchedUrl=args[1];
                try {
                  patchedUrl=zjEv2f["patchG"+"ameFlo"+"wUrl"](String(args[1]))
                }
                catch(error) {
                  patchedUrl=args[1]
                }
                args[1]=patchedUrl;
                this[requestUrlKey]=String(patchedUrl);
                originalOpen.apply(this,args);
                const onReadyStateChange=()=> {
                  if(this.readyState!==4) {
                    return
                  }
                  this.removeEventListener("readystatechange",onReadyStateChange);
                  if(this.status!==200) {
                    return
                  }
                  const responseType=this.responseType||"";
                  if(responseType!==""&&responseType!=="text") {
                    return
                  }
                  if(!pw0zF4["enable"+"FreeMo"+"de"]) {
                    return
                  }
                  if(!this[requestUrlKey].includes("/createBuyOrder")) {
                    return
                  }
                  try {
                    Object.defineProperty(this,"responseText", {
                      value:zjEv2f["buildC"+"reateO"+"rderRe"+"sponse"](this[requestUrlKey]),
                      writable:true,
                      configurable:true
                    })
                  }
                  catch(error) {
                    console.error("请求拦截失败：",error)
                  }
                };
                this.addEventListener("readystatechange",onReadyStateChange)
              }
            """;

    private static final String JSONP_BODY = """
              const marker=Symbol.for("gg.runtime.jsonp-create-element.v2");
              if(document[marker]) {
                return
              }
              const originalCreateElement=document.createElement,
              scriptMarker=Symbol.for("gg.runtime.jsonp-script-src.v2"),
              nativeSrcDescriptor=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,"src");
              document.createElement=function(tagName,...args) {
                const node=originalCreateElement.call(this,tagName,...args);
                if(String(tagName).toLowerCase()!=="script"||node[scriptMarker]) {
                  return node
                }
                Object.defineProperty(node,scriptMarker, {
                  value:true,
                  configurable:true
                });
                const setNativeSrc=value=> {
                  if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.set==="function") {
                    return nativeSrcDescriptor.set.call(node,value)
                  }
                  return node.setAttribute("src",value)
                },
                getNativeSrc=()=> {
                  if(nativeSrcDescriptor&&typeof nativeSrcDescriptor.get==="function") {
                    return nativeSrcDescriptor.get.call(node)
                  }
                  return node.getAttribute("src")
                };
                Object.defineProperty(node,"src", {
                  set(value) {
                    const source=String(value);
                    if(pw0zF4["enableFreeMode"]&&source.includes("createBuyOrder")) {
                      try {
                        const params=new URL(source,document.baseURI).searchParams,
                        goodsId=params.get("goods_id"),
                        buyNum=params.get("buy_num"),
                        callbackName=params.get("jsonCallback");
                        if(goodsId&&buyNum&&callbackName) {
                          const payload= {
                            status:1,
                            msg:"successful",
                            data: {
                              goods_id:goodsId,
                              order_id:zCSo6J["generateTimestamp"](),
                              buy_num:parseInt(buyNum,10)
                            }
                          },
                          currentCallback=window[callbackName];
                          if(currentCallback&&currentCallback.__ggRuntimeJsonpState) {
                            currentCallback.__ggRuntimeJsonpState.queue.push(payload)
                          }
                          else {
                            const state= {
                              original:currentCallback,
                              queue:[payload],
                              timer:0
                            },
                            dispatcher=function(...callbackArgs) {
                              const replacement=state.queue.shift();
                              try {
                                if(typeof state.original==="function") {
                                  return replacement?state.original(replacement):state.original(...callbackArgs)
                                }
                              }
                              finally {
                                if(state.queue.length===0&&window[callbackName]===dispatcher) {
                                  clearTimeout(state.timer);
                                  if(typeof state.original==="function") {
                                    window[callbackName]=state.original
                                  }
                                  else {
                                    delete window[callbackName]
                                  }
                                }
                              }
                            };
                            Object.defineProperty(dispatcher,"__ggRuntimeJsonpState", {
                              value:state,
                              configurable:true
                            });
                            state.timer=setTimeout(()=> {
                              if(window[callbackName]===dispatcher) {
                                if(typeof state.original==="function") {
                                  window[callbackName]=state.original
                                }
                                else {
                                  delete window[callbackName]
                                }
                              }
                            },30000);
                            window[callbackName]=dispatcher
                          }
                        }
                      }
                      catch(error) {
                        console.error("JSONP拦截初始化失败：",error)
                      }
                    }
                    return setNativeSrc(source)
                  },
                  get() {
                    return getNativeSrc()
                  },
                  enumerable:true,
                  configurable:true
                });
                return node
              };
              Object.defineProperty(document,marker, {
                value:originalCreateElement,
                enumerable:false,
                configurable:true,
                writable:false
              })
            """;

    private static final Pattern ENGINE_PREFIX = Pattern.compile(
            "/\\*1\\.0\\.5\\*/\\(function\\(\\)\\{try\\{var __ggGlobal=.*?window\\.__gg_engine_load_state__=\\\"loading\\\";try\\{",
            Pattern.DOTALL);

    private static final String ENGINE_PREFIX_REPLACEMENT =
            "/*1.0.5*/(function(){var __ggGlobal=typeof window!==\"undefined\"?window:globalThis;" +
            "var __ggNow=Date.now(),__ggState=__ggGlobal.__gg_engine_load_state__," +
            "__ggStarted=Number(__ggGlobal.__gg_engine_load_started_at__||0);" +
            "if(__ggState===\"ready\")return;" +
            "if(__ggState===\"loading\"&&__ggStarted>0&&__ggNow-__ggStarted<15000)return;" +
            "__ggGlobal.__gg_engine_load_state__=\"loading\";" +
            "__ggGlobal.__gg_engine_load_started_at__=__ggNow;try{";

    private static final String ENGINE_OLD_SUFFIX =
            "try{Object.defineProperty(window,\"__gg_runtime_probe__\",{value:Object.freeze({engine:\"1.0.4\",ready:true,loadedAt:Date.now()}),enumerable:false,configurable:false,writable:false});}catch(_){}" +
            "window.__gg_engine_load_state__=\"ready\";}catch(e){window.__gg_engine_load_state__=\"\";throw e;}})();";

    private static final String ENGINE_NEW_SUFFIX =
            "try{Object.defineProperty(window,\"__gg_runtime_probe__\",{value:Object.freeze({engine:\"1.0.5\",ready:true,loadedAt:Date.now()}),enumerable:false,configurable:true,writable:false});}catch(_){}" +
            "__ggGlobal.__gg_engine_load_state__=\"ready\";" +
            "__ggGlobal.__gg_engine_load_started_at__=0;" +
            "}catch(e){__ggGlobal.__gg_engine_load_state__=\"\";" +
            "__ggGlobal.__gg_engine_load_started_at__=0;throw e;}})();";

    private RuntimeStabilityPatch() { }

    static byte[] patchNoname(byte[] originalBytes) {
        String text = new String(originalBytes, StandardCharsets.UTF_8);
        if (isNonamePatched(text)) {
            verifyNoname(text);
            return originalBytes.clone();
        }
        String original = text;
        text = replaceMethodBody(text, STORAGE_MARKER, STORAGE_BODY);
        text = replaceMethodBody(text, XHR_MARKER, XHR_BODY);
        text = replaceMethodBody(text, JSONP_MARKER, JSONP_BODY);
        if (text.equals(original)) throw new SecurityException("控制层稳定性修复未生效");
        verifyNoname(text);
        return text.getBytes(StandardCharsets.UTF_8);
    }

    static byte[] patchGame(byte[] originalBytes) {
        String text = new String(originalBytes, StandardCharsets.UTF_8);
        if (isGamePatched(text)) {
            verifyGame(text);
            return originalBytes.clone();
        }
        String original = text;
        text = patchEngineWrapper(text);
        GuardResult result = stripResourceExhaustionGuards(text);
        text = result.text;
        if (result.removed < 1) throw new SecurityException("未找到需清理的资源耗尽保护分支");
        if (text.equals(original)) throw new SecurityException("引擎层稳定性修复未生效");
        verifyGame(text);
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static boolean isNonamePatched(String text) {
        return text.contains("Symbol.for(\"gg.runtime.storage-hook.v2\")")
                && text.contains("Symbol.for(\"gg.runtime.xhr-open.v2\")")
                && text.contains("Symbol.for(\"gg.runtime.jsonp-create-element.v2\")");
    }

    private static boolean isGamePatched(String text) {
        return text.contains("__gg_engine_load_started_at__")
                && text.contains("engine:\"1.0.5\"")
                && !containsResourceExhaustionGuard(text);
    }

    private static String replaceMethodBody(String text, String marker, String newBody) {
        int start = text.indexOf(marker);
        if (start < 0) throw new SecurityException("缺少方法标记: " + marker);
        if (text.indexOf(marker, start + marker.length()) >= 0) {
            throw new SecurityException("方法标记不唯一: " + marker);
        }
        int openIndex = text.indexOf('{', start + marker.length());
        if (openIndex < 0) throw new SecurityException("缺少方法起始括号: " + marker);
        int closeIndex = findMatchingBrace(text, openIndex);
        String body = "{\n" + newBody.strip() + "\n    }";
        return text.substring(0, openIndex) + body + text.substring(closeIndex + 1);
    }

    private static String patchEngineWrapper(String text) {
        Matcher matcher = ENGINE_PREFIX.matcher(text);
        if (!matcher.find()) throw new SecurityException("引擎加载前缀不匹配");
        if (matcher.find()) throw new SecurityException("引擎加载前缀不唯一");
        text = ENGINE_PREFIX.matcher(text).replaceFirst(Matcher.quoteReplacement(ENGINE_PREFIX_REPLACEMENT));
        if (!text.endsWith(ENGINE_OLD_SUFFIX)) throw new SecurityException("引擎加载后缀不匹配");
        return text.substring(0, text.length() - ENGINE_OLD_SUFFIX.length()) + ENGINE_NEW_SUFFIX;
    }

    private static GuardResult stripResourceExhaustionGuards(String text) {
        int cursor = 0;
        int removed = 0;
        StringBuilder output = new StringBuilder(text.length());
        while (true) {
            int start = text.indexOf(GUARD_MARKER, cursor);
            if (start < 0) {
                output.append(text, cursor, text.length());
                break;
            }
            output.append(text, cursor, start);
            int openIndex = text.indexOf('{', start);
            int closeIndex = findMatchingBrace(text, openIndex);
            int end = skipSpace(text, closeIndex + 1);
            if (!text.startsWith("()", end)) {
                output.append(text, start, closeIndex + 1);
                cursor = closeIndex + 1;
                continue;
            }
            end += 2;
            end = skipSpace(text, end);
            if (end < text.length() && text.charAt(end) == ';') end++;
            String candidate = text.substring(start, end);
            if (candidate.contains("Function['prototype']['toString']['call']")
                    && candidate.contains("requestAnimationFrame")
                    && candidate.contains("new Array(")
                    && candidate.contains("['sort']()['reverse']()")
                    && candidate.contains("parseInt('0x")) {
                removed++;
                cursor = end;
            } else {
                output.append(candidate);
                cursor = end;
            }
        }
        return new GuardResult(output.toString(), removed);
    }

    private static boolean containsResourceExhaustionGuard(String text) {
        int cursor = 0;
        while (true) {
            int start = text.indexOf(GUARD_MARKER, cursor);
            if (start < 0) return false;
            int openIndex = text.indexOf('{', start);
            int closeIndex = findMatchingBrace(text, openIndex);
            String candidate = text.substring(start, closeIndex + 1);
            if (candidate.contains("requestAnimationFrame") && candidate.contains("new Array(")) return true;
            cursor = closeIndex + 1;
        }
    }

    private static void verifyNoname(String text) {
        String[] required = {
                "Symbol.for(\"gg.runtime.storage-hook.v2\")",
                "Symbol.for(\"gg.runtime.xhr-open.v2\")",
                "Symbol.for(\"gg.runtime.jsonp-create-element.v2\")"
        };
        for (String marker : required) {
            if (count(text, marker) != 1) throw new SecurityException("控制层修复标记数量异常: " + marker);
        }
        if (text.contains("Object[\"defineProperty\"](Object[\"prototype\"]")
                || text.contains("Object.defineProperty(Object.prototype")) {
            throw new SecurityException("控制层仍存在全局原型污染");
        }
    }

    private static void verifyGame(String text) {
        if (text.contains("__gg_engine_alert_filter_installed__")) {
            throw new SecurityException("仍存在旧引擎提示过滤器");
        }
        if (!text.contains("__gg_engine_load_started_at__")) {
            throw new SecurityException("缺少可恢复引擎加载时间戳");
        }
        if (!text.contains("configurable:true,writable:false")) {
            throw new SecurityException("缺少可配置运行探针");
        }
        if (containsResourceExhaustionGuard(text)) {
            throw new SecurityException("仍存在资源耗尽保护分支");
        }
    }

    private static int count(String text, String token) {
        int total = 0;
        int cursor = 0;
        while ((cursor = text.indexOf(token, cursor)) >= 0) {
            total++;
            cursor += token.length();
        }
        return total;
    }

    private static int skipSpace(String text, int index) {
        while (index < text.length() && Character.isWhitespace(text.charAt(index))) index++;
        return index;
    }

    private static boolean looksLikeRegexStart(String text, int index) {
        int j = index - 1;
        while (j >= 0 && Character.isWhitespace(text.charAt(j))) j--;
        if (j < 0) return true;
        if ("([{:;,=!?&|+-*%^~<>\n".indexOf(text.charAt(j)) >= 0) return true;
        int k = j;
        while (k >= 0) {
            char ch = text.charAt(k);
            if (!Character.isLetterOrDigit(ch) && ch != '_' && ch != '$') break;
            k--;
        }
        String word = text.substring(k + 1, j + 1);
        return List.of("return", "case", "throw", "else", "do", "typeof", "instanceof", "in", "of", "yield", "await").contains(word);
    }

    private static int findMatchingBrace(String text, int openIndex) {
        if (openIndex < 0 || openIndex >= text.length() || text.charAt(openIndex) != '{') {
            throw new SecurityException("括号扫描起点无效");
        }
        int depth = 0;
        char quote = 0;
        boolean escaped = false;
        boolean lineComment = false;
        boolean blockComment = false;
        boolean regex = false;
        boolean regexClass = false;
        int i = openIndex;
        while (i < text.length()) {
            char ch = text.charAt(i);
            char next = i + 1 < text.length() ? text.charAt(i + 1) : 0;
            if (lineComment) {
                if (ch == '\r' || ch == '\n') lineComment = false;
                i++;
                continue;
            }
            if (blockComment) {
                if (ch == '*' && next == '/') {
                    blockComment = false;
                    i += 2;
                } else i++;
                continue;
            }
            if (quote != 0) {
                if (escaped) escaped = false;
                else if (ch == '\\') escaped = true;
                else if (ch == quote) quote = 0;
                i++;
                continue;
            }
            if (regex) {
                if (escaped) escaped = false;
                else if (ch == '\\') escaped = true;
                else if (ch == '[') regexClass = true;
                else if (ch == ']' && regexClass) regexClass = false;
                else if (ch == '/' && !regexClass) regex = false;
                i++;
                continue;
            }
            if (ch == '\'' || ch == '"' || ch == '`') {
                quote = ch;
                i++;
                continue;
            }
            if (ch == '/' && next == '/') {
                lineComment = true;
                i += 2;
                continue;
            }
            if (ch == '/' && next == '*') {
                blockComment = true;
                i += 2;
                continue;
            }
            if (ch == '/' && looksLikeRegexStart(text, i)) {
                regex = true;
                regexClass = false;
                i++;
                continue;
            }
            if (ch == '{') depth++;
            else if (ch == '}') {
                depth--;
                if (depth == 0) return i;
                if (depth < 0) throw new SecurityException("括号扫描下溢");
            }
            i++;
        }
        throw new SecurityException("括号未闭合");
    }

    private record GuardResult(String text, int removed) { }
}
