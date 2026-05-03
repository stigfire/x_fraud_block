// ==UserScript==
// @name         X Fraud Scanner (垃圾推号一扫空)
// @namespace    http://tampermonkey.net/
// @version      4.95
// @description  扫描推文回复中的欺诈用户（心形 Emoji / 夸克/UC链接 / 可疑关键词），一键批量屏蔽
// @author       Anthony
// @license MIT
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzEiIGZpbGw9IiNmNDIxMmUiLz48Y2lyY2xlIGN4PSIyNyIgY3k9IjI3IiByPSIxMSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQuNSIvPjxsaW5lIHgxPSIzNSIgeTE9IjM1IiB4Mj0iNDgiIHkyPSI0OCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGxpbmUgeDE9IjIxIiB5MT0iMjciIHgyPSIzMyIgeTI9IjI3IiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMy41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48bGluZSB4MT0iMjciIHkxPSIyMSIgeDI9IjI3IiB5Mj0iMzMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      x.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ── Detection rules ──────────────────────────────────────────────────
  const HEART_RE   = /[\u2764\u2665\u2763\u{1F493}\u{1F494}\u{1F495}\u{1F496}\u{1F497}\u{1F498}\u{1F499}\u{1F49A}\u{1F49B}\u{1F49C}\u{1F49D}\u{1F49E}\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}]/u;
  // Basic CJK block — used to distinguish Chinese-context tweets from English ones
  const CHINESE_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  const DEFAULT_SUSPECT_KWS      = ['线下', '真人', '主人', '附近的吗', 'dd', '搭子', '固炮', '蹲个', '在线找', '快来', 'big bro\'', 'big bro', 'big brother', 'little bro', '单男', '第一骚', '小m', '男大弟弟', 'pan.quark.cn', 'drive.uc.cn', 'pan.xunlei.com', '离得近的', '万达广场', '同城的哥哥', '⬆️', '🍓'];
  // Text keywords matched against display name (dynamic, can add/remove in panel)
  const DEFAULT_SUSPECT_NAME_KWS = ['同城', '单身', '刺激', '母狗', '巨乳', '女大', '男大', '真人', '互关fo', '🅱️', '真实', '互关', '全国', '🍑', '🍆', '💯', '费破', '👠', '骚', '熟女', '单男', '少妇', '线下', '🍓', '💊', '约炮', '痒', '固炮', '免费', '无偿'];
  // RegEx patterns matched against tweet body (stored as strings, compiled at match time)
  // Preset: @handle followed by blank lines then an upward arrow — classic spam referral pattern
  const DEFAULT_SUSPECT_RE_KWS   = [
    '^@\\w+\\n+[⬆↑⇑]',
    '👉\\s*@\\w',
    '(?=[\\s\\S]*比[\\s\\S]{0,8}她)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)[\\s\\S]{1,280}',
    '(?=[\\s\\S]*主页)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)(?=[\\s\\S]*(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}))[\\s\\S]{1,280}',
  ];
  // Keyword storage: only user additions/deletions are persisted.
  // Defaults are always merged in at startup, so new script-level presets
  // appear automatically even when the user has existing stored data.
  function _normKw(k) {
    return String(k).trim().toLowerCase();
  }
  function _cleanKwList(list) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const v = String(raw).trim();
      const norm = _normKw(v);
      if (!v || seen.has(norm)) continue;
      seen.add(norm);
      out.push(v);
    }
    return out;
  }
  function _sameList(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  function _loadKws(defaults, key) {
    const rawAdds = GM_getValue(key + '_add', []);
    const rawAddList = Array.isArray(rawAdds) ? rawAdds : [];
    const defNorms = new Set(defaults.map(_normKw));
    const adds = _cleanKwList(rawAddList).filter(k => !defNorms.has(_normKw(k)));
    if (!_sameList(rawAddList, adds)) GM_setValue(key + '_add', adds);
    const dels = new Set(GM_getValue(key + '_del', []));
    return [...new Set([...defaults, ...adds])].filter(k => !dels.has(k));
  }
  function _saveKwSet(live, defaults, key) {
    const cleanLive = _cleanKwList(live);
    const defNorms = new Set(defaults.map(_normKw));
    const liveNorms = new Set(cleanLive.map(_normKw));
    GM_setValue(key + '_add', cleanLive.filter(k => !defNorms.has(_normKw(k))));
    GM_setValue(key + '_del', defaults.filter(k => !liveNorms.has(_normKw(k))));
  }
  let SUSPECT_KWS      = _loadKws(DEFAULT_SUSPECT_KWS,      'suspect_kws');
  let SUSPECT_NAME_KWS = _loadKws(DEFAULT_SUSPECT_NAME_KWS, 'suspect_name_kws');
  let SUSPECT_RE_KWS   = _loadKws(DEFAULT_SUSPECT_RE_KWS,   'suspect_re_kws');
  function reloadKws() {
    SUSPECT_KWS      = _loadKws(DEFAULT_SUSPECT_KWS,      'suspect_kws');
    SUSPECT_NAME_KWS = _loadKws(DEFAULT_SUSPECT_NAME_KWS, 'suspect_name_kws');
    SUSPECT_RE_KWS   = _loadKws(DEFAULT_SUSPECT_RE_KWS,   'suspect_re_kws');
  }
  function saveKws() {
    _saveKwSet(SUSPECT_KWS,      DEFAULT_SUSPECT_KWS,      'suspect_kws');
    _saveKwSet(SUSPECT_NAME_KWS, DEFAULT_SUSPECT_NAME_KWS, 'suspect_name_kws');
    _saveKwSet(SUSPECT_RE_KWS,   DEFAULT_SUSPECT_RE_KWS,   'suspect_re_kws');
  }
  function _kwAdditions(live, defaults) {
    const defNorms = new Set(defaults.map(_normKw));
    return _cleanKwList(live).filter(k => !defNorms.has(_normKw(k)));
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return ok;
    }
  }
  async function exportKws() {
    const payload = {
      source: 'X Fraud Scanner custom keyword export',
      version: typeof GM_info !== 'undefined' && GM_info.script ? GM_info.script.version : '',
      exportedAt: new Date().toISOString(),
      note: 'Only manually added keywords are exported. Built-in preset keywords are not included.',
      contentKeywordAdditions: _kwAdditions(SUSPECT_KWS, DEFAULT_SUSPECT_KWS),
      nameKeywordAdditions: _kwAdditions(SUSPECT_NAME_KWS, DEFAULT_SUSPECT_NAME_KWS),
      regexKeywordAdditions: _kwAdditions(SUSPECT_RE_KWS, DEFAULT_SUSPECT_RE_KWS),
    };
    const text = JSON.stringify(payload, null, 2);
    const ok = await copyText(text);
    console.log('[XFS] custom keyword export:', payload);
    showToast(ok ? '自定义关键词 JSON 已复制' : '复制失败，已输出到 Console', !ok);
  }
  function _arrFromImport(obj, key, legacyKey, nestedKey) {
    if (Array.isArray(obj && obj[key])) return obj[key];
    if (obj && obj.customKeywords && Array.isArray(obj.customKeywords[nestedKey])) return obj.customKeywords[nestedKey];
    const part = obj && obj[legacyKey];
    if (Array.isArray(part)) return part;
    if (part && Array.isArray(part.additions)) return part.additions;
    if (part && Array.isArray(part.active)) return part.active;
    return [];
  }
  function _cleanImportList(list) {
    return [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
  }
  function parseKwImport(raw) {
    const obj = JSON.parse(raw);
    return {
      content: _cleanImportList(_arrFromImport(obj, 'contentKeywordAdditions', 'contentKeywords', 'content')),
      name: _cleanImportList(_arrFromImport(obj, 'nameKeywordAdditions', 'nameKeywords', 'name')),
      regex: _cleanImportList(_arrFromImport(obj, 'regexKeywordAdditions', 'regexKeywords', 'regex')),
    };
  }
  function _mergeKws(live, incoming) {
    return [...new Set([...live, ...incoming])];
  }
  function _replaceCustomKws(live, defaults, incoming) {
    const defSet = new Set(defaults);
    return [...new Set([...live.filter(k => defSet.has(k)), ...incoming])];
  }
  function importKws(mode) {
    const raw = window.prompt('粘贴自定义关键词 JSON');
    if (!raw) return;
    let parsed;
    try {
      parsed = parseKwImport(raw);
    } catch (e) {
      console.warn('[XFS] keyword import parse failed:', e);
      showToast('自定义关键词 JSON 解析失败', true);
      return;
    }
    const total = parsed.content.length + parsed.name.length + parsed.regex.length;
    if (total === 0) {
      showToast('未发现可导入的自定义关键词', true);
      return;
    }
    if (mode === 'replace' && !window.confirm('覆盖当前自定义关键词？系统预设关键词不会被导入文件覆盖。')) return;

    if (mode === 'replace') {
      SUSPECT_KWS = _replaceCustomKws(SUSPECT_KWS, DEFAULT_SUSPECT_KWS, parsed.content);
      SUSPECT_NAME_KWS = _replaceCustomKws(SUSPECT_NAME_KWS, DEFAULT_SUSPECT_NAME_KWS, parsed.name);
      SUSPECT_RE_KWS = _replaceCustomKws(SUSPECT_RE_KWS, DEFAULT_SUSPECT_RE_KWS, parsed.regex);
    } else {
      SUSPECT_KWS = _mergeKws(SUSPECT_KWS, parsed.content);
      SUSPECT_NAME_KWS = _mergeKws(SUSPECT_NAME_KWS, parsed.name);
      SUSPECT_RE_KWS = _mergeKws(SUSPECT_RE_KWS, parsed.regex);
    }
    saveKws();
    showToast(`已导入 ${total} 个自定义关键词`);
    if (document.getElementById('xfs-panel')) {
      const kwBar = document.getElementById('xfs-kw-bar');
      showPanel(scanPage(), { keywordsOpen: !kwBar || kwBar.style.display !== 'none' });
    }
  }

  // ── Config ───────────────────────────────────────────────────────────
  const CTX_LEN    = 20;
  const MAX_BLOCK  = 100;
  const BLOCK_DELAY  = 3000; // base inter-block gap (ms)
  const BLOCK_JITTER = 2000; // random extra added to base, making effective range 3-5s
  // Low-follower hiding is intentionally disabled for now. It produced more
  // false positives than profile-link based referral detection, but the old
  // threshold constant is kept here as a note for possible future scoring.
  // const DEFAULT_LOW_FOLLOWER_THRESHOLD = 5;
  const REFERRAL_CACHE_KEY = 'xfs-referral-account-cache-v2';
  const REFERRAL_CACHE_TTL = 48 * 60 * 60 * 1000;
  const REFERRAL_MIN_GAP = 1500;
  const REFERRAL_MAX_CACHE = 1200;
  const REFERRAL_X_LINK_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(?!home\b|i\b|intent\b|share\b|search\b|settings\b|privacy\b|tos\b|explore\b|notifications\b|messages\b|compose\b)[A-Za-z0-9_]{1,15}\b/i;
  const REFERRAL_X_LINK_GLOBAL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(?!home\b|i\b|intent\b|share\b|search\b|settings\b|privacy\b|tos\b|explore\b|notifications\b|messages\b|compose\b)[A-Za-z0-9_]{1,15}\b/ig;
  const DEFAULT_USER_LOOKUP_QUERY_ID = 'IGgvgiOx4QZndDHuD3x9TQ';
  const USER_LOOKUP_QUERY_ID_FALLBACKS = [
    DEFAULT_USER_LOOKUP_QUERY_ID,
    '-oaLodhGbbnzJBACb1kk2Q',
    '1VOOyvKkiI3FMmkeDNxM9A',
  ];
  const blockedHandles = new Set(); // tracks handles blocked this session
  let sweepHasRun = false;          // true after first sweep on current URL
  let hideMatchedActive = GM_getValue('hide_matched', true); // toggle: hide matched users' replies
  let hideReferralActive = GM_getValue('hide_referral_accounts', true); // toggle: hide replies from profile-link referral accounts
  let sweepInProgress = false;             // true during sweep/scan scroll ops — suppresses hide application
  let userLookupQueryId = GM_getValue('user_lookup_query_id', DEFAULT_USER_LOOKUP_QUERY_ID);
  let capturedApiHeaders = null;
  const matchedHandlesInView = new Set(); // accumulates matched handles this scroll session; reset on nav
  const matchedUsersCache = new Map();   // handle → full user object; survives DOM unload by React virtual list
  const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  function maybeCaptureUserLookupQueryId(url) {
    const m = String(url || '').match(/\/i\/api\/graphql\/([^/?]+)\/UserByScreenName\b/);
    if (!m || !m[1] || m[1] === userLookupQueryId) return;
    userLookupQueryId = m[1];
    GM_setValue('user_lookup_query_id', userLookupQueryId);
  }

  function normalizeHeaderObject(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof headers.forEach === 'function') {
      headers.forEach((value, key) => { out[String(key).toLowerCase()] = value; });
      return out;
    }
    if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => { out[String(key).toLowerCase()] = value; });
      return out;
    }
    Object.entries(headers).forEach(([key, value]) => {
      out[String(key).toLowerCase()] = value;
    });
    return out;
  }

  function captureApiHeaders(headers) {
    const h = normalizeHeaderObject(headers);
    const auth = h.authorization;
    if (!auth || !String(auth).startsWith('Bearer ')) return;
    liveBearer = String(auth).slice(7);
    capturedApiHeaders = h;
  }

  // ── Auth capture — intercept X.com's own requests for the live bearer token ──
  let liveBearer = null;
  let stopBackgroundLoad = false;
  const _navCallbacks = []; // fired by pushState/replaceState/popstate hooks

  (function hookAuth() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // Hook fetch
    try {
      const origFetch = win.fetch;
      win.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        try {
          const h = (init && init.headers) || (input && input.headers) || {};
          captureApiHeaders(h);
          const get = k => typeof h.get === 'function' ? h.get(k) : (h[k] || h[k.toLowerCase()]);
          const auth = get('Authorization') || get('authorization');
          if (auth && auth.startsWith('Bearer ') && auth.length > 30) {
            liveBearer = auth.slice(7);
          }
        } catch (_) {}
        const p = origFetch.apply(this, arguments);
        if (String(url).includes('/i/api/graphql/')) {
          maybeCaptureUserLookupQueryId(url);
          return p.then(resp => {
            captureReferralAccountsFromResponse(resp);
            return resp;
          });
        }
        return p;
      };
    } catch (e) { console.warn('[XFS] fetch hook failed', e); }

    // Hook XHR (X.com uses both)
    try {
      const origOpen = win.XMLHttpRequest.prototype.open;
      const origSet = win.XMLHttpRequest.prototype.setRequestHeader;
      const origSend = win.XMLHttpRequest.prototype.send;
      win.XMLHttpRequest.prototype.open = function (method, url) {
        this._xfsUrl = url;
        return origOpen.apply(this, arguments);
      };
      win.XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (!this._xfsHeaders) this._xfsHeaders = {};
        this._xfsHeaders[name] = value;
        if (name.toLowerCase() === 'authorization' && String(value).startsWith('Bearer ') && value.length > 30) {
          liveBearer = value.slice(7);
        }
        return origSet.apply(this, arguments);
      };
      win.XMLHttpRequest.prototype.send = function () {
        if (String(this._xfsUrl || '').includes('/i/api/graphql/')) {
          maybeCaptureUserLookupQueryId(this._xfsUrl);
          captureApiHeaders(this._xfsHeaders);
          this.addEventListener('load', function () {
            try { captureReferralAccountsFromText(this.responseText); } catch (_) {}
          });
        }
        return origSend.apply(this, arguments);
      };
    } catch (e) { console.warn('[XFS] XHR hook failed', e); }

    // Hook pushState / replaceState / popstate so startUI gets immediate
    // notification of SPA navigation without waiting for DOM mutations.
    // Same cross-realm pattern as the liveBearer hooks above.
    try {
      const fire = () => _navCallbacks.forEach(fn => { try { fn(); } catch (_) {} });
      ['pushState', 'replaceState'].forEach(method => {
        const orig = win.history[method];
        win.history[method] = function (...args) { orig.apply(this, args); fire(); };
      });
      win.addEventListener('popstate', fire);
    } catch (e) { console.warn('[XFS] nav hook failed', e); }
  })();

  // ── Utilities ────────────────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:148px;right:16px;background:${isError ? C.blockRed : C.mute};color:#fff;padding:5px 11px;border-radius:12px;font-size:12px;font-weight:600;z-index:2147483647;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, 2200);
  }

  // ── Mute selected word: copy to clipboard + open settings page ───────
  // X.com's internal muted-keywords API (/i/api/1.1/mutes/keywords/create.json)
  // returns 404 — endpoint removed. Reliable fallback: clipboard + navigation.
  // NOTE: selection is saved in _savedMuteSel on mousedown (before click clears it)
  let _savedMuteSel = '';

  async function muteSelectedWord() {
    const sel = _savedMuteSel || (window.getSelection() || document.getSelection())?.toString().trim() || '';
    _savedMuteSel = '';

    if (!sel) { showToast('请先在页面上选中一个词', true); return; }
    if (sel.length > 50) { showToast('选中文字太长（限 50 字符内）', true); return; }

    if (!window.confirm(`将 "${sel}" 加入静音关键词？\n\n点确认后将打开设置页，词已复制到剪贴板，直接粘贴添加即可。`)) return;

    try { await navigator.clipboard.writeText(sel); } catch (_) {}

    window.open('https://x.com/settings/muted_keywords', '_blank');

    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:148px;right:16px;background:${C.mute};color:#fff;padding:7px 13px;border-radius:12px;font-size:12px;font-weight:600;z-index:2147483647;box-shadow:0 2px 8px rgba(0,0,0,0.2);line-height:1.5;pointer-events:none;`;
    t.textContent = `"${sel}" 已复制 · 在设置页粘贴添加`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, 3500);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // X.com renders emoji as <img alt="♥"> (twemoji). textContent skips img elements,
  // so we must walk child nodes and include img.alt to capture emoji in display names.
  // Some Twemoji images have empty alt — fallback: reconstruct the character from the
  // src URL, whose filename is the Unicode code point in hex (e.g. "2665.svg" → ♥).
  function getTextWithEmoji(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeName === 'IMG') {
        if (node.alt) {
          text += node.alt;
        } else {
          const m = (node.src || '').match(/\/([0-9a-f]{4,6})(?:\.|-)/ );
          if (m) { try { text += String.fromCodePoint(parseInt(m[1], 16)); } catch (_) {} }
        }
      } else {
        text += getTextWithEmoji(node);
      }
    }
    return text;
  }

  function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return m ? m[1] : null;
  }

  function normalizeHandle(handle) {
    return String(handle || '').replace(/^@/, '').trim().toLowerCase();
  }

  function extractHandleFromArticle(art) {
    const nameEl = art.querySelector('[data-testid="User-Name"]');
    if (!nameEl) return null;
    for (const sp of nameEl.querySelectorAll('span')) {
      const t = sp.textContent.trim();
      if (t.startsWith('@') && t.length > 1 && !t.includes(' ')) return t.slice(1);
    }
    return null;
  }

  function loadReferralCache() {
    const raw = GM_getValue(REFERRAL_CACHE_KEY, {});
    const now = Date.now();
    const cache = new Map();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cache;
    Object.entries(raw).forEach(([handle, item]) => {
      const ts = Number(item && item.ts);
      if (Number.isFinite(ts) && now - ts < REFERRAL_CACHE_TTL) {
        cache.set(handle, {
          isReferral: !!(item && item.isReferral),
          urls: Array.isArray(item && item.urls) ? item.urls : [],
          ts,
        });
      }
    });
    return cache;
  }

  const referralCache = loadReferralCache();
  const referralPending = new Map();
  const referralQueue = [];
  let referralQueueActive = false;
  let referralLastRequest = 0;
  let referralWarned = false;

  function saveReferralCache() {
    const entries = [...referralCache.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, REFERRAL_MAX_CACHE);
    referralCache.clear();
    const out = {};
    entries.forEach(([handle, item]) => {
      referralCache.set(handle, item);
      out[handle] = item;
    });
    GM_setValue(REFERRAL_CACHE_KEY, out);
  }

  let referralSaveTimer = null;

  function rememberReferralAccount(handle, urls, opts = {}) {
    const key = normalizeHandle(handle);
    if (!key) return;
    const cleanUrls = [...new Set((Array.isArray(urls) ? urls : []).map(u => String(u || '').trim()).filter(Boolean))];
    if (cleanUrls.length === 0 && opts.allowNegative !== true) return;
    referralCache.set(key, { isReferral: cleanUrls.length > 0, urls: cleanUrls, ts: Date.now() });
    if (!referralSaveTimer) {
      referralSaveTimer = setTimeout(() => {
        referralSaveTimer = null;
        saveReferralCache();
      }, 1000);
    }
    applyReferralAccountToArticles(key);
  }

  function captureReferralAccountsFromResponse(resp) {
    try {
      const type = resp.headers && resp.headers.get && resp.headers.get('content-type');
      if (type && !type.includes('application/json')) return;
      resp.clone().json().then(captureReferralAccountsFromData).catch(() => {});
    } catch (_) {}
  }

  function captureReferralAccountsFromText(text) {
    if (!text || text.length < 20) return;
    try { captureReferralAccountsFromData(JSON.parse(text)); } catch (_) {}
  }

  function extractReferralXLinksFromText(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    REFERRAL_X_LINK_GLOBAL_RE.lastIndex = 0;
    return text.match(REFERRAL_X_LINK_GLOBAL_RE) || [];
  }

  function collectReferralXLinks(candidates) {
    const out = [];
    (Array.isArray(candidates) ? candidates : []).forEach(v => {
      out.push(...extractReferralXLinksFromText(v));
    });
    return [...new Set(out.map(v => String(v || '').trim()).filter(v => REFERRAL_X_LINK_RE.test(v)))];
  }

  function extractProfileXLinks(legacy) {
    const candidates = [];
    const pushUrl = u => {
      if (!u) return;
      candidates.push(u.url, u.expanded_url, u.display_url);
    };
    legacy?.entities?.description?.urls?.forEach(pushUrl);
    legacy?.entities?.url?.urls?.forEach(pushUrl);
    if (legacy?.url) candidates.push(legacy.url);
    if (legacy?.description) candidates.push(legacy.description);
    if (legacy?.location) candidates.push(legacy.location);
    return collectReferralXLinks(candidates);
  }

  function captureReferralAccountsFromData(data) {
    const stack = [data];
    const seen = new Set();
    let visited = 0;
    while (stack.length && visited < 20000) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
      seen.add(cur);
      visited++;

      const legacy = cur.legacy && typeof cur.legacy === 'object' ? cur.legacy : null;
      if (legacy && legacy.screen_name != null) {
        rememberReferralAccount(legacy.screen_name, extractProfileXLinks(legacy), { allowNegative: false });
      } else if (cur.screen_name != null) {
        rememberReferralAccount(cur.screen_name, extractProfileXLinks(cur), { allowNegative: false });
      }

      if (Array.isArray(cur)) {
        cur.forEach(v => { if (v && typeof v === 'object') stack.push(v); });
      } else {
        Object.values(cur).forEach(v => { if (v && typeof v === 'object') stack.push(v); });
      }
    }
  }

  function extractHandleFromProfileDom(scope) {
    const named = scope.querySelector?.('[data-testid="UserName"][data-x-screen-name]');
    const dataHandle = named?.getAttribute('data-x-screen-name');
    if (dataHandle) return dataHandle;

    const avatar = scope.querySelector?.('[data-testid^="UserAvatar-Container-"]');
    const avatarId = avatar?.getAttribute('data-testid') || '';
    const avatarHandle = avatarId.match(/^UserAvatar-Container-([A-Za-z0-9_]{1,15})$/)?.[1];
    if (avatarHandle) return avatarHandle;

    const action = scope.querySelector?.('[aria-label*="@"]');
    const actionHandle = action?.getAttribute('aria-label')?.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1];
    if (actionHandle) return actionHandle;

    const pathHandle = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes|about)?)?$/)?.[1];
    return pathHandle || null;
  }

  function captureReferralAccountsFromProfileDom(root = document) {
    const headerItems = root.querySelectorAll?.('[data-testid="UserProfileHeader_Items"]') || [];
    headerItems.forEach(items => {
      const scope = items.closest('[role="dialog"]')
        || items.closest('[data-testid="primaryColumn"]')
        || items.closest('[data-testid="cellInnerDiv"]')
        || document;
      const handle = extractHandleFromProfileDom(scope);
      if (!handle) return;

      const candidates = [items.textContent];
      items.querySelectorAll('a,span').forEach(el => {
        candidates.push(
          el.textContent,
          el.getAttribute('href'),
          el.getAttribute('title'),
          el.getAttribute('aria-label')
        );
      });
      const links = collectReferralXLinks(candidates);
      if (links.length) rememberReferralAccount(handle, links, { allowNegative: false });
    });
  }

  function cachedReferralAccount(handle) {
    const key = normalizeHandle(handle);
    const item = referralCache.get(key);
    if (!item) return null;
    if (Date.now() - item.ts >= REFERRAL_CACHE_TTL) {
      referralCache.delete(key);
      saveReferralCache();
      return null;
    }
    return item;
  }

  function referralLookupQueryIds() {
    return [...new Set([userLookupQueryId, ...USER_LOOKUP_QUERY_ID_FALLBACKS].filter(Boolean))];
  }

  function referralRequestHeaders(csrf) {
    return {
      ...(capturedApiHeaders || {}),
      authorization: `Bearer ${liveBearer || BEARER}`,
      'x-csrf-token': csrf,
      'content-type': 'application/json',
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': capturedApiHeaders?.['x-twitter-auth-type'] || 'OAuth2Session',
    };
  }

  function requestReferralAccountWithQueryId(handle, queryId) {
    const csrf = getCsrf();
    if (!csrf) return Promise.reject(new Error('missing csrf'));
    const variables = {
      screen_name: handle,
      withGrokTranslatedBio: false,
    };
    const features = {
      hidden_profile_subscriptions_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    };
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
      fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: true, withPayments: false }),
    });
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://x.com/i/api/graphql/${encodeURIComponent(queryId)}/UserByScreenName?${params.toString()}`,
        headers: referralRequestHeaders(csrf),
        anonymous: false,
        onload(resp) {
          if (resp.status < 200 || resp.status >= 300) {
            reject(new Error(`HTTP ${resp.status}`));
            return;
          }
          try {
            const data = JSON.parse(resp.responseText || '{}');
            captureReferralAccountsFromData(data);
            const legacy = data?.data?.user?.result?.legacy;
            if (!legacy) throw new Error('missing user legacy');
            const urls = extractProfileXLinks(legacy);
            rememberReferralAccount(handle, urls, { allowNegative: true });
            resolve({ isReferral: urls.length > 0, urls });
          } catch (e) {
            reject(e);
          }
        },
        onerror() { reject(new Error('Network error')); },
      });
    });
  }

  async function requestReferralAccount(handle) {
    let lastError = null;
    for (const queryId of referralLookupQueryIds()) {
      try {
        const result = await requestReferralAccountWithQueryId(handle, queryId);
        if (queryId !== userLookupQueryId) {
          userLookupQueryId = queryId;
          GM_setValue('user_lookup_query_id', userLookupQueryId);
        }
        return result;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('referral lookup failed');
  }

  function fetchReferralAccount(handle) {
    const key = normalizeHandle(handle);
    if (!key) return Promise.reject(new Error('missing handle'));
    const cached = cachedReferralAccount(key);
    if (cached !== null) return Promise.resolve(cached);
    if (referralPending.has(key)) return referralPending.get(key);

    const promise = new Promise((resolve, reject) => {
      referralQueue.push({ handle, key, resolve, reject });
      processReferralQueue();
    });
    referralPending.set(key, promise);
    return promise;
  }

  async function processReferralQueue() {
    if (referralQueueActive || referralQueue.length === 0) return;
    referralQueueActive = true;
    const item = referralQueue.shift();
    const elapsed = Date.now() - referralLastRequest;
    if (elapsed < REFERRAL_MIN_GAP) await sleep(REFERRAL_MIN_GAP - elapsed);
    referralLastRequest = Date.now();
    try {
      const result = await requestReferralAccount(item.handle);
      item.resolve(result);
    } catch (e) {
      console.debug(`[XFS] referral lookup failed @${item.handle}:`, e);
      item.reject(e);
    } finally {
      referralPending.delete(item.key);
      referralQueueActive = false;
      setTimeout(processReferralQueue, 0);
    }
  }

  // Strip Unicode Format-category characters (zero-width spaces, soft hyphens, etc.)
  // that bad actors insert between characters to defeat keyword matching.
  function stripInvisible(s) {
    return s
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\p{Cf}/gu, '')
      .replace(/^[ \t]+$/mg, ''); // collapse whitespace-only lines so \n+ spans them
  }

  function asciiLetterCount(s) {
    return (String(s).match(/[a-z]/gi) || []).length;
  }

  function getContextSnippets(text, keywords, len) {
    const hits = [];
    // Normalize: remove invisible format characters before matching so that
    // interleaved zero-width chars (U+200B, U+200D, U+FEFF, etc.) don't defeat indexOf.
    const clean = stripInvisible(text);
    const lower = clean.toLowerCase();
    // Pre-check: does this tweet contain any Chinese characters?
    // Short ASCII-only keywords (e.g. 'dd') only make sense as fraud signals inside
    // Chinese-language tweets. Longer ASCII phrases are explicit enough to stand alone.
    const textHasChinese = CHINESE_RE.test(clean);

    for (const kw of keywords) {
      const idx = lower.indexOf(kw.toLowerCase());
      if (idx < 0) continue;
      const isAsciiOnlyKw = !CHINESE_RE.test(kw);
      const isShortAsciiKw = isAsciiOnlyKw && asciiLetterCount(kw) <= 5;
      // Skip short ASCII-only keyword matches when no Chinese characters appear anywhere
      // in the tweet text; longer phrases like "big bro" are explicit enough.
      if (isShortAsciiKw && !textHasChinese) continue;
      // Prevent partial matches for short ASCII keywords (e.g. 'dd' inside 'daddy').
      // Require that the characters immediately surrounding the match are NOT ASCII
      // word characters — Chinese characters and spaces naturally satisfy this.
      if (isShortAsciiKw) {
        const ASCII_WORD_CHAR = /[a-z0-9_]/;
        const before = idx > 0 ? lower[idx - 1] : '';
        const after  = idx + kw.length < lower.length ? lower[idx + kw.length] : '';
        if (ASCII_WORD_CHAR.test(before) || ASCII_WORD_CHAR.test(after)) continue;
      }
      const s = Math.max(0, idx - len);
      const e = Math.min(clean.length, idx + kw.length + len);
      hits.push({ kw, snippet: (s > 0 ? '\u2026' : '') + clean.slice(s, e) + (e < clean.length ? '\u2026' : '') });
    }
    return hits;
  }

  // Compile and run a regex pattern string against text.
  // Flags: m (^ matches line start), u (Unicode). Returns hit objects like getContextSnippets.
  function getRegexHits(text, patterns) {
    const hits = [];
    for (const pat of patterns) {
      let re;
      try { re = new RegExp(pat, 'mu'); } catch (_) { continue; }
      const m = re.exec(text);
      if (!m) continue;
      const idx = m.index;
      const s   = Math.max(0, idx - CTX_LEN);
      const e   = Math.min(text.length, idx + m[0].length + CTX_LEN);
      const raw = text.slice(s, e).replace(/\n/g, '↵');
      hits.push({ pat, snippet: (s > 0 ? '…' : '') + raw + (e < text.length ? '…' : '') });
    }
    return hits;
  }

  // ── Filter matcher (shared by scanPage and inline buttons) ───────────
  function matchesFilters(displayName, fullText) {
    displayName = stripInvisible(displayName);
    fullText    = stripInvisible(fullText);
    const heartHits  = [...new Set(displayName.match(HEART_RE) || [])];
    const nameKwHits = SUSPECT_NAME_KWS.filter(kw => stripInvisible(displayName).toLowerCase().includes(kw.toLowerCase()));
    const kwHits     = getContextSnippets(fullText, SUSPECT_KWS, CTX_LEN);
    const reHits     = getRegexHits(fullText, SUSPECT_RE_KWS);
    const cats = new Set();
    if (heartHits.length  > 0) cats.add('heart');
    if (nameKwHits.length > 0) cats.add('name_kw');
    if (kwHits.length     > 0) cats.add('suspect');
    if (reHits.length     > 0) cats.add('regex_kw');
    return { matched: cats.size > 0, cats, heartHits, nameKwHits, kwHits, reHits };
  }

  // ── Page scanner ─────────────────────────────────────────────────────
  function scanPage() {
    reloadKws();
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const userMap = new Map();

    articles.forEach((art, idx) => {
      if (idx === 0) return; // skip original tweet

      const nameEl = art.querySelector('[data-testid="User-Name"]');
      if (!nameEl) return;

      let handle = null;
      for (const sp of nameEl.querySelectorAll('span')) {
        const t = sp.textContent.trim();
        if (t.startsWith('@') && t.length > 1 && !t.includes(' ')) { handle = t.slice(1); break; }
      }
      if (!handle) return;

      // Extract display name robustly: read all text+emoji from the entire
      // User-Name element, then cut off at '@handle' and whatever follows.
      // This is layout-agnostic — no assumption about which <a> is first.
      let displayName = handle;
      const rawNameText = getTextWithEmoji(nameEl);
      const atIdx = rawNameText.indexOf('@' + handle);
      if (atIdx > 0) {
        displayName = rawNameText.slice(0, atIdx).trim() || handle;
      } else {
        // Fallback: first <a> that doesn't start with '@'
        const nameLink = [...nameEl.querySelectorAll('a')].find(a => {
          const t = getTextWithEmoji(a).trim();
          return t && !t.startsWith('@');
        });
        if (nameLink) displayName = getTextWithEmoji(nameLink).trim() || handle;
      }

      const textEl = art.querySelector('[data-testid="tweetText"]');
      const tweetText = textEl ? getTextWithEmoji(textEl) : '';

      // X.com strips URLs from tweet body when rendered as a card preview.
      // Quark/UC links are often shown as card previews (stripped from tweet body text).
      // Collect link text ONLY from tweetText and card — NOT the whole article,
      // which includes profile links whose handles could false-match short keywords like 'dd'.
      const cardEl  = art.querySelector('[data-testid="card.wrapper"]');
      const cardText = cardEl ? getTextWithEmoji(cardEl) : '';
      const bodyLinkText = [
        ...(textEl ? [...textEl.querySelectorAll('a[href]')] : []),
        ...(cardEl  ? [...cardEl.querySelectorAll('a[href]')]  : []),
      ].map(a => a.textContent).join(' ');
      const fullText = [tweetText, cardText, bodyLinkText].filter(Boolean).join(' ');

      const { matched, cats, heartHits, nameKwHits, kwHits, reHits } = matchesFilters(displayName, fullText);
      if (!matched) return;

      // First 10 words of tweet body — shown in panel for name/heart matches
      // to help users judge borderline cases without opening the tweet.
      const tweetWords = tweetText.trim().split(/\s+/).filter(Boolean);
      const tweetSnippet = tweetWords.length > 0
        ? tweetWords.slice(0, 10).join(' ') + (tweetWords.length > 10 ? '…' : '')
        : '';

      if (userMap.has(handle)) {
        const ex = userMap.get(handle);
        cats.forEach(c => ex.cats.add(c));
        heartHits.forEach(h  => { if (!ex.heartHits.includes(h))              ex.heartHits.push(h); });
        nameKwHits.forEach(h => { if (!ex.nameKwHits.includes(h))             ex.nameKwHits.push(h); });
        kwHits.forEach(h     => { if (!ex.kwHits.find(x => x.kw  === h.kw))  ex.kwHits.push(h); });
        reHits.forEach(h     => { if (!ex.reHits.find(x => x.pat === h.pat)) ex.reHits.push(h); });
        // keep tweetSnippet from first encounter
      } else {
        userMap.set(handle, { handle, displayName, cats, heartHits, nameKwHits, kwHits, reHits, tweetSnippet });
      }
    });

    return Array.from(userMap.values());
  }

  // ── Block API ─────────────────────────────────────────────────────────
  // GM_xmlhttpRequest keeps the call out of X.com's own fetch pipeline,
  // preventing any SPA-triggered page refresh on block success.
  function blockUser(handle, csrf) {
    const bearer = liveBearer || BEARER;
    console.log(`[XFS] blocking @${handle} | live=${!!liveBearer} | csrf=${csrf ? csrf.slice(0,8)+'…' : 'MISSING'}`);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://x.com/i/api/1.1/blocks/create.json',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'x-csrf-token': csrf,
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
        },
        data: `screen_name=${encodeURIComponent(handle)}`,
        anonymous: false,
        onload(resp) {
          if (resp.status >= 200 && resp.status < 300) {
            console.log(`[XFS] OK @${handle} =>`, resp.responseText.slice(0, 120));
            resolve();
          } else {
            console.error(`[XFS] FAILED @${handle} => HTTP ${resp.status}:`, resp.responseText.slice(0, 400));
            reject(new Error(`HTTP ${resp.status}`));
          }
        },
        onerror(e) {
          console.error(`[XFS] ERROR @${handle}:`, e);
          reject(new Error('Network error'));
        },
      });
    });
  }

  // ── Cross-tab coordinated block ──────────────────────────────────────
  // Uses navigator.locks (same-origin mutex across tabs) + localStorage timestamp
  // to guarantee the global inter-block gap is always >= BLOCK_DELAY, even when
  // multiple tabs are running block operations simultaneously.
  const LS_LAST_BLOCK = 'xfs-last-block';

  async function blockUserCoordinated(handle, csrf) {
    return navigator.locks.request('xfs-block-lock', async () => {
      // Jitter computed inside the lock: each block gets a fresh random gap.
      // localStorage timestamp reflects the actual gap used, so cross-tab
      // coordination sees the same effective rate regardless of which tab ran last.
      const gap     = BLOCK_DELAY + Math.floor(Math.random() * BLOCK_JITTER);
      const elapsed = Date.now() - parseInt(localStorage.getItem(LS_LAST_BLOCK) || '0', 10);
      if (elapsed < gap) await sleep(gap - elapsed);
      localStorage.setItem(LS_LAST_BLOCK, String(Date.now()));
      return blockUser(handle, csrf);
    });
  }

  // ── Unblock API ───────────────────────────────────────────────────────
  function unblockUser(handle, csrf) {
    const bearer = liveBearer || BEARER;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://x.com/i/api/1.1/blocks/destroy.json',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'x-csrf-token': csrf,
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
        },
        data: `screen_name=${encodeURIComponent(handle)}`,
        anonymous: false,
        onload(resp) {
          if (resp.status >= 200 && resp.status < 300) resolve();
          else reject(new Error(`HTTP ${resp.status}`));
        },
        onerror() { reject(new Error('Network error')); },
      });
    });
  }

  // ── Visual feedback: dim articles belonging to a blocked handle ──────
  function dimArticlesByHandle(handle) {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      const nameEl = art.querySelector('[data-testid="User-Name"]');
      if (!nameEl) return;
      let isMatch = false;
      for (const sp of nameEl.querySelectorAll('span')) {
        if (sp.textContent.trim() === '@' + handle) { isMatch = true; break; }
      }
      if (!isMatch) return;
      // Strikethrough on the display name anchor (not the @handle).
      // setProperty with 'important' is required — X.com sets text-decoration:none on <a> elements.
      for (const a of nameEl.querySelectorAll('a')) {
        const txt = getTextWithEmoji(a).trim();
        if (txt && !txt.startsWith('@')) {
          a.style.setProperty('text-decoration', 'line-through', 'important');
          break;
        }
      }
      // Fade the entire article
      art.style.transition = 'opacity 0.3s';
      art.style.setProperty('opacity', '0.4', 'important');
    });
  }

  function undimArticlesByHandle(handle) {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      const nameEl = art.querySelector('[data-testid="User-Name"]');
      if (!nameEl) return;
      let isMatch = false;
      for (const sp of nameEl.querySelectorAll('span')) {
        if (sp.textContent.trim() === '@' + handle) { isMatch = true; break; }
      }
      if (!isMatch) return;
      for (const a of nameEl.querySelectorAll('a')) {
        const txt = getTextWithEmoji(a).trim();
        if (txt && !txt.startsWith('@')) { a.style.removeProperty('text-decoration'); break; }
      }
      art.style.removeProperty('opacity');
      art.style.removeProperty('transition');
    });
  }

  // ── Panel UI ─────────────────────────────────────────────────────────
  // Light theme colors
  const C = {
    bg:        '#ffffff',
    border:    '#e1e8ed',
    text:      '#0f1419',
    sub:       '#536471',
    rowHover:  '#f7f9f9',
    catBg:     '#f7f9f9',
    heart:     '#e0245e',
    nameKw:    '#7b52ab',
    mute:      '#16a085',
    suspect:   '#b07d00',
    blockRed:  '#f4212e',
    btnBorder: '#cfd9de',
    regexKw:   '#0d7a8a',
    referral:  '#5f6f89',
  };

  const CAT_META = {
    heart:    { label: '心形 Emoji 用户名',  color: C.heart },
    name_kw:  { label: '用户名关键词',       color: C.nameKw },
    suspect:  { label: '可疑关键词',         color: C.suspect },
    regex_kw: { label: '正则匹配',           color: C.regexKw },
    liker:    { label: '列表用户',           color: C.mute },
    referral: { label: '导流号',             color: C.referral },
  };

  function showPanel(allUsers, opts = {}) {
    document.getElementById('xfs-panel')?.remove();

    const topUsers = allUsers.slice(0, MAX_BLOCK);
    const overflow = allUsers.length - topUsers.length;

    // ── Build ordered list first (needed for adaptive width) ──
    function getPrimaryCat(u) {
      if (u.cats.has('heart'))    return 'heart';
      if (u.cats.has('name_kw')) return 'name_kw';
      if (u.cats.has('referral')) return 'referral';
      if (u.cats.has('liker'))   return 'liker';
      if (u.cats.has('regex_kw')) return 'regex_kw';
      return 'suspect';
    }
    const ordered = [
      ...topUsers.filter(u => u.cats.has('heart')),
      ...topUsers.filter(u => !u.cats.has('heart') && u.cats.has('name_kw')),
      ...topUsers.filter(u => !u.cats.has('heart') && !u.cats.has('name_kw') && u.cats.has('referral')),
      ...topUsers.filter(u => !u.cats.has('heart') && !u.cats.has('name_kw') && !u.cats.has('referral')),
    ];

    // ── Adaptive column count & panel width ──
    // Estimate how many rows fit in one column based on viewport height.
    // ROW_H: conservative height covering both simple rows and suspect rows with context.
    const ROW_H = 42;
    const estBodyH = Math.max(200, window.innerHeight - 160); // 160 = top offset + hdr + kwBar + ftr
    const rowsPerCol = Math.max(6, Math.floor(estBodyH / ROW_H));
    const colsNeeded = ordered.length === 0 ? 1
      : Math.min(3, Math.ceil(ordered.length / rowsPerCol));
    const COL_W = 300;
    const panelW = colsNeeded * COL_W;

    // Panel — flush left edge, adaptive width, semi-transparent
    const panel = document.createElement('div');
    panel.id = 'xfs-panel';
    panel.style.cssText = [
      'position:fixed', 'left:0', 'top:53px',
      `width:${panelW}px`, 'height:calc(100vh - 53px)',
      'background:rgba(255,255,255,0.93)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      `border-right:1px solid ${C.border}`,
      'border-radius:0 10px 10px 0',
      'box-shadow:4px 0 24px rgba(0,0,0,0.14)',
      'display:flex', 'flex-direction:column', 'overflow:hidden',
      `font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`,
      `font-size:12px`, `color:${C.text}`,
      'z-index:2147483646',
    ].join(';');

    // ── Header ──
    const hdr = document.createElement('div');
    hdr.style.cssText = `padding:6px 12px;border-bottom:1px solid ${C.border};display:flex;align-items:center;gap:8px;flex-shrink:0;`;

    const title = document.createElement('span');
    title.textContent = 'Fraud Scanner';
    title.style.cssText = 'font-size:13px;font-weight:700;flex:1;';

    const badge = document.createElement('span');
    badge.textContent = overflow > 0 ? `${topUsers.length}/${allUsers.length}，还有 ${overflow} 个` : `${topUsers.length} 个`;
    badge.style.cssText = `font-size:11px;color:${overflow > 0 ? C.blockRed : C.sub};`;

    const authDot = document.createElement('span');
    authDot.title = liveBearer ? 'Auth token captured from page' : 'Using fallback token';
    authDot.textContent = liveBearer ? 'auth ok' : 'auth?';
    authDot.style.cssText = `font-size:10px;padding:1px 5px;border-radius:8px;background:${liveBearer ? '#d4edda' : '#fff3cd'};color:${liveBearer ? '#155724' : '#856404'};`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:16px;color:${C.sub};padding:0 2px;line-height:1;`;
    closeBtn.onclick = () => panel.remove();

    hdr.appendChild(title);
    hdr.appendChild(badge);
    hdr.appendChild(authDot);
    hdr.appendChild(closeBtn);

    // ── Keyword management bar ──
    const kwBar = document.createElement('div');
    kwBar.id = 'xfs-kw-bar';
    kwBar.style.cssText = `padding:4px 8px;border-bottom:1px solid ${C.border};display:flex;flex-direction:column;gap:4px;flex-shrink:0;background:${C.catBg};`;

    function renderKwBar() {
      kwBar.innerHTML = '';
      const rowCss = 'display:flex;flex-wrap:wrap;gap:3px;align-items:center;';
      const refreshKwPanel = () => showPanel(scanPage(), { keywordsOpen: true });
      const toolsRow = document.createElement('div');
      toolsRow.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:5px;min-height:22px;';
      const exportBtn = document.createElement('button');
      exportBtn.textContent = '导出自定义';
      exportBtn.title = '只复制手动添加的自定义关键词 JSON，不包含系统预设';
      exportBtn.style.cssText = `background:#fff;color:${C.text};border:1px solid ${C.btnBorder};border-radius:8px;padding:2px 8px;font-size:11px;line-height:16px;font-weight:600;cursor:pointer;`;
      exportBtn.onclick = exportKws;
      const mergeBtn = document.createElement('button');
      mergeBtn.textContent = '合并导入';
      mergeBtn.title = '导入自定义关键词 JSON，并与当前自定义规则合并';
      mergeBtn.style.cssText = exportBtn.style.cssText;
      mergeBtn.onclick = () => importKws('merge');
      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = '覆盖导入';
      replaceBtn.title = '用导入 JSON 覆盖当前自定义规则，系统预设不受影响';
      replaceBtn.style.cssText = exportBtn.style.cssText;
      replaceBtn.onclick = () => importKws('replace');
      toolsRow.appendChild(exportBtn);
      toolsRow.appendChild(mergeBtn);
      toolsRow.appendChild(replaceBtn);
      kwBar.appendChild(toolsRow);

      const referralRow = document.createElement('div');
      referralRow.style.cssText = rowCss;
      const referralLbl = document.createElement('span');
      referralLbl.textContent = '导流:';
      referralLbl.style.cssText = `font-size:10px;color:${C.referral};flex-shrink:0;min-width:36px;`;
      referralRow.appendChild(referralLbl);
      const referralToggle = document.createElement('input');
      referralToggle.type = 'checkbox';
      referralToggle.checked = hideReferralActive;
      referralToggle.title = '隐藏主页简介/网址中含 x.com 导流链接的账号';
      referralToggle.style.cssText = 'margin:0 2px 0 0;';
      referralToggle.onchange = () => {
        hideReferralActive = referralToggle.checked;
        GM_setValue('hide_referral_accounts', hideReferralActive);
        updateReferralBtn();
        if (hideReferralActive) applyReferralForVisible();
        applyHideAll();
      };
      referralRow.appendChild(referralToggle);
      const referralText = document.createElement('span');
      referralText.textContent = '隐藏 profile 含 x.com 链接的账号';
      referralText.style.cssText = `font-size:10px;color:${C.text};`;
      referralRow.appendChild(referralText);
      kwBar.appendChild(referralRow);

      // ── Row 1: Content keywords ──
      const textRow = document.createElement('div');
      textRow.style.cssText = rowCss;
      const textLbl = document.createElement('span');
      textLbl.textContent = '内容:';
      textLbl.style.cssText = `font-size:10px;color:${C.sub};flex-shrink:0;min-width:36px;`;
      textRow.appendChild(textLbl);
      SUSPECT_KWS.forEach((kw, i) => {
        const chip = document.createElement('span');
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#fff;border:1px solid ${C.btnBorder};border-radius:10px;font-size:10px;color:${C.text};`;
        chip.textContent = kw + ' ';
        const del = document.createElement('button');
        del.textContent = '×';
        del.style.cssText = `background:none;border:none;cursor:pointer;font-size:11px;color:${C.sub};padding:0;line-height:1;`;
        del.onclick = () => { SUSPECT_KWS.splice(i, 1); saveKws(); refreshKwPanel(); };
        chip.appendChild(del);
        textRow.appendChild(chip);
      });
      const inp = document.createElement('input');
      inp.placeholder = '+ 内容';
      inp.style.cssText = `border:1px solid ${C.btnBorder};border-radius:10px;padding:1px 6px;font-size:10px;width:55px;outline:none;`;
      const addKw = () => {
        const v = inp.value.trim();
        if (v && !SUSPECT_KWS.includes(v)) { SUSPECT_KWS.push(v); saveKws(); refreshKwPanel(); }
        else inp.value = '';
      };
      inp.onkeydown = e => { if (e.key === 'Enter') addKw(); };
      textRow.appendChild(inp);
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.style.cssText = `background:${C.blockRed};color:#fff;border:none;border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;`;
      addBtn.onclick = addKw;
      textRow.appendChild(addBtn);
      // ── Row 2: Name keywords ──
      const nameRow = document.createElement('div');
      nameRow.style.cssText = rowCss;
      const nameLbl = document.createElement('span');
      nameLbl.textContent = '用户名:';
      nameLbl.style.cssText = `font-size:10px;color:${C.nameKw};flex-shrink:0;min-width:36px;`;
      nameRow.appendChild(nameLbl);
      SUSPECT_NAME_KWS.forEach((kw, i) => {
        const chip = document.createElement('span');
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#fff;border:1px solid ${C.nameKw};border-radius:10px;font-size:10px;color:${C.nameKw};`;
        chip.textContent = kw + ' ';
        const del = document.createElement('button');
        del.textContent = '×';
        del.style.cssText = `background:none;border:none;cursor:pointer;font-size:11px;color:${C.nameKw};padding:0;line-height:1;`;
        del.onclick = () => { SUSPECT_NAME_KWS.splice(i, 1); saveKws(); refreshKwPanel(); };
        chip.appendChild(del);
        nameRow.appendChild(chip);
      });
      const nInp = document.createElement('input');
      nInp.placeholder = '+ 用户名';
      nInp.style.cssText = `border:1px solid ${C.nameKw};border-radius:10px;padding:1px 6px;font-size:10px;width:55px;outline:none;`;
      const addNKw = () => {
        const v = nInp.value.trim();
        if (v && !SUSPECT_NAME_KWS.includes(v)) { SUSPECT_NAME_KWS.push(v); saveKws(); refreshKwPanel(); }
        else nInp.value = '';
      };
      nInp.onkeydown = e => { if (e.key === 'Enter') addNKw(); };
      nameRow.appendChild(nInp);
      const addNBtn = document.createElement('button');
      addNBtn.textContent = '+';
      addNBtn.style.cssText = `background:${C.nameKw};color:#fff;border:none;border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;`;
      addNBtn.onclick = addNKw;
      nameRow.appendChild(addNBtn);
      kwBar.appendChild(nameRow);
      kwBar.appendChild(textRow);

      // ── Row 3: RegEx patterns ──
      const reRow = document.createElement('div');
      reRow.style.cssText = rowCss;
      const reLbl = document.createElement('span');
      reLbl.textContent = '正则:';
      reLbl.style.cssText = `font-size:10px;color:${C.regexKw};flex-shrink:0;min-width:36px;`;
      reRow.appendChild(reLbl);
      SUSPECT_RE_KWS.forEach((pat, i) => {
        const chip = document.createElement('span');
        chip.title = pat;
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#fff;border:1px solid ${C.regexKw};border-radius:10px;font-size:10px;color:${C.regexKw};max-width:160px;`;
        const lbl = document.createElement('span');
        lbl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        lbl.textContent = pat;
        const del = document.createElement('button');
        del.textContent = '×';
        del.style.cssText = `background:none;border:none;cursor:pointer;font-size:11px;color:${C.regexKw};padding:0;line-height:1;flex-shrink:0;`;
        del.onclick = () => { SUSPECT_RE_KWS.splice(i, 1); saveKws(); refreshKwPanel(); };
        chip.appendChild(lbl);
        chip.appendChild(del);
        reRow.appendChild(chip);
      });
      const reInp = document.createElement('input');
      reInp.placeholder = '+ 正则';
      reInp.title = '输入 JS 正则表达式（不含 / 分隔符），flags: mu 自动加入';
      reInp.style.cssText = `border:1px solid ${C.regexKw};border-radius:10px;padding:1px 6px;font-size:10px;width:64px;outline:none;`;
      const addRe = () => {
        const v = reInp.value.trim();
        if (!v) return;
        try { new RegExp(v, 'mu'); } catch (_) { reInp.style.borderColor = C.blockRed; return; }
        reInp.style.borderColor = C.regexKw;
        if (!SUSPECT_RE_KWS.includes(v)) { SUSPECT_RE_KWS.push(v); saveKws(); refreshKwPanel(); }
        else reInp.value = '';
      };
      reInp.onkeydown = e => { if (e.key === 'Enter') addRe(); };
      reInp.oninput   = () => {
        const v = reInp.value.trim();
        if (!v) { reInp.style.borderColor = C.regexKw; return; }
        try { new RegExp(v, 'mu'); reInp.style.borderColor = C.regexKw; }
        catch (_) { reInp.style.borderColor = C.blockRed; }
      };
      reRow.appendChild(reInp);
      const addReBtn = document.createElement('button');
      addReBtn.textContent = '+';
      addReBtn.style.cssText = `background:${C.regexKw};color:#fff;border:none;border-radius:10px;padding:1px 7px;font-size:11px;cursor:pointer;`;
      addReBtn.onclick = addRe;
      reRow.appendChild(addReBtn);
      kwBar.appendChild(reRow);
    }
    renderKwBar();
    kwBar.style.display = opts.keywordsOpen ? '' : 'none'; // collapsed by default

    // Toggle button — inserted into hdr before the × close button
    const kwToggle = document.createElement('button');
    kwToggle.textContent = opts.keywordsOpen ? '关键词 ▴' : '关键词 ▾';
    kwToggle.style.cssText = `background:none;border:1px solid ${C.btnBorder};border-radius:8px;cursor:pointer;font-size:10px;color:${C.sub};padding:1px 6px;white-space:nowrap;`;
    kwToggle.onclick = () => {
      const nowHidden = kwBar.style.display === 'none';
      kwBar.style.display = nowHidden ? '' : 'none';
      kwToggle.textContent = nowHidden ? '关键词 ▴' : '关键词 ▾';
    };
    hdr.insertBefore(kwToggle, closeBtn);

    // ── Body: CSS multi-column, fills left→right ──
    // Wrapper needed so column-fill:auto sees a fixed height
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;';

    const colContainer = document.createElement('div');
    colContainer.style.cssText = [
      // height set via rAF after DOM insertion — required for column-fill:auto
      `column-count:${colsNeeded}`,
      'column-fill:auto',
      `column-rule:1px solid ${C.border}`,
      'column-gap:0',
    ].join(';');

    const allCheckboxes = []; // { cb, handle, row }

    if (ordered.length === 0) {
      colContainer.style.columnCount = 'auto';
      const empty = document.createElement('div');
      empty.textContent = '未发现符合条件的用户';
      empty.style.cssText = `padding:32px;color:${C.sub};`;
      colContainer.appendChild(empty);
    } else {
      ordered.forEach(user => {
        const cat = getPrimaryCat(user);
        const color = CAT_META[cat].color;

        // Wrapper div with break-inside:avoid so a row is never split across columns
        const wrap = document.createElement('div');
        wrap.style.cssText = 'break-inside:avoid;page-break-inside:avoid;';

        const row = document.createElement('label');
        row.style.cssText = `display:flex;align-items:flex-start;gap:5px;padding:2px 6px 2px 5px;cursor:pointer;border-bottom:1px solid ${C.border};border-left:3px solid ${color};line-height:1.25;`;
        row.onmouseenter = () => { if (!row.dataset.blocked) row.style.background = C.rowHover; };
        row.onmouseleave = () => { if (!row.dataset.blocked) row.style.background = ''; };

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = opts.precheck !== false;
        cb.style.cssText = 'width:12px;height:12px;margin-top:2px;flex-shrink:0;cursor:pointer;accent-color:#f4212e;';
        allCheckboxes.push({ cb, handle: user.handle, row });

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        let html = `<div class="xfs-name" style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(user.displayName)}</div>`;
        html += `<div style="color:${C.sub};font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${esc(user.handle)}</div>`;
        if (user.cats.has('heart') && user.heartHits && user.heartHits.length > 0) {
          html += `<div style="font-size:10px;color:${C.heart};">[心形] ${esc(user.heartHits.join(''))} 在用户名中</div>`;
        }
        if (user.cats.has('name_kw') && user.nameKwHits && user.nameKwHits.length > 0) {
          user.nameKwHits.forEach(kw => {
            html += `<div style="font-size:10px;color:${C.nameKw};">[用户名] ${esc(kw)}</div>`;
          });
        }
        // For name/heart matches show first 10 words of the tweet so users can
        // quickly judge borderline cases without opening the tweet.
        if ((user.cats.has('heart') || user.cats.has('name_kw')) && user.tweetSnippet) {
          html += `<div style="font-size:10px;color:${C.sub};font-style:italic;word-break:break-all;">"${esc(user.tweetSnippet)}"</div>`;
        }
        if (user.cats.has('suspect') && user.kwHits.length > 0) {
          user.kwHits.forEach(h => {
            html += `<div style="font-size:10px;color:${C.suspect};word-break:break-all;">[${esc(h.kw)}] ${esc(h.snippet)}</div>`;
          });
        }
        if (user.cats.has('regex_kw') && user.reHits && user.reHits.length > 0) {
          user.reHits.forEach(h => {
            const label = h.pat.length > 18 ? h.pat.slice(0, 18) + '…' : h.pat;
            html += `<div style="font-size:10px;color:${C.regexKw};word-break:break-all;" title="${esc(h.pat)}">[re: ${esc(label)}] ${esc(h.snippet)}</div>`;
          });
        }
        info.innerHTML = html;

        row.appendChild(cb);
        row.appendChild(info);
        wrap.appendChild(row);
        colContainer.appendChild(wrap);
      });
    }

    body.appendChild(colContainer);

    // ── Hint bar (revealed after blocking completes) ──
    const hint = document.createElement('div');
    hint.style.cssText = `padding:5px 12px;border-top:1px solid ${C.border};font-size:11px;color:${C.sub};text-align:center;flex-shrink:0;display:none;background:${C.catBg};`;
    hint.textContent = '屏蔽已成功 · 请手动刷新页面以更新显示';

    // ── Footer ──
    const ftr = document.createElement('div');
    ftr.style.cssText = `padding:6px 12px;border-top:1px solid ${C.border};display:flex;gap:6px;align-items:center;flex-shrink:0;`;

    function mkBtn(text, isPrimary) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = isPrimary
        ? `flex:1;background:${C.blockRed};color:#fff;border:none;border-radius:14px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;`
        : `background:#fff;color:${C.text};border:1px solid ${C.btnBorder};border-radius:14px;padding:5px 10px;font-size:12px;cursor:pointer;`;
      return b;
    }

    const deselBtn = mkBtn('取消全选', false);
    deselBtn.onclick = () => allCheckboxes.forEach(({ cb }) => { cb.checked = false; });

    const selBtn = mkBtn('全选', false);
    selBtn.onclick = () => allCheckboxes.forEach(({ cb }) => { cb.checked = true; });

    const checkedCount = () => allCheckboxes.filter(({ cb }) => cb.checked).length;
    const blockBtn = mkBtn(`屏蔽 (${checkedCount()})`, true);

    allCheckboxes.forEach(({ cb }) => {
      cb.addEventListener('change', () => { blockBtn.textContent = `屏蔽 (${checkedCount()})`; });
    });

    async function startBlocking() {
      if (blockBtn.disabled) return;
      const uniqueHandles = [...new Set(allCheckboxes.filter(({ cb }) => cb.checked).map(({ handle }) => handle))];
      try {
        if (uniqueHandles.length === 0) return;

        const csrf = getCsrf();
        if (!csrf) { alert('未找到登录凭证（ct0 cookie），请确认已登录 X/Twitter'); return; }

        stopBackgroundLoad = true;  // stop background scroll so page stays put
        blockBtn.disabled = true;
        deselBtn.disabled = true;
        selBtn.disabled = true;

        const rowMap = new Map();
        allCheckboxes.forEach(({ handle, row }) => {
          if (!rowMap.has(handle)) rowMap.set(handle, []);
          rowMap.get(handle).push(row);
        });

        let done = 0, failed = 0;
        for (const handle of uniqueHandles) {
          blockBtn.textContent = `⏳ ${done + 1}/${uniqueHandles.length}`;
          try {
            await blockUserCoordinated(handle, csrf);
            done++;
            blockedHandles.add(handle);
            dimArticlesByHandle(handle);
            document.querySelectorAll(`button[data-xfs-handle="${CSS.escape(handle)}"]`).forEach(b => {
              const bMatched = b.dataset.xfsMatched === '1';
              b.dataset.xfsState = 'blocked';
              b.textContent      = IBTN_CHECK_SVG;
              b.style.border     = `1.5px solid ${C.mute}`;
              b.style.color      = C.mute;
              b.style.boxShadow  = '';
              b.style.background = `${C.mute}18`;
              b.style.opacity    = '1';
              b.title            = (bMatched ? '[匹配过滤] ' : '') + `已屏蔽 · 点击取消 @${handle}`;
            });
            (rowMap.get(handle) || []).forEach(row => {
              row.dataset.blocked = '1';
              row.style.opacity = '0.3';
              const nameEl = row.querySelector('.xfs-name');
              if (nameEl) nameEl.style.textDecoration = 'line-through';
            });
          } catch (e) {
            failed++;
            console.warn(`[XFS] block @${handle} failed:`, e);
          }
          blockBtn.textContent = `${done}/${uniqueHandles.length}${failed ? ` (${failed}失败)` : ''}`;
        }

        blockBtn.textContent = `完成 ${done}${failed ? `，${failed} 失败` : ''}`;
        hint.style.display = '';
      } finally {
        opts.onBlockDone?.();
      }
    }

    blockBtn.onclick = startBlocking;

    ftr.appendChild(deselBtn);
    ftr.appendChild(selBtn);
    ftr.appendChild(blockBtn);

    const rateNote = document.createElement('div');
    rateNote.style.cssText = `padding:3px 12px 5px;font-size:10px;color:${C.sub};text-align:center;flex-shrink:0;opacity:0.6;background:${C.catBg};`;
    rateNote.textContent = 'X.com 限制：每次屏蔽间隔 3-5 秒 · 建议单次会话不超过约 500 个，过多会触发强制登出';

    const scriptFtr = document.createElement('div');
    scriptFtr.style.cssText = `padding:2px 12px 4px;font-size:9px;color:${C.sub};text-align:center;flex-shrink:0;opacity:0.5;background:${C.catBg};`;
    const verSpan = document.createTextNode(`v${GM_info.script.version} · `);
    const gfLink = document.createElement('a');
    gfLink.textContent = 'GreasyFork';
    gfLink.href = 'https://greasyfork.org/en/scripts/573991-x-fraud-scanner-%E5%9E%83%E5%9C%BE%E6%8E%A8%E5%8F%B7%E4%B8%80%E6%89%AB%E7%A9%BA';
    gfLink.target = '_blank';
    gfLink.rel = 'noopener noreferrer';
    gfLink.style.cssText = `color:${C.sub};text-decoration:underline;`;
    scriptFtr.appendChild(verSpan);
    scriptFtr.appendChild(gfLink);

    panel.appendChild(hdr);
    panel.appendChild(kwBar);
    panel.appendChild(body);
    panel.appendChild(ftr);
    panel.appendChild(hint);
    panel.appendChild(rateNote);
    panel.appendChild(scriptFtr);
    document.body.appendChild(panel);

    // Escape key closes panel
    const closePanel = () => {
      panel.remove();
      document.removeEventListener('keydown', onEsc);
    };
    const onEsc = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', onEsc);
    closeBtn.onclick = closePanel;

    // Set colContainer to the measured pixel height so column-fill:auto works.
    // Must happen after panel is in DOM so clientHeight is non-zero.
    requestAnimationFrame(() => {
      colContainer.style.height = body.clientHeight + 'px';
      if (opts.autoBlock) setTimeout(startBlocking, 0);
    });
  }

  // ── Shared: wait for new tweet articles to appear ────────────────────
  // Tracks the last article DOM element, not count.
  // Virtual scroll removes old tweets from top while adding new ones at bottom,
  // so count stays flat — but the tail element reference changes on new content.
  function waitForMore(timeout) {
    const all = document.querySelectorAll('article[data-testid="tweet"]');
    const lastBefore = all[all.length - 1] || null;
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        const cur = document.querySelectorAll('article[data-testid="tweet"]');
        const newLast = cur[cur.length - 1] || null;
        if (newLast && newLast !== lastBefore) {
          obs.disconnect(); clearTimeout(t); resolve(true);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const t = setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
    });
  }

  // Wait until at least 2 tweet articles are present (original + ≥1 reply).
  // Used after auto-reload so sweepAll doesn't start on an empty or half-loaded page.
  function waitForTweetContent(timeout = 12000) {
    if (document.querySelectorAll('article[data-testid="tweet"]').length > 1) return Promise.resolve();
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        if (document.querySelectorAll('article[data-testid="tweet"]').length > 1) {
          obs.disconnect(); clearTimeout(t); resolve();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const t = setTimeout(() => { obs.disconnect(); resolve(); }, timeout);
    });
  }

  // ── Quick scan: show current DOM and immediately block checked users ──
  async function autoLoadAndScan() {
    stopBackgroundLoad = true;
    sweepInProgress = true;
    applyHideAll(); // unhide articles so layout is stable during scrolling
    const btn = document.getElementById('xfs-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
    showPanel(scanPage(), {
      autoBlock: true,
      onBlockDone: () => {
        sweepInProgress = false;
        applyHideAll(); // re-apply hide state now that layout is stable
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.title = '当前视图垃圾号自动屏蔽'; }
      },
    });
  }

  // ── Sweep all: race to bottom first, then scan back up ───────────────
  // Strategy: fraud accounts arrive late (piggybacking on trending posts) and
  // pile up at the bottom of the reply thread. Load everything to the bottom
  // first (Phase 1), then scan on the way back up (Phase 2).
  //
  // Phase 1 — load only, no scan: scroll down and wait for each batch of tweets
  //   to load from the network. Stop when no new content appears.
  // Phase 2 — scan upward: step back toward the top one viewport at a time,
  //   scanning the visible DOM at each position. X.com re-renders tweets from
  //   memory as we scroll back into their range, so no extra network requests.
  async function sweepAll() {
    stopBackgroundLoad = false;
    sweepInProgress = true;
    applyHideAll(); // unhide articles so layout is stable during scrolling
    const btn      = document.getElementById('xfs-btn');
    const sweepBtn = document.getElementById('xfs-sweep-btn');
    const MAX_DOWN = 60; // max scroll-down rounds to reach bottom
    const MAX_UP   = 80; // max viewport-steps scanning back to top

    document.getElementById('xfs-panel')?.remove();
    if (btn)      { btn.disabled = true; btn.style.opacity = '0.4'; }
    if (sweepBtn) { sweepBtn.disabled = true; sweepBtn.style.opacity = '0.4'; }

    const badge = document.createElement('div');
    badge.style.cssText = `position:fixed;bottom:220px;right:62px;font-size:10px;font-weight:700;font-family:monospace;color:#fff;border-radius:8px;padding:2px 6px;z-index:2147483647;pointer-events:none;`;
    document.body.appendChild(badge);

    const acc = new Map(); // handle → user, persists across rounds
    function mergeInto(users) {
      for (const u of users) {
        if (acc.has(u.handle)) {
          const ex = acc.get(u.handle);
          u.cats.forEach(c => ex.cats.add(c));
          u.heartHits.forEach(h  => { if (!ex.heartHits.includes(h))              ex.heartHits.push(h); });
          u.nameKwHits.forEach(h => { if (!ex.nameKwHits.includes(h))             ex.nameKwHits.push(h); });
          u.kwHits.forEach(h     => { if (!ex.kwHits.find(x => x.kw  === h.kw))  ex.kwHits.push(h); });
          u.reHits.forEach(h     => { if (!ex.reHits.find(x => x.pat === h.pat)) ex.reHits.push(h); });
        } else {
          acc.set(u.handle, { ...u, cats: new Set(u.cats) });
        }
      }
    }

    // ── Phase 1: race to the bottom ──────────────────────────────────────
    badge.style.background = C.nameKw;
    for (let i = 0; i < MAX_DOWN; i++) {
      if (stopBackgroundLoad) break;
      badge.textContent = `↓ 加载 ${i + 1}/${MAX_DOWN}…`;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      let gotMore = await waitForMore(3000);
      if (!gotMore) {
        // one retry for slow networks
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        gotMore = await waitForMore(3000);
      }
      if (!gotMore) break;
    }

    // ── Phase 2: scan on the way back up ─────────────────────────────────
    badge.style.background = C.blockRed;
    const STEP = window.innerHeight * 0.85;
    for (let i = 0; i < MAX_UP; i++) {
      if (stopBackgroundLoad) break;
      mergeInto(scanPage());
      badge.textContent = `↑ 扫描 ${i + 1} · 已找 ${acc.size} 个`;
      if (window.scrollY <= 0) break;
      window.scrollTo({ top: Math.max(0, window.scrollY - STEP), behavior: 'instant' });
      await sleep(600); // re-render only, no network load needed
    }

    badge.remove();
    sweepInProgress = false;
    applyHideAll(); // re-apply hide state now that layout is stable
    // Merge users found by the hide feature that React may have unloaded from the DOM
    mergeInto(Array.from(matchedUsersCache.values()));
    showPanel(Array.from(acc.values()));

    if (btn)      { btn.disabled = false; btn.style.opacity = ''; }
    if (sweepBtn) { sweepBtn.disabled = false; sweepBtn.style.opacity = ''; }
  }

  // ── Sweep user list: likes / retweets / followers pages ─────────────
  // Scrolls to the bottom collecting every UserCell handle, then shows
  // the panel for bulk blocking. Pure DOM — no private API calls needed,
  // so it survives X.com endpoint changes.
  async function sweepUserList() {
    stopBackgroundLoad = false;
    const listBtn = document.getElementById('xfs-list-btn');
    const MAX_DOWN = 60;

    document.getElementById('xfs-panel')?.remove();
    if (listBtn) { listBtn.disabled = true; listBtn.style.opacity = '0.4'; }

    const badge = document.createElement('div');
    badge.style.cssText = `position:fixed;bottom:160px;right:62px;font-size:10px;font-weight:700;font-family:monospace;color:#fff;border-radius:8px;padding:2px 6px;z-index:2147483647;pointer-events:none;background:${C.mute};`;
    document.body.appendChild(badge);

    const acc = new Map();

    function collectCells() {
      document.querySelectorAll('[data-testid="UserCell"]').forEach(cell => {
        // @handle span — X.com reliably renders these as visible span text
        let handle = null;
        for (const sp of cell.querySelectorAll('span')) {
          const t = sp.textContent.trim();
          if (t.startsWith('@') && /^@[A-Za-z0-9_]{1,15}$/.test(t)) {
            handle = t.slice(1); break;
          }
        }
        if (!handle || acc.has(handle)) return;

        // Display name: text content of any profile link to this handle
        let displayName = handle;
        for (const a of cell.querySelectorAll(`a[href="/${handle}"]`)) {
          const txt = getTextWithEmoji(a).trim();
          if (txt && !txt.startsWith('@')) { displayName = txt; break; }
        }

        acc.set(handle, {
          handle, displayName,
          cats: new Set(['liker']),
          heartHits: [], nameKwHits: [], kwHits: [],
        });
      });
    }

    for (let i = 0; i < MAX_DOWN; i++) {
      if (stopBackgroundLoad) break;
      collectCells();
      badge.textContent = `↓ 加载 ${i + 1}/${MAX_DOWN} · 已收集 ${acc.size} 人`;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const gotMore = await waitForMore(2500);
      if (!gotMore) break;
    }
    collectCells(); // final pass after last scroll

    badge.remove();
    showPanel(Array.from(acc.values()));
    if (listBtn) { listBtn.disabled = false; listBtn.style.opacity = ''; }
  }

  // ── Floating icon buttons ────────────────────────────────────────────
  // Magnifying glass with crosshair: "targeted scan"
  // User with minus: "block all from likes/retweets/followers list"
  const LIST_SVG      = '👤';  // bulk block from likes/retweets/followers list
  const SCAN_SVG      = '🔍';  // targeted scan current page
  const SWEEP_SVG     = '⚡';  // sweep all replies
  const MUTE_SVG      = '🔇';  // mute selected word
  const EYE_SVG       = '👁';  // hide toggle; active state is shown by color/border
  const GEAR_SVG      = '⚙';  // low-frequency tools: keyword import/export

  // ── Hide helpers ─────────────────────────────────────────────────────
  function applyHideToArticle(art) {
    const shouldHideMatched = hideMatchedActive && art.dataset.xfsHideMatched === '1';
    const shouldHideReferral = hideReferralActive && art.dataset.xfsReferralAccount === '1';
    const shouldHide = !sweepInProgress && (shouldHideMatched || shouldHideReferral);
    if (shouldHide && art.dataset.xfsHidden !== '1') {
      art.dataset.xfsHidden = '1';
      art.style.setProperty('max-height',    '2px',    'important');
      art.style.setProperty('min-height',    '0',      'important');
      art.style.setProperty('overflow',      'hidden', 'important');
      art.style.setProperty('padding',       '0',      'important');
      art.style.setProperty('margin-top',    '0',      'important');
      art.style.setProperty('margin-bottom', '0',      'important');
      art.style.setProperty('pointer-events','none',   'important');
      art.style.setProperty('border-bottom', `1px solid ${C.border}`, 'important');
    } else if (!shouldHide && art.dataset.xfsHidden === '1') {
      art.dataset.xfsHidden = '';
      ['max-height','min-height','overflow','padding','margin-top','margin-bottom','pointer-events','border-bottom']
        .forEach(p => art.style.removeProperty(p));
    }
  }

  function applyHideAll() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(applyHideToArticle);
  }

  /*
  // Disabled low-follower scoring. Kept for future risk scoring if needed.
  // function lowFollowerReason(handle) {
  //   const item = cachedReferralAccount(handle);
  //   const followers = item?.followers;
  //   return followers !== null && followers <= DEFAULT_LOW_FOLLOWER_THRESHOLD ? followers : null;
  // }
  */

  function referralReason(handle) {
    const item = cachedReferralAccount(handle);
    return item && item.isReferral ? item : null;
  }

  function buttonMatchedReason(btn) {
    if (btn.dataset.xfsMatched === '1') return 'matched';
    if (btn.dataset.xfsReferralAccount === '1') return 'referral';
    return '';
  }

  function updateInlineBlockButton(btn) {
    const isBlocked = btn.dataset.xfsState === 'blocked';
    const reason = buttonMatchedReason(btn);
    const isHot = reason !== '';
    const color = reason === 'referral' ? C.referral : C.blockRed;
    btn.style.border = `1.5px solid ${isBlocked ? C.mute : (isHot ? color : C.btnBorder)}`;
    btn.style.color = isBlocked ? C.mute : (isHot ? color : C.sub);
    btn.style.boxShadow = !isBlocked && isHot ? `0 0 0 2px ${color}40` : '';
    btn.style.background = isBlocked ? `${C.mute}18` : 'transparent';
    const prefix = reason === 'matched' ? '[匹配过滤] ' : (reason === 'referral' ? '[导流号] ' : '');
    const handle = btn.dataset.xfsHandle || '';
    btn.title = prefix + (isBlocked ? `已屏蔽 · 点击取消 @${handle}` : `屏蔽 @${handle}`);
  }

  function setReferralButtons(handle, item) {
    const key = normalizeHandle(handle);
    const isReferral = !!(item && item.isReferral);
    document.querySelectorAll(`button[data-xfs-handle]`).forEach(btn => {
      if (normalizeHandle(btn.dataset.xfsHandle) !== key) return;
      btn.dataset.xfsReferralAccount = isReferral ? '1' : '0';
      if (isReferral && item.urls?.length) btn.dataset.xfsReferralUrl = item.urls[0];
      updateInlineBlockButton(btn);
    });
  }

  function applyReferralAccountToArticles(handle) {
    const key = normalizeHandle(handle);
    const item = cachedReferralAccount(key);
    const isReferral = !!(item && item.isReferral);
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      if (art === firstArt) return;
      const artHandle = normalizeHandle(art.dataset.xfsReferralHandle || extractHandleFromArticle(art));
      if (artHandle !== key) return;
      art.dataset.xfsReferralHandle = artHandle;
      art.dataset.xfsReferralAccount = isReferral ? '1' : '0';
      if (isReferral && item.urls?.length) art.dataset.xfsReferralUrl = item.urls[0];
      applyHideToArticle(art);
    });
    setReferralButtons(key, item);
    updateReferralBadge();
  }

  function scheduleReferralCheck(art, handle, isOP = false) {
    if (!/\/status\/\d/.test(location.pathname) || isListPage()) return;
    const key = normalizeHandle(handle);
    if (!key || isOP) {
      art.dataset.xfsReferralAccount = '0';
      return;
    }
    art.dataset.xfsReferralHandle = key;

    const cached = cachedReferralAccount(key);
    if (cached !== null) {
      applyReferralAccountToArticles(key);
      return;
    }
    if (!hideReferralActive) return;

    fetchReferralAccount(handle)
      .then(() => applyReferralAccountToArticles(key))
      .catch(() => {
        if (!referralWarned && hideReferralActive) {
          referralWarned = true;
          showToast('导流号查询失败：X API 暂不可用或限流', true);
        }
      });
  }

  function applyReferralForVisible() {
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      if (art === firstArt) return;
      const handle = art.dataset.xfsReferralHandle || extractHandleFromArticle(art);
      if (!handle) return;
      scheduleReferralCheck(art, handle, false);
    });
    updateReferralBadge();
  }

  async function scanReferralAccountsInView() {
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    const handles = [];
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      if (art === firstArt) return;
      const handle = art.dataset.xfsReferralHandle || extractHandleFromArticle(art);
      const key = normalizeHandle(handle);
      if (key && !handles.includes(key)) handles.push(key);
    });
    if (handles.length === 0) {
      showToast('当前视图没有可扫描的回复用户', true);
      return;
    }
    showToast(`正在检查导流号 ${handles.length} 个`, false);
    for (const handle of handles) {
      try { await fetchReferralAccount(handle); } catch (_) {}
    }
    applyReferralForVisible();
    const users = handles
      .map(handle => {
        const item = cachedReferralAccount(handle);
        return item && item.isReferral ? {
          handle,
          displayName: handle,
          cats: new Set(['referral']),
          heartHits: [],
          nameKwHits: [],
          kwHits: [{ kw: '导流号', snippet: item.urls?.[0] || 'profile x.com link' }],
          reHits: [],
          tweetSnippet: item.urls?.[0] || '',
        } : null;
      })
      .filter(Boolean);
    if (users.length === 0) {
      showToast('当前视图未发现导流号', false);
      return;
    }
    showPanel(users);
  }

  function updateHideBadge() {
    const badge = document.getElementById('xfs-hide-badge');
    if (!badge) return;
    const n = matchedHandlesInView.size;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'flex' : 'none';
  }

  function updateReferralBadge() {
    const badge = document.getElementById('xfs-referral-badge');
    if (!badge) return;
    const n = document.querySelectorAll('article[data-testid="tweet"][data-xfs-referral-account="1"]').length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'flex' : 'none';
  }

  function mkIconBtn(id, svg, title, bottom, color, onclick) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = svg;
    b.title = title;
    b.style.cssText = [
      'position:fixed', `bottom:${bottom}px`, 'right:18px',
      'width:32px', 'height:32px', 'border-radius:50%',
      'background:rgba(255,255,255,0.92)',
      'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
      `border:2px solid ${color}`, `color:${color}`,
      'cursor:pointer', 'padding:0', 'box-sizing:border-box',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif',
      'font-size:15px', 'line-height:1',
      'z-index:2147483646',
      'box-shadow:0 2px 8px rgba(0,0,0,0.16)',
      'transition:transform 0.15s,box-shadow 0.15s',
    ].join(';');
    b.onmouseenter = () => { if (!b.disabled) { b.style.transform = 'scale(1.12)'; b.style.boxShadow = '0 3px 14px rgba(0,0,0,0.26)'; } };
    b.onmouseleave = () => { b.style.transform = ''; b.style.boxShadow = '0 2px 8px rgba(0,0,0,0.16)'; };
    b.onclick = onclick;
    return b;
  }

  function closeToolsPanel() {
    document.getElementById('xfs-tools-panel')?.remove();
  }

  function showCategoryHelp() {
    window.alert([
      '两类账号说明',
      '',
      '内容垃圾号：根据回复正文、用户名关键词、正则规则判断。适合处理重复话术、色情/诈骗引流回复。',
      '',
      '导流号：根据账号 profile 里的 x.com/twitter.com 导流链接判断。只检查已加载回复用户，受平台接口/限速影响，识别会稍有延迟。',
      '',
      '两类账号都可以隐藏；扫描按钮会打开确认面板，再手动屏蔽。',
    ].join('\n'));
  }

  function showToolsPanel() {
    closeToolsPanel();
    const p = document.createElement('div');
    p.id = 'xfs-tools-panel';
    p.style.cssText = [
      'position:fixed', 'right:58px', 'bottom:166px',
      'width:176px', 'padding:8px',
      'background:rgba(255,255,255,0.96)',
      'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
      `border:1px solid ${C.btnBorder}`,
      'border-radius:8px',
      'box-shadow:0 4px 18px rgba(0,0,0,0.18)',
      `font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`,
      `color:${C.text}`, 'font-size:12px',
      'display:flex', 'flex-direction:column', 'gap:6px',
      'z-index:2147483647',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '关键词工具';
    title.style.cssText = `font-size:12px;font-weight:700;color:${C.sub};padding:0 2px 2px;`;
    p.appendChild(title);

    function mkToolBtn(text, onclick) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = `background:#fff;color:${C.text};border:1px solid ${C.btnBorder};border-radius:8px;padding:6px 9px;font-size:12px;font-weight:600;text-align:left;cursor:pointer;`;
      b.onclick = () => { onclick(); };
      return b;
    }

    const editBtn = mkToolBtn('编辑关键词/正则', () => {
      closeToolsPanel();
      showPanel(scanPage(), { keywordsOpen: true });
    });
    editBtn.style.borderColor = C.regexKw;
    editBtn.style.color = C.regexKw;
    editBtn.style.background = '#f2fbfc';
    p.appendChild(editBtn);
    p.appendChild(mkToolBtn('两类账号说明', showCategoryHelp));
    p.appendChild(mkToolBtn('导出自定义词', exportKws));
    p.appendChild(mkToolBtn('合并导入自定义词', () => importKws('merge')));
    p.appendChild(mkToolBtn('覆盖自定义词', () => importKws('replace')));
    document.body.appendChild(p);

    setTimeout(() => {
      const onDown = e => {
        if (p.contains(e.target) || e.target?.id === 'xfs-gear-btn') return;
        closeToolsPanel();
        document.removeEventListener('mousedown', onDown, true);
      };
      document.addEventListener('mousedown', onDown, true);
    }, 0);
  }

  function injectGearBtn() {
    if (!document.body) return;
    if (document.getElementById('xfs-gear-btn')) return;
    const btn = mkIconBtn('xfs-gear-btn', GEAR_SVG, '自定义关键词/正则工具', 200, C.sub, e => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (document.getElementById('xfs-tools-panel')) closeToolsPanel();
      else showToolsPanel();
    });
    document.body.appendChild(btn);
  }

  function removeGearBtn() {
    document.getElementById('xfs-gear-btn')?.remove();
    closeToolsPanel();
  }

  // ── Inline block button icons ────────────────────────────────────────
  const IBTN_BLOCK_SVG = '⊘';  // circled slash — block
  const IBTN_CHECK_SVG = '✓';  // checkmark — already blocked

  // ── Inline block buttons ──────────────────────────────────────────────
  // Injects a small block icon next to every tweet's username.
  // Highlighted (red) = matches current filter rules. Dim (gray) = no match but still clickable.
  function injectInlineButtons() {
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    document.querySelectorAll('article[data-testid="tweet"]:not([data-xfs-ibtn])').forEach(art => {
      art.dataset.xfsIbtn = '1';

      const nameEl = art.querySelector('[data-testid="User-Name"]');
      if (!nameEl) return;

      let handle = null;
      for (const sp of nameEl.querySelectorAll('span')) {
        const t = sp.textContent.trim();
        if (t.startsWith('@') && t.length > 1 && !t.includes(' ')) { handle = t.slice(1); break; }
      }
      if (!handle) return;

      let displayName = handle;
      const rawNameText = getTextWithEmoji(nameEl);
      const atIdx = rawNameText.indexOf('@' + handle);
      if (atIdx > 0) displayName = rawNameText.slice(0, atIdx).trim() || handle;

      const textEl = art.querySelector('[data-testid="tweetText"]');
      const cardEl = art.querySelector('[data-testid="card.wrapper"]');
      const bodyLinkText = [
        ...(textEl ? [...textEl.querySelectorAll('a[href]')] : []),
        ...(cardEl  ? [...cardEl.querySelectorAll('a[href]')]  : []),
      ].map(a => a.textContent).join(' ');
      const fullText = [textEl ? getTextWithEmoji(textEl) : null, cardEl ? getTextWithEmoji(cardEl) : null, bodyLinkText].filter(Boolean).join(' ');

      const { matched, cats, heartHits, nameKwHits, kwHits, reHits } = matchesFilters(displayName, fullText);
      const isOP = art === firstArt;
      art.dataset.xfsHideMatched = (!isOP && matched) ? '1' : '0';
      scheduleReferralCheck(art, handle, isOP);
      if (!isOP && matched && /\/status\/\d/.test(location.pathname)) {
        matchedHandlesInView.add(handle);
        if (!matchedUsersCache.has(handle))
          matchedUsersCache.set(handle, { handle, displayName, cats, heartHits: [...heartHits], nameKwHits: [...nameKwHits], kwHits: [...kwHits], reHits: [...reHits], tweetSnippet: '' });
      }
      const alreadyBlocked = blockedHandles.has(handle);

      if (alreadyBlocked) {
        for (const a of nameEl.querySelectorAll('a')) {
          const txt = getTextWithEmoji(a).trim();
          if (txt && !txt.startsWith('@')) {
            a.style.setProperty('text-decoration', 'line-through', 'important');
            break;
          }
        }
        art.style.transition = 'opacity 0.3s';
        art.style.setProperty('opacity', '0.4', 'important');
      }

      const btn = document.createElement('button');
      btn.dataset.xfsHandle  = handle;
      btn.dataset.xfsState   = alreadyBlocked ? 'blocked' : 'unblocked';
      btn.dataset.xfsMatched = matched ? '1' : '0';
      const referral = referralReason(handle);
      btn.dataset.xfsReferralAccount = referral ? '1' : '0';
      if (referral?.urls?.length) btn.dataset.xfsReferralUrl = referral.urls[0];
      btn.textContent = alreadyBlocked ? IBTN_CHECK_SVG : IBTN_BLOCK_SVG;

      // Use explicit properties only — 'all:unset' resets display and causes invisible buttons.
      // These inline styles have higher specificity than any site stylesheet.
      Object.assign(btn.style, {
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          '18px',
        height:         '18px',
        borderRadius:   '50%',
        border:         `1.5px solid ${C.btnBorder}`,
        color:          C.sub,
        background:     alreadyBlocked ? `${C.mute}18` : 'transparent',
        cursor:         'pointer',
        padding:        '0',
        margin:         '0 4px',
        flexShrink:     '0',
        boxSizing:      'border-box',
        verticalAlign:  'middle',
        transition:     'background 0.12s,transform 0.1s',
        opacity:        '1',
        boxShadow:      '',
        lineHeight:     '1',
        fontFamily:     'inherit',
        fontSize:       '11px',
        outline:        'none',
        zIndex:         '10',
        position:       'relative',
      });
      updateInlineBlockButton(btn);

      btn.onmouseenter = () => {
        if (btn.disabled) return;
        const isBlocked = btn.dataset.xfsState === 'blocked';
        const reason = buttonMatchedReason(btn);
        const color = reason === 'referral' ? C.referral : C.blockRed;
        btn.style.background = isBlocked ? `${C.suspect}20` : (reason ? `${color}18` : `${C.sub}12`);
        btn.style.transform  = 'scale(1.18)';
      };
      btn.onmouseleave = () => {
        updateInlineBlockButton(btn);
        btn.style.transform  = '';
      };

      btn.onclick = async e => {
        e.preventDefault(); e.stopPropagation();
        if (btn.disabled) return;
        const csrf = getCsrf();
        if (!csrf) { showToast('未找到登录凭证（ct0 cookie）', true); return; }
        const isBlocked = btn.dataset.xfsState === 'blocked';
        btn.disabled = true; btn.style.opacity = '0.35';

        if (isBlocked) {
          try {
            await unblockUser(handle, csrf);
            blockedHandles.delete(handle);
            undimArticlesByHandle(handle);
            showToast(`@${handle} 已取消屏蔽`, false);
            document.querySelectorAll(`button[data-xfs-handle="${CSS.escape(handle)}"]`).forEach(b => {
              b.dataset.xfsState = 'unblocked';
              b.disabled         = false;
              b.textContent      = IBTN_BLOCK_SVG;
              b.style.opacity    = '1';
              updateInlineBlockButton(b);
            });
          } catch {
            btn.disabled = false; btn.style.opacity = '1';
            showToast(`取消屏蔽 @${handle} 失败`, true);
          }
        } else {
          try {
            await blockUserCoordinated(handle, csrf);
            blockedHandles.add(handle);
            dimArticlesByHandle(handle);
            showToast(`@${handle} 已屏蔽`, false);
            document.querySelectorAll(`button[data-xfs-handle="${CSS.escape(handle)}"]`).forEach(b => {
              b.dataset.xfsState = 'blocked';
              b.disabled         = false;
              b.textContent      = IBTN_CHECK_SVG;
              b.style.opacity    = '1';
              updateInlineBlockButton(b);
            });
          } catch {
            btn.disabled = false; btn.style.opacity = '1';
            showToast(`屏蔽 @${handle} 失败`, true);
          }
        }
      };

      // Inject just before the caret (three-dots) button — it sits in the same
      // tweet-header flex row as User-Name, whose parent does NOT have overflow:hidden.
      // Fallback: absolute-position inside the article.
      const caretEl = art.querySelector('[data-testid="caret"]');
      if (caretEl) {
        caretEl.insertAdjacentElement('beforebegin', btn);
      } else {
        art.style.position = 'relative';
        Object.assign(btn.style, { position: 'absolute', top: '8px', right: '40px' });
        art.appendChild(btn);
      }
      if (/\/status\/\d/.test(location.pathname)) applyHideToArticle(art);
    });
    if (/\/status\/\d/.test(location.pathname)) updateHideBadge();
  }

  // ── Status page buttons: scan + sweep (reply thread only) ───────────
  function isListPage(path) {
    const p = path || location.pathname;
    return /\/status\/\d+\/(likes|retweets|reposts)$/.test(p) || /\/followers$/.test(p);
  }

  // ── Button group backdrop ────────────────────────────────────────────
  // A pill-shaped panel behind the stacked buttons:
  // content hide, content scan/block, sweep, referral hide, referral scan/block, settings.
  // read as one unified plugin widget rather than separate circles.
  // Dimensions derived from button positions: gear(200), referral scan(240), referral hide(280), sweep(320), scan(360), hide(400).
  function injectBtnBackdrop() {
    if (!document.body) return;

    if (!document.getElementById('xfs-btn-backdrop')) {
      const bd = document.createElement('div');
      bd.id = 'xfs-btn-backdrop';
      bd.style.cssText = [
        'position:fixed', 'right:14px', 'bottom:196px',
        'width:40px', 'height:240px',
        'background:rgba(255,255,255,0.82)',
        'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        `border:1.5px solid ${C.btnBorder}`,
        'border-radius:20px',
        'box-shadow:0 2px 16px rgba(0,0,0,0.12)',
        'pointer-events:none',
        'z-index:2147483644',
      ].join(';');
      document.body.appendChild(bd);
    }

    [
      { id: 'content',  bottom: 316, height: 116, background: 'rgba(244,33,46,0.055)' },
      { id: 'referral', bottom: 236, height: 76,  background: 'rgba(95,111,137,0.075)' },
      { id: 'settings', bottom: 200, height: 32,  background: 'rgba(83,100,113,0.050)' },
    ].forEach((section) => {
      if (document.getElementById(`xfs-btn-section-${section.id}`)) return;
      const el = document.createElement('div');
      el.id = `xfs-btn-section-${section.id}`;
      el.style.cssText = [
        'position:fixed', 'right:16px', `bottom:${section.bottom}px`,
        'width:36px', `height:${section.height}px`,
        `background:${section.background}`,
        'border-radius:18px',
        'pointer-events:none',
        'z-index:2147483645',
      ].join(';');
      document.body.appendChild(el);
    });

    [302, 226].forEach((bottom, i) => {
      if (document.getElementById(`xfs-btn-sep-${i + 1}`)) return;
      const sep = document.createElement('div');
      sep.id = `xfs-btn-sep-${i + 1}`;
      sep.style.cssText = [
        'position:fixed', 'right:20px', `bottom:${bottom}px`,
        'width:28px', 'height:2px',
        `background:${C.btnBorder}`,
        'opacity:0.9',
        'border-radius:2px',
        'pointer-events:none',
        'z-index:2147483646',
      ].join(';');
      document.body.appendChild(sep);
    });
  }

  function removeBtnBackdrop() {
    document.getElementById('xfs-btn-backdrop')?.remove();
    document.querySelectorAll('[id^="xfs-btn-section-"],[id^="xfs-btn-sep-"]').forEach(el => el.remove());
  }

  function injectBtn() {
    if (!document.body) return;
    if (!/\/status\/\d/.test(location.pathname)) return;
    if (isListPage()) return; // likes/retweets/followers use their own button
    injectHideBtn();
    injectBtnBackdrop();
    injectReferralBtn();
    injectGearBtn();
    if (!document.getElementById('xfs-referral-scan-btn')) {
      document.body.appendChild(mkIconBtn(
        'xfs-referral-scan-btn', SCAN_SVG, '扫描当前视图导流号并打开确认面板；只检查已加载回复，识别会稍有延迟', 240, C.referral, scanReferralAccountsInView));
    }
    if (!document.getElementById('xfs-btn')) {
      document.body.appendChild(mkIconBtn(
        'xfs-btn', SCAN_SVG, '当前视图内容垃圾号自动屏蔽', 360, C.blockRed, autoLoadAndScan));
    }
    if (!document.getElementById('xfs-sweep-btn')) {
      document.body.appendChild(mkIconBtn(
        'xfs-sweep-btn', SWEEP_SVG, '整页回复内容垃圾号一网打尽', 320, C.nameKw, () => {
          if (sweepHasRun) {
            // Second+ click: reload page first so already-blocked accounts are gone,
            // then auto-trigger sweep once the page has reloaded.
            sessionStorage.setItem('xfs-auto-sweep', location.pathname);
            location.reload();
          } else {
            sweepHasRun = true;
            sweepAll();
          }
        }));
    }
  }

  function removeBtn() {
    document.getElementById('xfs-btn')?.remove();
    document.getElementById('xfs-referral-scan-btn')?.remove();
    document.getElementById('xfs-sweep-btn')?.remove();
    removeGearBtn();
    removeReferralBtn();
    removeHideBtn();
    removeBtnBackdrop();
  }

  // ── Likes / retweets / followers page button ─────────────────────────
  function injectListBtn() {
    if (!document.body) return;
    if (document.getElementById('xfs-list-btn')) return;
    if (!isListPage()) return;
    const path = location.pathname;
    const label = /\/likes$/.test(path)             ? '批量屏蔽点赞者'
                : /\/(retweets|reposts)$/.test(path) ? '批量屏蔽转发者'
                : '批量屏蔽关注者';
    document.body.appendChild(
      mkIconBtn('xfs-list-btn', LIST_SVG, label, 200, C.mute, sweepUserList));
  }

  function removeListBtn() {
    document.getElementById('xfs-list-btn')?.remove();
  }

  // ── Referral-account hide toggle button ──────────────────────────────
  // Defaults on. Hides replies from accounts whose profile links to x.com handles.
  function updateReferralBtn() {
    const btn = document.getElementById('xfs-referral-btn');
    if (!btn) return;
    const badge = document.getElementById('xfs-referral-badge');
    btn.textContent = EYE_SVG;
    if (badge) btn.appendChild(badge);
    btn.title = hideReferralActive
      ? '导流号回复已隐藏，点击显示。受平台接口/限速影响，识别会稍有延迟'
      : '点击隐藏 profile 含 x.com 链接的导流号回复。只检查已加载回复，识别会稍有延迟';
    btn.style.background = hideReferralActive ? 'rgba(95,111,137,0.14)' : 'rgba(255,255,255,0.92)';
    btn.style.border = hideReferralActive ? `2px solid ${C.referral}` : `2px dashed ${C.btnBorder}`;
    btn.style.color = hideReferralActive ? C.referral : C.sub;
    btn.style.opacity = hideReferralActive ? '1' : '0.55';
    btn.style.boxShadow = hideReferralActive ? `0 0 0 2px ${C.referral}22,0 2px 8px rgba(0,0,0,0.16)` : '0 2px 8px rgba(0,0,0,0.12)';
    updateReferralBadge();
  }

  function injectReferralBtn() {
    if (!document.body) return;
    if (document.getElementById('xfs-referral-btn')) return;
    if (!/\/status\/\d/.test(location.pathname)) return;
    if (isListPage()) return;

    const btn = mkIconBtn('xfs-referral-btn', EYE_SVG, '', 280, C.referral, null);

    const badge = document.createElement('span');
    badge.id = 'xfs-referral-badge';
    badge.style.cssText = [
      'position:absolute', 'top:-5px', 'right:-5px',
      'min-width:16px', 'height:16px',
      `background:${C.referral}`, 'color:#fff',
      'border-radius:8px', 'font-size:9px', 'font-weight:700',
      'display:none', 'align-items:center', 'justify-content:center',
      'padding:0 3px', 'box-sizing:border-box',
      'pointer-events:none', 'line-height:1',
    ].join(';');
    btn.appendChild(badge);

    btn.onclick = () => {
      hideReferralActive = !hideReferralActive;
      GM_setValue('hide_referral_accounts', hideReferralActive);
      btn.textContent = EYE_SVG;
      btn.appendChild(badge);
      updateReferralBtn();
      if (hideReferralActive) applyReferralForVisible();
      applyHideAll();
      showToast(hideReferralActive ? '导流号隐藏已开启' : '导流号隐藏已关闭', false);
    };

    document.body.appendChild(btn);
    updateReferralBtn();
    if (hideReferralActive) applyReferralForVisible();
  }

  function removeReferralBtn() {
    document.getElementById('xfs-referral-btn')?.remove();
  }

  // ── Hide-matched toggle button ───────────────────────────────────────
  // Top button in the content-spam group. Collapses matched articles to a 1px gray
  // separator line. State persists across SPA navigations via GM storage.
  function updateMatchedHideBtn() {
    const btn = document.getElementById('xfs-hide-btn');
    if (!btn) return;
    const badge = document.getElementById('xfs-hide-badge');
    btn.textContent = EYE_SVG;
    if (badge) btn.appendChild(badge);
    btn.title = hideMatchedActive
      ? '内容垃圾号回复已隐藏，点击显示'
      : '点击隐藏匹配关键词/正则的内容垃圾号回复';
    btn.style.background = hideMatchedActive ? 'rgba(244,33,46,0.10)' : 'rgba(255,255,255,0.92)';
    btn.style.border = hideMatchedActive ? `2px solid ${C.blockRed}` : `2px dashed ${C.btnBorder}`;
    btn.style.color = hideMatchedActive ? C.blockRed : C.sub;
    btn.style.opacity = hideMatchedActive ? '1' : '0.55';
    btn.style.boxShadow = hideMatchedActive ? `0 0 0 2px ${C.blockRed}22,0 2px 8px rgba(0,0,0,0.16)` : '0 2px 8px rgba(0,0,0,0.12)';
    updateHideBadge();
  }

  function injectHideBtn() {
    if (!document.body) return;
    if (document.getElementById('xfs-hide-btn')) return;
    if (!/\/status\/\d/.test(location.pathname)) return;
    if (isListPage()) return;

    const btn = mkIconBtn(
      'xfs-hide-btn',
      EYE_SVG,
      hideMatchedActive ? '内容垃圾号回复已隐藏，点击显示' : '点击隐藏匹配关键词/正则的内容垃圾号回复',
      400, C.sub, null
    );

    // Badge: shows count of matched handles accumulated this scroll session
    const badge = document.createElement('span');
    badge.id = 'xfs-hide-badge';
    badge.style.cssText = [
      'position:absolute', 'top:-5px', 'right:-5px',
      'min-width:16px', 'height:16px',
      `background:${C.blockRed}`, 'color:#fff',
      'border-radius:8px', 'font-size:9px', 'font-weight:700',
      'display:none', 'align-items:center', 'justify-content:center',
      'padding:0 3px', 'box-sizing:border-box',
      'pointer-events:none', 'line-height:1',
    ].join(';');
    btn.appendChild(badge);

    btn.onclick = () => {
      hideMatchedActive = !hideMatchedActive;
      GM_setValue('hide_matched', hideMatchedActive);
      updateMatchedHideBtn();
      applyHideAll();
    };

    document.body.appendChild(btn);
    updateMatchedHideBtn();
    applyHideAll();
  }

  function removeHideBtn() {
    document.getElementById('xfs-hide-btn')?.remove();
  }

  // ── Home timeline button: mute keyword ───────────────────────────────
  // Muted keywords only affect Home timeline / Notifications / Search.
  // They do NOT filter tweet reply threads — that's what the block buttons are for.
  function injectMuteBtn() {
    if (!document.body) return;
    if (document.getElementById('xfs-mute-btn')) return;
    if (location.pathname !== '/home') return;
    const muteEl = mkIconBtn(
      'xfs-mute-btn',
      MUTE_SVG,
      '静音选中词（加入首页/通知/搜索的屏蔽词，不影响回复串）',
      152, C.mute, muteSelectedWord
    );
    muteEl.addEventListener('mousedown', e => {
      _savedMuteSel = (window.getSelection() || document.getSelection())?.toString().trim() || '';
      e.preventDefault();
    });
    document.body.appendChild(muteEl);
  }

  function removeMuteBtn() {
    document.getElementById('xfs-mute-btn')?.remove();
  }

  function ensureRouteButtons() {
    if (!document.body) return;
    const p = location.pathname;
    if      (isListPage(p))          injectListBtn();
    else if (/\/status\/\d/.test(p)) injectBtn();
    else if (p === '/home')          injectMuteBtn();
  }

  function routeButtonsReady() {
    const p = location.pathname;
    const ids = isListPage(p) ? ['xfs-list-btn']
              : /\/status\/\d/.test(p) ? ['xfs-btn-backdrop', 'xfs-hide-btn', 'xfs-referral-btn', 'xfs-btn', 'xfs-referral-scan-btn', 'xfs-sweep-btn', 'xfs-gear-btn']
              : p === '/home' ? ['xfs-mute-btn'] : [];
    return ids.every(id => document.getElementById(id));
  }

  // ── SPA route watcher (deferred until DOM is ready) ─────────────────
  let uiStarted = false;
  function startUI() {
    if (uiStarted) return;
    if (!document.body) {
      setTimeout(startUI, 50);
      return;
    }
    uiStarted = true;

    let lastPath = location.pathname;
    let ibtnTimer = null;
    let profileTimer = null;
    let watchdogTimer = null;

    function startButtonWatchdog(duration = 30000, interval = 500) {
      clearTimeout(watchdogTimer);
      const until = Date.now() + duration;
      const tick = () => {
        ensureRouteButtons();
        if (Date.now() < until || !routeButtonsReady()) {
          watchdogTimer = setTimeout(tick, interval);
        }
      };
      tick();
    }

    // If this page was reloaded by the sweep button to flush blocked accounts,
    // auto-trigger sweep once the page is ready.
    const autoSweepPath = sessionStorage.getItem('xfs-auto-sweep');
    if (autoSweepPath && autoSweepPath === location.pathname) {
      sessionStorage.removeItem('xfs-auto-sweep');
      waitForTweetContent().then(() => { sweepHasRun = true; sweepAll(); });
    }

    // ── Navigation handler — called directly by pushState/replaceState/popstate ──
    // Fires synchronously with the URL change, so no DOM-timing race.
    function handleNav() {
      const cur = location.pathname;
      if (cur === lastPath) return;
      lastPath = cur;
      sweepHasRun = false;
      matchedHandlesInView.clear();
      matchedUsersCache.clear();
      removeBtn();
      removeListBtn();
      removeMuteBtn();
      document.getElementById('xfs-panel')?.remove();
      setTimeout(captureReferralAccountsFromProfileDom, 300);
      setTimeout(ensureRouteButtons, 300);
      startButtonWatchdog(12000, 500);
    }
    _navCallbacks.push(handleNav);

    // ── MutationObserver — inline buttons + fallback for nav events ──
    // No longer responsible for URL-change detection (handled by handleNav above).
    // The fallback injectBtn() calls are cheap due to the early-return guard inside.
    const observer = new MutationObserver(() => {
      clearTimeout(ibtnTimer);
      ibtnTimer = setTimeout(injectInlineButtons, 300);
      clearTimeout(profileTimer);
      profileTimer = setTimeout(captureReferralAccountsFromProfileDom, 250);

      // Fallback: re-inject main buttons if DOM settled before the nav timer fired.
      ensureRouteButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Initial inject on page load
    setTimeout(captureReferralAccountsFromProfileDom, 900);
    setTimeout(injectInlineButtons, 1200);
    setTimeout(ensureRouteButtons, 1200);

    // Startup watchdog: X.com can leave the DOM quiet before React has rendered
    // the target route. Re-check for a short window and repair any partial group.
    startButtonWatchdog(30000, 500);

    // Re-check when the user switches back to a backgrounded tab.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      ensureRouteButtons();
      startButtonWatchdog(5000, 500);
    });
  }

  startUI();
  document.addEventListener('DOMContentLoaded', startUI);
  window.addEventListener('load', startUI);

})();
