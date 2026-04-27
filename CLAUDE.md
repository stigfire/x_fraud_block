# CLAUDE.md — X Fraud Scanner

Engineering notes for working on this Tampermonkey userscript.
Distilled from development sessions; read before touching any navigation, injection, or API logic.

---

## SPA Navigation Detection

**Rule: never infer URL changes from MutationObserver. Hook history directly.**

X.com uses `history.pushState` for all in-app navigation. `pushState` is synchronous — the URL changes immediately. DOM mutations from React re-rendering come later, asynchronously, in batches. If you compare `location.pathname` inside a MutationObserver callback, you will sometimes see a stale URL (mutation fired before pushState) or miss the change entirely (all mutations batched into one callback, no further mutations after).

The correct pattern — same cross-realm technique used for auth token capture:

```js
const _navCallbacks = [];

// inside hookAuth, where win = unsafeWindow:
['pushState', 'replaceState'].forEach(method => {
  const orig = win.history[method];
  win.history[method] = function (...args) { orig.apply(this, args); fire(); };
});
win.addEventListener('popstate', fire);
function fire() { _navCallbacks.forEach(fn => { try { fn(); } catch (_) {} }); }

// in startUI:
_navCallbacks.push(handleNav);
```

Functions assigned to `win.history[method]` are created in the sandbox, so they close over sandbox variables (`_navCallbacks`). This is the same reason the liveBearer auth hook works.

**MutationObserver is still needed** for injecting inline buttons whenever new tweet articles appear, and as a fallback. But it must not be the source of truth for route changes.

---

## Button Injection

**Rule: injection must be idempotent and have multiple trigger paths.**

Buttons are appended directly to `document.body`. React never touches elements it didn't create, so they survive re-renders. Two things ensure correctness:

1. **Early-return guard** inside `injectBtn()`: `if (document.getElementById('xfs-btn')) return;`  
   Without this, concurrent triggers (nav hook + MutationObserver fallback + setTimeout) would inject duplicates.

2. **Multiple paths**: the nav hook schedules `setTimeout(injectBtn, 300)`, the MutationObserver calls `injectBtn()` directly on every DOM change, and there is an initial `setTimeout(injectBtn, 1200)` on page load. All three are harmless because of the guard.

The 300ms delay after navigation exists only as a safety net. In practice, the MutationObserver fires within milliseconds of X.com starting to render the new page and injects the buttons before the timer fires.

---

## Cross-Tab API Rate Limiting

**Rule: per-tab delays don't protect against multi-tab interference. Use a global mutex.**

When multiple tabs run block operations simultaneously, each tab's local `sleep(N)` only spaces out that tab's own calls. Across tabs, calls can stack and hit the platform's rate limit.

Solution: `navigator.locks` (same-origin mutex) + `localStorage` timestamp:

```js
async function blockUserCoordinated(handle, csrf) {
  return navigator.locks.request('xfs-block-lock', async () => {
    const elapsed = Date.now() - parseInt(localStorage.getItem('xfs-last-block') || '0', 10);
    if (elapsed < BLOCK_DELAY) await sleep(BLOCK_DELAY - elapsed);
    localStorage.setItem('xfs-last-block', String(Date.now()));
    return blockUser(handle, csrf);
  });
}
```

`navigator.locks` is same-origin — all x.com tabs share the same lock namespace. The lock serializes block calls globally; the localStorage timestamp enforces the minimum interval between releases.

Remove any `await sleep(BLOCK_DELAY)` from the calling loop — the delay is fully handled inside the lock.

---

## Persisting User Data (GM Storage)

**Rule: user-editable state must survive page reloads and script upgrades.**

In-memory arrays reset on every page load. `GM_getValue` / `GM_setValue` write to Tampermonkey's own database, separate from the script file. Script upgrades (including cloud sync) never touch this storage.

Pattern:

```js
// @grant GM_getValue
// @grant GM_setValue

const DEFAULT_KWS = [...]; // built-in fallback
let KWS = GM_getValue('kws', DEFAULT_KWS);

function saveKws() { GM_setValue('kws', KWS); }

// On every add/remove:
KWS.push(v); saveKws();
```

Keep `DEFAULT_*` constants separate from the live arrays. They serve as the first-run fallback and document what the script ships with.

**Cross-browser sync caveat**: Tampermonkey's cloud sync (Google Drive etc.) syncs script source only, not GM storage. If the user wants the same custom keywords on multiple browsers, they must add them manually on each, or bake them into `DEFAULT_*` in the script source.

---

## Post-Reload Auto-Action

**Rule: use `sessionStorage` to carry intent across a programmatic `location.reload()`.**

A full page reload wipes all JS state. To trigger an action automatically after reload, write a flag to `sessionStorage` before reloading, then check and clear it in the script's startup:

```js
// Before reload:
sessionStorage.setItem('xfs-auto-sweep', location.pathname);
location.reload();

// On startup (startUI):
const target = sessionStorage.getItem('xfs-auto-sweep');
if (target && target === location.pathname) {
  sessionStorage.removeItem('xfs-auto-sweep');
  setTimeout(() => { sweepHasRun = true; action(); }, 1500);
}
```

The path check prevents the flag from accidentally triggering on a different page. The 1500ms delay gives X.com time to complete its initial render before the action starts.

---

## X.com API Notes

- Block endpoint: `POST https://x.com/i/api/1.1/blocks/create.json`  
  Body: `screen_name=<handle>` (form-encoded)
- Required headers: `Authorization: Bearer <token>`, `x-csrf-token: <ct0 cookie>`, `x-twitter-active-user: yes`, `x-twitter-auth-type: OAuth2Session`
- CSRF token: read from `document.cookie` match on `ct0=`
- Live bearer token: captured by hooking `fetch` and `XHR.setRequestHeader` at `document-start`; fallback hardcoded bearer is a last resort

**Use `GM_xmlhttpRequest` for block calls**, not `fetch`. X.com's SPA intercepts native fetch responses and may trigger a page reload on certain status codes. `GM_xmlhttpRequest` runs outside X.com's fetch pipeline.

---

## Script Initialization Order

```
document-start
  └─ hookAuth()          ← intercept fetch/XHR for liveBearer + hook pushState for nav
DOMContentLoaded
  └─ startUI()
       ├─ check sessionStorage auto-sweep
       ├─ register handleNav in _navCallbacks
       ├─ attach MutationObserver (inline buttons + fallback)
       └─ setTimeout(injectBtn / injectMuteBtn, 1200)  ← initial load fallback
```

Auth and nav hooks must run at `document-start` to catch tokens from the first requests and to be in place before X.com's router fires. UI work is deferred to `DOMContentLoaded` because `document.body` may not exist at `document-start`.

---

## Grant Declarations

All required grants must be declared in the `@grant` block. Missing grants fail silently in some Tampermonkey versions.

Current grants:

```
// @grant  unsafeWindow          — access page's window for hooks
// @grant  GM_xmlhttpRequest     — block API calls outside X.com's fetch pipeline
// @grant  GM_getValue           — persistent keyword storage
// @grant  GM_setValue           — persistent keyword storage
```
