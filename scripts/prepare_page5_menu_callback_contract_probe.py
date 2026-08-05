#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker mismatch: {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="scripts/run_page5_guard_full_entry_matrix.mjs")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    text = Path(args.source).read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const outputDir = process.env.OUTPUT_DIR || "page5-guard-full-entry-matrix";',
        'const outputDir = process.env.OUTPUT_DIR || "page5-menu-callback-contract-probe";',
        "output",
    )

    route_block = '''const routes = [
  { page: "page5", targetId: "1691512", url: "https://m.66rpg.com/h5/1691512?ohp=v3&quality=32", steps: [{ label: "target-entry", x: 310, y: 741 }], marker: "target-read" },
];'''
    text, count = re.subn(r"const routes = \[.*?\n\];", route_block, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"route block mismatch: {count}")

    candidate_function = r'''function makeCandidate(source) {
  const mobileOld = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']));}},`;
  const mobileNew = `Sj['pr'+'ot'+'ot'+'yp'+'e']['is'+'Mo'+'bi'+'le']=function(){if(Sg['yI'+'hA'+'A'](Sg['Yz'+'Pf'+'J'],Sg['ka'+'gG'+'p']))return this['_f'+'oc'+'us'+'Gr'+'ou'+'pI'+'d'];else{var SF=this['us'+'er'+'Da'+'ta']['pl'+'at'+'fo'+'rm']['to'+'Lo'+'we'+'rC'+'as'+'e']();return-7096*1+-2669+9765<=SF['in'+'de'+'xO'+'f']('an'+'dr'+'oi'+'d')||Sg['Lr'+'NB'+'P'](327+-13*188+2117,SF['in'+'de'+'xO'+'f'](Sg['oM'+'lO'+'f']))||(location['pa'+'th'+'na'+'me']['in'+'de'+'xO'+'f']('/h5/1691512')>=0&&/android|iphone|ipad|ipod|mobile/i['te'+'st'](navigator['us'+'er'+'Ag'+'en'+'t']));}},`;
  const callbackOld = "SF['Tk'+'Kw'+'f'](SAL_openMenu,function(SH,SA){";
  const callbackNew = callbackOld + `try{var __gamsDescribe=function(__v){var __r={available:!!__v,type:typeof __v,constructorName:'',ownKeys:[],prototypeKeys:[],fieldTypes:{},booleanFields:{},stringFieldLengths:{},objectFields:{}};if(!__v)return __r;try{__r.constructorName=__v.constructor&&__v.constructor.name||'';}catch(__e){}try{__r.ownKeys=Object.getOwnPropertyNames(__v).slice(0,160);}catch(__e){}try{__r.prototypeKeys=Object.getOwnPropertyNames(Object.getPrototypeOf(__v)||{}).slice(0,160);}catch(__e){}for(var __i=0;__i<__r.ownKeys.length;__i++){var __k=__r.ownKeys[__i],__x;try{__x=__v[__k];}catch(__e){__r.fieldTypes[__k]='error';continue;}__r.fieldTypes[__k]=__x===null?'null':typeof __x;if(typeof __x==='boolean')__r.booleanFields[__k]=__x;else if(typeof __x==='string')__r.stringFieldLengths[__k]=__x.length;else if(__x&&typeof __x==='object'){var __o={constructorName:'',keyCount:null,keys:[]};try{__o.constructorName=__x.constructor&&__x.constructor.name||'';}catch(__e){}try{__o.keys=Object.getOwnPropertyNames(__x).slice(0,40),__o.keyCount=Object.getOwnPropertyNames(__x).length;}catch(__e){}__r.objectFields[__k]=__o;}}return __r;};var __gamsRecord={at:Date.now(),first:__gamsDescribe(SH),second:__gamsDescribe(SA)};globalThis.__gamsPage5MenuContract=__gamsRecord;(globalThis.__gamsPage5MenuContractHistory=globalThis.__gamsPage5MenuContractHistory||[]).push(__gamsRecord);}catch(__gamsError){globalThis.__gamsPage5MenuContract={at:Date.now(),captureError:String(__gamsError).slice(0,300)};}`;
  const mobileCount = source.split(mobileOld).length - 1;
  const callbackCount = source.split(callbackOld).length - 1;
  if (mobileCount !== 1) throw new Error(`mobile replacement count mismatch: ${mobileCount}`);
  if (callbackCount !== 1) throw new Error(`callback replacement count mismatch: ${callbackCount}`);
  let candidate = source.replace(mobileOld, mobileNew);
  candidate = candidate.replace(callbackOld, callbackNew);
  if (candidate === source || !candidate.includes("__gamsPage5MenuContractHistory")) throw new Error("candidate verification failed");
  return {
    candidate,
    count: mobileCount + callbackCount,
    oldTextSha256: sha256(Buffer.from(mobileOld + "\n" + callbackOld)),
    newTextSha256: sha256(Buffer.from(mobileNew + "\n" + callbackNew)),
  };
}'''
    text, count = re.subn(
        r"function makeCandidate\(source\) \{.*?\n\}\n\nfunction safeUrl",
        candidate_function + "\n\nfunction safeUrl",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit(f"candidate function mismatch: {count}")

    state_marker = "      navigationGuard: globalThis.__gamsNavigationGuard || null,\n"
    state_addition = state_marker + "      menuContract: globalThis.__gamsPage5MenuContract || null,\n      menuContractHistoryLength: Array.isArray(globalThis.__gamsPage5MenuContractHistory) ? globalThis.__gamsPage5MenuContractHistory.length : 0,\n"
    text = replace_once(text, state_marker, state_addition, "page state")

    summary_marker = "  candidatePage5ScreenshotChanged: Boolean(candidatePage5?.targetScreenChanged),\n"
    summary_addition = summary_marker + "  candidatePage5MenuContractHistoryLength: candidatePage5?.states?.[\"after-01-target-entry\"]?.menuContractHistoryLength || 0,\n  candidatePage5MenuContract: candidatePage5?.states?.[\"after-01-target-entry\"]?.menuContract || null,\n"
    text = replace_once(text, summary_marker, summary_addition, "summary")

    text = replace_once(
        text,
        'mode: "page5-mobile-menu-guard-full-entry-matrix"',
        'mode: "page5-menu-callback-contract-probe"',
        "mode",
    )

    pass_pattern = re.compile(r"report\.pass = .*?\n  && summary\.replacementCount === 1;", re.S)
    pass_block = '''report.pass = summary.totalCases === 2
  && summary.fatalCases === 0
  && summary.runtimeEntryCompleteCases === 2
  && summary.noLoginEnabledCases === 2
  && summary.secondFileLoadCases === 2
  && summary.currentPage5ExpectedErrorObserved
  && summary.candidatePage5PageErrorCount === 0
  && summary.candidatePage5MenuContractHistoryLength > 0
  && summary.blockedOrderCases === 0
  && summary.replacementCount === 2;'''
    text, count = pass_pattern.subn(pass_block, text, count=1)
    if count != 1:
        raise SystemExit(f"pass gate mismatch: {count}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
