from pathlib import Path

path = Path("remote-script/src/noname.js")
text = path.read_text(encoding="utf-8")

old_version = "// @version      1.0.6"
new_version = "// @version      1.0.7"
if new_version not in text:
    if old_version not in text:
        raise SystemExit("Expected current script version 1.0.6")
    text = text.replace(old_version, new_version, 1)

old = '''  function start() {
    applyViewportLimit();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleApply, { passive: true });
    window.addEventListener("orientationchange", scheduleApply, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();'''

new = '''  function reinforceAfterInteraction() {
    applyViewportLimit();
    requestAnimationFrame(applyViewportLimit);
    setTimeout(applyViewportLimit, 0);
    setTimeout(applyViewportLimit, 80);
  }

  function start() {
    if (!document.documentElement) {
      setTimeout(start, 0);
      return;
    }
    injectViewportStyle();
    applyViewportLimit();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("pointerup", reinforceAfterInteraction, false);
    document.addEventListener("touchend", reinforceAfterInteraction, { passive: true });
    document.addEventListener("click", reinforceAfterInteraction, false);
    window.addEventListener("resize", scheduleApply, { passive: true });
    window.addEventListener("orientationchange", reinforceAfterInteraction, { passive: true });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", reinforceAfterInteraction, { once: true });
    }
  }

  start();
})();'''

if old not in text:
    raise SystemExit("Expected small-screen startup block not found")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Patched early menu readiness and bumped noname.js to 1.0.7")
