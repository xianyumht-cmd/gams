#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("remote-script/src/noname.js")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    "// @version      1.1.4",
    "// @version      1.1.5-candidate",
    "script version",
)

old = '''              if(vUYe8N&&yWpiJH&&Epe456s) {
                const XBbHBMQ=window[Epe456s]&&window[Epe456s].__ggOriginalCallback||window[Epe456s];
                let __ggCallbackDone=false;
                const __ggOneShotCallback=function() {
                  if(__ggCallbackDone) {
                    return
                  }
                  __ggCallbackDone=true;
                  try {
                    if(typeof XBbHBMQ==="functi"+"on") {
                      XBbHBMQ( {
                        ["status"]:1,
                        ["msg"]:"succes"+"sful",
                        ["data"]: {
                          ["goods_"+"id"]:vUYe8N,
                          ["order_"+"id"]:zCSo6J["generateTimestamp"](),
                          ["buy_nu"+"m"]:parseInt(yWpiJH,
                          10)
                        }
                      })
                    }
                  }
                  finally {
                    if(window[Epe456s]===__ggOneShotCallback) {
                      if(typeof XBbHBMQ==="functi"+"on") {
                        window[Epe456s]=XBbHBMQ
                      }
                      else {
                        delete window[Epe456s]
                      }
                    }
                  }
                };
                Object.defineProperty(__ggOneShotCallback,"__ggOriginalCallback", {
                  ["value"]:XBbHBMQ,
                  ["config"+"urable"]:true
                });
                window[Epe456s]=__ggOneShotCallback
              }
'''

new = '''              if(vUYe8N&&yWpiJH&&Epe456s) {
                const XBbHBMQ=window[Epe456s];
                let __ggRepeatCallback;
                if(XBbHBMQ&&XBbHBMQ.__ggRepeatCallbackBridge===true) {
                  __ggRepeatCallback=XBbHBMQ
                }
                else {
                  const __ggOriginalCallback=XBbHBMQ&&XBbHBMQ.__ggOriginalCallback||XBbHBMQ;
                  __ggRepeatCallback=function() {
                    const __ggRequest=__ggRepeatCallback.__ggPendingQueue.shift();
                    if(!__ggRequest) {
                      return
                    }
                    if(typeof __ggRepeatCallback.__ggOriginalCallback==="functi"+"on") {
                      __ggRepeatCallback.__ggOriginalCallback( {
                        ["status"]:1,
                        ["msg"]:"succes"+"sful",
                        ["data"]: {
                          ["goods_"+"id"]:__ggRequest.goodsId,
                          ["order_"+"id"]:zCSo6J["generateTimestamp"](),
                          ["buy_nu"+"m"]:__ggRequest.buyNum
                        }
                      })
                    }
                  };
                  Object.defineProperties(__ggRepeatCallback, {
                    ["__ggOriginalCallback"]: {
                      ["value"]:__ggOriginalCallback,
                      ["writa"+"ble"]:true,
                      ["config"+"urable"]:true
                    },
                    ["__ggRepeatCallbackBridge"]: {
                      ["value"]:true,
                      ["config"+"urable"]:true
                    },
                    ["__ggPendingQueue"]: {
                      ["value"]:[],
                      ["config"+"urable"]:true
                    }
                  })
                }
                __ggRepeatCallback.__ggPendingQueue.push( {
                  ["goodsId"]:vUYe8N,
                  ["buyNum"]:parseInt(yWpiJH,
                  10)
                });
                window[Epe456s]=__ggRepeatCallback
              }
'''

text = replace_once(text, old, new, "repeat callback bridge")

required = (
    "// @version      1.1.5-candidate",
    "__ggRepeatCallbackBridge",
    "__ggPendingQueue.shift()",
    "__ggPendingQueue.push",
    "__ggOriginalCallback",
)
for token in required:
    if token not in text:
        raise SystemExit(f"missing candidate contract: {token}")

for forbidden in (
    "__ggOneShotCallback",
    "__ggCallbackDone",
):
    if forbidden in text:
        raise SystemExit(f"obsolete one-shot state remains: {forbidden}")

path.write_text(text, encoding="utf-8")
print("isolated script repeat candidate applied")
