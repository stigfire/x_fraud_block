// ==UserScript==
// @name         垃圾推号大扫除
// @namespace    http://tampermonkey.net/
// @version      5.57
// @description  扫描推文回复中的垃圾用户批量屏蔽
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
// @connect      raw.githubusercontent.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ── Detection rules ──────────────────────────────────────────────────
  const HEART_RE   = /[\u2764\u2665\u2763\u{1F493}\u{1F494}\u{1F495}\u{1F496}\u{1F497}\u{1F498}\u{1F499}\u{1F49A}\u{1F49B}\u{1F49C}\u{1F49D}\u{1F49E}\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}]/u;
  // Basic CJK block — used to distinguish Chinese-context tweets from English ones
  const CHINESE_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  const FACE_EMOJI_SRC = '[\\u{1F600}-\\u{1F64F}]|[\\u{1F910}-\\u{1F917}]|[\\u{1F920}-\\u{1F92F}]|[\\u{1F970}-\\u{1F97A}]|\\u{1F9D0}|[\\u{1FAE0}-\\u{1FAE8}]|[\\u263A\\u2639]';
  const NON_FACE_EMOJI_SRC = `(?!(?:${FACE_EMOJI_SRC}))\\p{Extended_Pictographic}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}]?`;
  // Strange characters for decorative spam: Unicode symbols only. Punctuation, including CJK/fullwidth punctuation, is intentionally excluded.
  const DECOR_SYMBOL_SRC = `(?!(?:${NON_FACE_EMOJI_SRC}))\\p{S}`;
  const DECOR_SYMBOL_RUN_SRC = `(?:${DECOR_SYMBOL_SRC})+`;
  const DEFAULT_SUSPECT_KWS      = ['线下', '真人', '主人', '附近的吗', 'dd', '搭子', '固炮', '蹲个', '在线找', '快来', 'big bro\'', 'big bro', 'big brother', 'little bro', '单男', '第一骚', '小m', '男大弟弟', 'pan.quark.cn', 'drive.uc.cn', 'pan.xunlei.com', '离得近的', '万达广场', '同城的哥哥', '⬆️', '🍓'];
  // Text keywords matched against display name (dynamic, can add/remove in panel)
  const DEFAULT_SUSPECT_NAME_KWS = ['同城', '单身', '刺激', '母狗', '巨乳', '女大', '男大', '真人', '互关fo', '🅱️', '真实', '互关', '全国', '🍑', '🍆', '💯', '费破', '👠', '骚', '熟女', '单男', '少妇', '线下', '🍓', '💊', '约炮', '痒', '固炮', '免费', '无偿', '搭子', '反差', '护士', '高中生', '🌸🌸'];
  // RegEx patterns matched against display name and tweet body (stored as strings, compiled at match time)
  // Preset: @handle followed by blank lines then an upward arrow — classic spam referral pattern
  const DEFAULT_SUSPECT_RE_KWS   = [
    '^@\\w+\\n+[⬆↑⇑]',
    '👉\\s*@\\w',
    '(?=[\\s\\S]*比[\\s\\S]{0,8}她)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)[\\s\\S]{1,280}',
    '(?=[\\s\\S]*比[\\s\\S]{0,8}她)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)(?=[\\s\\S]*(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}))[\\s\\S]{1,280}',
    '(?=[\\s\\S]*不行了)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)[\\s\\S]{1,280}',
    '(?=[\\s\\S]*主页)(?=[\\s\\S]*@[A-Za-z0-9_]{1,15}\\b)(?=[\\s\\S]*(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}))[\\s\\S]{1,280}',
    `(?:${NON_FACE_EMOJI_SRC}\\s*){3,}`,
    `(?:${DECOR_SYMBOL_RUN_SRC}\\s*(?:${NON_FACE_EMOJI_SRC}\\s*){2,}|(?:${NON_FACE_EMOJI_SRC}\\s*){2,}${DECOR_SYMBOL_RUN_SRC})`,
    '[\\u02B0-\\u02FF\\u1D2C-\\u1D7F\\u1D80-\\u1DBF\\u2070-\\u209F]{3,}',
  ];
  const REMOTE_RULES_URL = 'https://raw.githubusercontent.com/stigfire/x_fraud_block/main/rules/keywords.json';
  const REMOTE_RULES_FETCH_INTERVAL = 60 * 60 * 1000;
  const REMOTE_RULES_MAX_BYTES = 100 * 1024;
  const REMOTE_RULE_LIMITS = {
    content: 300,
    name: 300,
    regex: 80,
    keywordLen: 120,
    regexLen: 240,
  };
  let remoteRulesActive = !!GM_getValue('remote_rules_active', false);
  let remoteRulesCache = null;
  let remoteRulesFetching = false;
  let remoteRulesLastError = GM_getValue('remote_rules_last_error', '');
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
  function _regexPatternParts(raw) {
    const value = String(raw).trim();
    const m = value.match(/^(content|body|name):(.*)$/is);
    if (!m) return { raw: value, scope: 'both', pat: value };
    return { raw: value, scope: m[1].toLowerCase() === 'name' ? 'name' : 'body', pat: m[2].trim() };
  }
  function _limitRemoteList(list, limit, maxLen, isRegex = false) {
    const out = [];
    for (const item of _cleanKwList(list)) {
      if (item.length > maxLen) continue;
      if (isRegex) {
        const parsed = _regexPatternParts(item);
        if (!parsed.pat) continue;
        try { new RegExp(parsed.pat, 'mu'); } catch (_) { continue; }
      }
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }
  function _remoteArray(obj, key) {
    if (Array.isArray(obj?.[key])) return obj[key];
    if (Array.isArray(obj?.rules?.[key])) return obj.rules[key];
    return [];
  }
  function sanitizeRemoteRulesPayload(payload, fetchedAt = 0) {
    const obj = payload && typeof payload === 'object' ? payload : {};
    const rules = {
      contentKeywords: _limitRemoteList(_remoteArray(obj, 'contentKeywords'), REMOTE_RULE_LIMITS.content, REMOTE_RULE_LIMITS.keywordLen),
      nameKeywords: _limitRemoteList(_remoteArray(obj, 'nameKeywords'), REMOTE_RULE_LIMITS.name, REMOTE_RULE_LIMITS.keywordLen),
      regexKeywords: _limitRemoteList(_remoteArray(obj, 'regexKeywords'), REMOTE_RULE_LIMITS.regex, REMOTE_RULE_LIMITS.regexLen, true),
    };
    return {
      schemaVersion: Number(obj.schemaVersion) || 1,
      rulesVersion: String(obj.rulesVersion || obj.version || '').slice(0, 48),
      updatedAt: String(obj.updatedAt || '').slice(0, 48),
      fetchedAt: Number(fetchedAt || obj.fetchedAt || 0) || 0,
      rules,
    };
  }
  function loadRemoteRulesCache() {
    try {
      const cached = sanitizeRemoteRulesPayload(GM_getValue('remote_rules_cache', null));
      const total = cached.rules.contentKeywords.length + cached.rules.nameKeywords.length + cached.rules.regexKeywords.length;
      remoteRulesCache = total > 0 || cached.rulesVersion ? cached : null;
    } catch (_) {
      remoteRulesCache = null;
    }
  }
  loadRemoteRulesCache();
  function remoteDefaultsForKey(key) {
    if (!remoteRulesActive || !remoteRulesCache?.rules) return [];
    if (key === 'suspect_kws') return remoteRulesCache.rules.contentKeywords || [];
    if (key === 'suspect_name_kws') return remoteRulesCache.rules.nameKeywords || [];
    if (key === 'suspect_re_kws') return remoteRulesCache.rules.regexKeywords || [];
    return [];
  }
  function _combinedDefaults(defaults, key) {
    return _cleanKwList([...defaults, ...remoteDefaultsForKey(key)]);
  }
  function _sameList(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  function _loadKws(defaults, key) {
    const activeDefaults = _combinedDefaults(defaults, key);
    const rawAdds = GM_getValue(key + '_add', []);
    const rawAddList = Array.isArray(rawAdds) ? rawAdds : [];
    const defNorms = new Set(activeDefaults.map(_normKw));
    const adds = _cleanKwList(rawAddList).filter(k => !defNorms.has(_normKw(k)));
    if (!_sameList(rawAddList, adds)) GM_setValue(key + '_add', adds);
    const delNorms = new Set((GM_getValue(key + '_del', []) || []).map(_normKw));
    return _cleanKwList([...activeDefaults, ...adds]).filter(k => !delNorms.has(_normKw(k)));
  }
  function _saveKwSet(live, defaults, key) {
    const activeDefaults = _combinedDefaults(defaults, key);
    const cleanLive = _cleanKwList(live);
    const defNorms = new Set(activeDefaults.map(_normKw));
    const liveNorms = new Set(cleanLive.map(_normKw));
    const activeDefaultNorms = new Set(activeDefaults.map(_normKw));
    const preservedDels = _cleanKwList(GM_getValue(key + '_del', []))
      .filter(k => !activeDefaultNorms.has(_normKw(k)) && !liveNorms.has(_normKw(k)));
    GM_setValue(key + '_add', cleanLive.filter(k => !defNorms.has(_normKw(k))));
    GM_setValue(key + '_del', _cleanKwList([...preservedDels, ...activeDefaults.filter(k => !liveNorms.has(_normKw(k)))]));
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
  let regexCacheKey = '';
  let regexCache = [];
  function compiledRegexes(patterns) {
    const key = patterns.join('\n');
    if (key === regexCacheKey) return regexCache;
    regexCacheKey = key;
    regexCache = patterns.map(pat => {
      const parsed = _regexPatternParts(pat);
      try { return { pat, scope: parsed.scope, re: new RegExp(parsed.pat, 'mu') }; }
      catch (_) { return null; }
    }).filter(Boolean);
    return regexCache;
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

  function remoteRulesSummary() {
    if (!remoteRulesCache?.rules) return '尚未拉取';
    const c = remoteRulesCache.rules.contentKeywords.length;
    const n = remoteRulesCache.rules.nameKeywords.length;
    const r = remoteRulesCache.rules.regexKeywords.length;
    const ver = remoteRulesCache.rulesVersion ? ` · ${remoteRulesCache.rulesVersion}` : '';
    return `内容 ${c} / 用户名 ${n} / 正则 ${r}${ver}`;
  }

  function remoteRulesFetchedText() {
    const ts = Number(remoteRulesCache?.fetchedAt || 0);
    if (!ts) return '从未更新';
    try { return new Date(ts).toLocaleString(); }
    catch (_) { return '已更新'; }
  }

  function refreshKeywordPanelIfOpen() {
    const panel = document.getElementById('xfs-panel');
    const kwBar = document.getElementById('xfs-kw-bar');
    if (!panel || !kwBar) return;
    showPanel(scanPage(), { keywordsOpen: kwBar.style.display !== 'none' });
  }

  function requestRemoteRulesPayload() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${REMOTE_RULES_URL}?t=${Date.now()}`,
        headers: { accept: 'application/json' },
        timeout: 15000,
        onload(resp) {
          if (resp.status < 200 || resp.status >= 300) {
            reject(new Error(`HTTP ${resp.status}`));
            return;
          }
          const text = String(resp.responseText || '');
          if (text.length > REMOTE_RULES_MAX_BYTES) {
            reject(new Error('remote rules file too large'));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e);
          }
        },
        onerror() { reject(new Error('network error')); },
        ontimeout() { reject(new Error('timeout')); },
      });
    });
  }

  async function refreshRemoteRules(opts = {}) {
    const force = !!opts.force;
    const silent = !!opts.silent;
    if (!remoteRulesActive || remoteRulesFetching) return false;
    const last = Number(remoteRulesCache?.fetchedAt || 0);
    if (!force && last && Date.now() - last < REMOTE_RULES_FETCH_INTERVAL) return false;
    remoteRulesFetching = true;
    try {
      const payload = await requestRemoteRulesPayload();
      const nextCache = sanitizeRemoteRulesPayload(payload, Date.now());
      remoteRulesCache = nextCache;
      remoteRulesLastError = '';
      GM_setValue('remote_rules_cache', remoteRulesCache);
      GM_setValue('remote_rules_last_error', '');
      reloadKws();
      refreshKeywordPanelIfOpen();
      reapplyContentRulesForVisible();
      if (!silent) showToast(`远程规则已更新：${remoteRulesSummary()}`, false);
      return true;
    } catch (e) {
      remoteRulesLastError = e?.message || String(e);
      GM_setValue('remote_rules_last_error', remoteRulesLastError);
      console.warn('[XFS] remote rules refresh failed:', e);
      if (!silent) showToast(`远程规则更新失败：${remoteRulesLastError}`, true);
      return false;
    } finally {
      remoteRulesFetching = false;
    }
  }

  function scheduleRemoteRulesRefresh() {
    setTimeout(() => refreshRemoteRules({ silent: true }), 5000);
    setInterval(() => refreshRemoteRules({ silent: true }), REMOTE_RULES_FETCH_INTERVAL);
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
  const REFERRAL_CACHE_KEY = 'xfs-referral-account-cache-v10';
  const REFERRAL_CACHE_TTL = 48 * 60 * 60 * 1000;
  const REFERRAL_MIN_GAP = 2500;
  const REFERRAL_JITTER = 2500;
  const REFERRAL_RATE_LIMIT_COOLDOWN = 10 * 60 * 1000;
  const REFERRAL_FAILURE_TTL = 30 * 60 * 1000;
  const REFERRAL_MAX_CACHE = 1200;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const YOUNG_ACCOUNT_DAY_OPTIONS = [7, 14, 30, 60, 90];
  const REFERRAL_X_LINK_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(?!home\b|i\b|intent\b|share\b|search\b|settings\b|privacy\b|tos\b|explore\b|notifications\b|messages\b|compose\b)[A-Za-z0-9_]{1,15}\b/i;
  const REFERRAL_X_LINK_GLOBAL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(?!home\b|i\b|intent\b|share\b|search\b|settings\b|privacy\b|tos\b|explore\b|notifications\b|messages\b|compose\b)[A-Za-z0-9_]{1,15}\b/ig;
  const REFERRAL_ANY_LINK_RE = /\b(?:(?:https?:\/\/|www\.)[^\s<>"'，。、《》【】（）()]+|(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:com\.cn|net\.cn|org\.cn|com|net|org|io|me|app|dev|xyz|cc|co|tv|link|site|top|shop|info|biz|vip|icu|cn|ly|to|be|gg|club|online|store|live|fun|quest|pw|ru|jp|us|uk|de|ai|one|pro|ink|wiki|work|world|today|space|click|cloud|mobi|red|kim|wang|xin)(?::\d{2,5})?(?:\/[^\s<>"'，。、《》【】（）()]*)?)(?![A-Za-z0-9.-])/ig;
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
  let autoReferralDetectActive = GM_getValue('auto_referral_detect', true); // low-rate background referral lookup for visible replies
  let youngAccountFilterActive = GM_getValue('young_account_filter_active', false); // optional profile-created-at filter; default off due to lookup cost and false positives
  let youngAccountCutoffMode = normalizeYoungAccountCutoffMode(GM_getValue('young_account_cutoff_mode', 'days'));
  let youngAccountMaxAgeDays = normalizeYoungAccountDays(GM_getValue('young_account_max_age_days', 30));
  let youngAccountCutoffDate = normalizeDateInputValue(GM_getValue('young_account_cutoff_date', defaultYoungAccountCutoffDate()));
  let panelDockedActive = GM_getValue('panel_docked', false); // remember whether the result panel should open docked
  let buttonsCollapsed = GM_getValue('buttons_collapsed', false); // collapse the right-side floating tool stack
  let toolbarRight = GM_getValue('toolbar_right', 18);
  let toolbarBaseBottom = GM_getValue('toolbar_base_bottom', 160);
  let activeScanMode = '';
  let persistentBlockedCount = Math.max(0, parseInt(GM_getValue('persistent_blocked_count', 0), 10) || 0);
  let userLookupQueryId = GM_getValue('user_lookup_query_id', DEFAULT_USER_LOOKUP_QUERY_ID);
  let capturedApiHeaders = null;
  const matchedHandlesInView = new Set(); // accumulates matched handles this scroll session; reset on nav
  const matchedUsersCache = new Map();   // handle → full user object; survives DOM unload by React virtual list
  const referralIntentHints = new Map(); // handle -> visible profile/display-name text containing referral intent
  const referralHintRefreshDone = new Set();
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

  function showProgressToast(msg, color = C.mute) {
    const old = document.getElementById('xfs-progress-toast');
    old?.remove();
    const t = document.createElement('div');
    t.id = 'xfs-progress-toast';
    t.textContent = msg;
    t.style.cssText = [
      'position:fixed', 'bottom:148px', 'right:16px',
      `background:${color}`, 'color:#fff',
      'padding:6px 12px', 'border-radius:13px',
      'font-size:12px', 'font-weight:700',
      'z-index:2147483647', 'pointer-events:none',
      'box-shadow:0 3px 12px rgba(0,0,0,0.22)',
      'max-width:260px', 'white-space:nowrap',
    ].join(';');
    document.body.appendChild(t);
    return {
      update(next) { t.textContent = next; },
      close(delay = 0) {
        setTimeout(() => {
          t.style.transition = 'opacity 0.35s, transform 0.35s';
          t.style.opacity = '0';
          t.style.transform = 'translateY(4px)';
          setTimeout(() => t.remove(), 380);
        }, delay);
      },
    };
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

  function extractDisplayNameFromArticle(art, handle = extractHandleFromArticle(art)) {
    const nameEl = art.querySelector('[data-testid="User-Name"]');
    if (!nameEl || !handle) return handle || '';
    const rawNameText = getTextWithEmoji(nameEl);
    const atIdx = rawNameText.indexOf('@' + handle);
    if (atIdx > 0) return rawNameText.slice(0, atIdx).trim() || handle;
    const nameLink = [...nameEl.querySelectorAll('a')].find(a => {
      const t = getTextWithEmoji(a).trim();
      return t && !t.startsWith('@');
    });
    return nameLink ? getTextWithEmoji(nameLink).trim() || handle : handle;
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
          isLinkReferral: !!(item && item.isLinkReferral),
          isYoungAccount: !!(item && item.isYoungAccount),
          urls: Array.isArray(item && item.urls) ? item.urls : [],
          createdAt: String((item && item.createdAt) || ''),
          accountAgeDays: Number.isFinite(Number(item && item.accountAgeDays)) ? Number(item.accountAgeDays) : null,
          ts,
        });
      }
    });
    return cache;
  }

  const referralCache = loadReferralCache();
  const referralPending = new Map();
  const referralQueue = [];
  const referralFailureCache = new Map();
  let referralQueueActive = false;
  let referralQueueTimer = null;
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

  function normalizeYoungAccountDays(value) {
    const n = parseInt(value, 10);
    return YOUNG_ACCOUNT_DAY_OPTIONS.includes(n) ? n : 30;
  }

  function normalizeYoungAccountCutoffMode(value) {
    return value === 'date' ? 'date' : 'days';
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function defaultYoungAccountCutoffDate() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toDateInputValue(d);
  }

  function normalizeDateInputValue(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(Date.parse(`${raw}T00:00:00`))) return raw;
    return defaultYoungAccountCutoffDate();
  }

  function youngAccountCutoffMs() {
    if (youngAccountCutoffMode === 'date') {
      return Date.parse(`${youngAccountCutoffDate}T00:00:00`);
    }
    return Date.now() - youngAccountMaxAgeDays * DAY_MS;
  }

  function isYoungAccountByAge(age) {
    const cutoff = youngAccountCutoffMs();
    return !!(youngAccountFilterActive && age && Number.isFinite(cutoff) && Date.parse(age.createdAtIso) >= cutoff);
  }

  function youngAccountRuleLabel() {
    return youngAccountCutoffMode === 'date'
      ? `注册日期晚于 ${youngAccountCutoffDate}`
      : `注册少于 ${youngAccountMaxAgeDays} 天`;
  }

  function accountAgeInfo(createdAt) {
    const raw = String(createdAt || '').trim();
    if (!raw) return null;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return null;
    const ageMs = Date.now() - ms;
    const ageDays = Math.floor(ageMs / DAY_MS);
    if (!Number.isFinite(ageDays) || ageDays < 0) return null;
    return {
      createdAt: raw,
      createdAtIso: new Date(ms).toISOString(),
      ageMs,
      ageDays,
    };
  }

  function createdAtFromProfile(legacy, userObj = null) {
    return legacy?.created_at
      || legacy?.createdAt
      || userObj?.legacy?.created_at
      || userObj?.legacy?.createdAt
      || userObj?.created_at
      || userObj?.createdAt
      || '';
  }

  function materializeReferralItem(item) {
    if (!item) return null;
    const age = accountAgeInfo(item.createdAt);
    const isYoungAccount = isYoungAccountByAge(age);
    const isLinkReferral = item.isLinkReferral != null
      ? !!item.isLinkReferral
      : !!(Array.isArray(item.urls) && item.urls.length > 0 && !item.isYoungAccount);
    return {
      ...item,
      isLinkReferral,
      isYoungAccount,
      accountAgeDays: age ? age.ageDays : item.accountAgeDays,
      youngAccountMaxAgeDays,
      youngAccountCutoffMode,
      youngAccountCutoffDate,
      isReferral: isLinkReferral || isYoungAccount,
    };
  }

  function referralItemDescription(item) {
    if (!item) return 'profile referral link';
    if (item.isLinkReferral && item.urls?.length) return item.urls[0];
    if (item.isYoungAccount) return `注册 ${item.accountAgeDays} 天，${youngAccountRuleLabel()}`;
    return item.urls?.[0] || 'profile referral link';
  }

  function rememberReferralAccount(handle, urls, opts = {}) {
    const key = normalizeHandle(handle);
    if (!key) return;
    const cleanUrls = [...new Set((Array.isArray(urls) ? urls : []).map(u => String(u || '').trim()).filter(Boolean))];
    if (cleanUrls.length === 0 && opts.allowNegative !== true) return;
    const existing = referralCache.get(key);
    const existingEffective = materializeReferralItem(existing);
    if (cleanUrls.length === 0 && !opts.createdAt && existingEffective?.isReferral) return;
    const mergedUrls = cleanUrls.length > 0
      ? [...new Set([...(existing?.urls || []), ...cleanUrls])]
      : (existing?.urls || []);
    const createdAt = String(opts.createdAt || existing?.createdAt || '');
    const age = accountAgeInfo(createdAt);
    const rawItem = {
      isReferral: false,
      isLinkReferral: mergedUrls.length > 0,
      isYoungAccount: isYoungAccountByAge(age),
      urls: mergedUrls,
      createdAt,
      accountAgeDays: age ? age.ageDays : null,
      ts: Date.now(),
    };
    rawItem.isReferral = materializeReferralItem(rawItem).isReferral;
    referralCache.set(key, rawItem);
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

  function extractAnyLinksFromText(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    REFERRAL_ANY_LINK_RE.lastIndex = 0;
    return text.match(REFERRAL_ANY_LINK_RE) || [];
  }

  function collectReferralAnyLinks(candidates) {
    const out = [];
    (Array.isArray(candidates) ? candidates : []).forEach(v => {
      out.push(...extractAnyLinksFromText(v));
    });
    return [...new Set(out.map(v => String(v || '').trim()).filter(Boolean))];
  }

  function profileHasReferralIntent(text) {
    return stripInvisible(String(text || '')).includes('大号');
  }

  function rememberReferralIntentHint(handle, text) {
    const key = normalizeHandle(handle);
    const clean = stripInvisible(String(text || '')).trim();
    if (!key || !profileHasReferralIntent(clean)) return;
    const prev = referralIntentHints.get(key) || '';
    if (!prev.includes(clean)) referralIntentHints.set(key, [prev, clean].filter(Boolean).join(' '));
  }

  function referralLinksFromProfileFacts(facts) {
    const texts = Array.isArray(facts?.texts) ? facts.texts : [];
    const links = Array.isArray(facts?.links) ? facts.links : [];
    const candidates = [...texts, ...links];
    const out = collectReferralXLinks(candidates);
    if (profileHasReferralIntent(texts.join(' '))) out.push(...collectReferralAnyLinks(candidates));
    return [...new Set(out.map(v => String(v || '').trim()).filter(Boolean))];
  }

  function extractProfileReferralLinks(legacy, extraTexts = []) {
    const facts = { texts: [], links: [] };
    const pushUrl = u => {
      if (!u) return;
      facts.links.push(u.url, u.expanded_url, u.display_url);
    };
    legacy?.entities?.description?.urls?.forEach(pushUrl);
    legacy?.entities?.url?.urls?.forEach(pushUrl);
    if (legacy?.url) facts.links.push(legacy.url);
    if (legacy?.name) facts.texts.push(legacy.name);
    if (legacy?.description) facts.texts.push(legacy.description);
    if (legacy?.location) facts.texts.push(legacy.location);
    facts.texts.push(...(Array.isArray(extraTexts) ? extraTexts : [extraTexts]));
    return referralLinksFromProfileFacts(facts);
  }

  function userProfileExtraTexts(userObj, handle) {
    const key = normalizeHandle(handle);
    return [
      key ? referralIntentHints.get(key) || '' : '',
      userObj?.core?.name,
      userObj?.profile?.name,
      userObj?.display_name,
      userObj?.name,
    ].filter(Boolean);
  }

  function hasCompleteProfileLinkFields(legacy) {
    if (!legacy || typeof legacy !== 'object') return false;
    return 'description' in legacy
      || 'location' in legacy
      || 'url' in legacy
      || !!legacy.entities?.description
      || !!legacy.entities?.url;
  }

  function isReservedPathHandle(handle) {
    return /^(?:home|i|intent|share|search|settings|privacy|tos|explore|notifications|messages|compose)$/i.test(handle || '');
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
        rememberReferralAccount(legacy.screen_name, extractProfileReferralLinks(legacy, userProfileExtraTexts(cur, legacy.screen_name)), {
          allowNegative: hasCompleteProfileLinkFields(legacy) || !!createdAtFromProfile(legacy, cur),
          createdAt: createdAtFromProfile(legacy, cur),
        });
      } else if (cur.screen_name != null) {
        rememberReferralAccount(cur.screen_name, extractProfileReferralLinks(cur, userProfileExtraTexts(cur, cur.screen_name)), {
          allowNegative: hasCompleteProfileLinkFields(cur) || !!createdAtFromProfile(cur, cur),
          createdAt: createdAtFromProfile(cur, cur),
        });
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

    const aboutLink = scope.querySelector?.('a[href^="/"][href$="/about"]');
    const aboutHandle = aboutLink?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/about$/)?.[1];
    if (aboutHandle) return aboutHandle;

    const profileLink = [...(scope.querySelectorAll?.('a[href^="/"]') || [])].find(a => {
      const handle = a.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:about|photo|with_replies|media|highlights|likes|verified_followers|following|followers))?$/)?.[1];
      return handle && !isReservedPathHandle(handle);
    });
    const profileHandle = profileLink?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:about|photo|with_replies|media|highlights|likes|verified_followers|following|followers))?$/)?.[1];
    if (profileHandle) return profileHandle;

    const pathHandle = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes|about)?)?$/)?.[1];
    return pathHandle && !isReservedPathHandle(pathHandle) ? pathHandle : null;
  }

  function profileScopeForNode(node) {
    return node.closest?.('[role="dialog"]')
      || node.closest?.('[data-testid="primaryColumn"]')
      || node.closest?.('[data-testid="cellInnerDiv"]')
      || node;
  }

  function pushProfileNodeFacts(node, facts) {
    if (!node || !facts) return;
    facts.texts.push(getTextWithEmoji(node) || node.textContent || '');
    node.querySelectorAll?.('a,span').forEach(el => {
      facts.texts.push(el.textContent, el.getAttribute('title'), el.getAttribute('aria-label'));
      facts.links.push(el.getAttribute('href'));
    });
  }

  const PROFILE_FACT_SELECTOR = '[data-testid="UserProfileHeader_Items"],[data-testid="UserDescription"],[data-testid="UserName"]';

  function extractProfileFactsFromDom(scope) {
    const facts = { texts: [], links: [] };
    const nodes = new Set();
    if (scope.matches?.(PROFILE_FACT_SELECTOR)) nodes.add(scope);
    scope.querySelectorAll?.(PROFILE_FACT_SELECTOR).forEach(n => nodes.add(n));
    nodes.forEach(node => pushProfileNodeFacts(node, facts));
    return facts;
  }

  function captureReferralAccountsFromProfileDom(root = document) {
    const scopes = new Set();
    const captured = new Set();
    root.querySelectorAll?.(PROFILE_FACT_SELECTOR).forEach(node => {
      scopes.add(node);
      scopes.add(profileScopeForNode(node));
    });
    if (root.matches?.(PROFILE_FACT_SELECTOR)) {
      scopes.add(root);
      scopes.add(profileScopeForNode(root));
    }

    scopes.forEach(scope => {
      const handle = extractHandleFromProfileDom(scope);
      if (!handle) return;
      const links = referralLinksFromProfileFacts(extractProfileFactsFromDom(scope));
      if (links.length) {
        rememberReferralAccount(handle, links, { allowNegative: false });
        captured.add(normalizeHandle(handle));
      }
    });
    return [...captured];
  }

  function inspectReferralProfileDom(root = document) {
    const scopes = new Set();
    root.querySelectorAll?.(PROFILE_FACT_SELECTOR).forEach(node => {
      scopes.add(node);
      scopes.add(profileScopeForNode(node));
    });
    if (root.matches?.(PROFILE_FACT_SELECTOR)) {
      scopes.add(root);
      scopes.add(profileScopeForNode(root));
    }

    return [...scopes].map((scope, index) => {
      const facts = extractProfileFactsFromDom(scope);
      const text = stripInvisible(facts.texts.filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
      const links = facts.links.filter(Boolean);
      const referralLinks = referralLinksFromProfileFacts(facts);
      const handle = normalizeHandle(extractHandleFromProfileDom(scope));
      return {
        index,
        handle,
        hasIntent: profileHasReferralIntent(text),
        referralLinks,
        text,
        links,
        node: scope.matches?.(PROFILE_FACT_SELECTOR)
          ? scope.getAttribute('data-testid')
          : scope.getAttribute?.('data-testid') || scope.getAttribute?.('role') || scope.tagName,
      };
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
    return materializeReferralItem(item);
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

  function makeReferralError(message, status = 0, retryAfterMs = 0) {
    const e = new Error(message);
    e.status = status;
    e.retryAfterMs = retryAfterMs;
    e.rateLimited = status === 429 || retryAfterMs > 0;
    return e;
  }

  function parseRetryAfterMs(headers) {
    const m = String(headers || '').match(/^retry-after:\s*([^\r\n]+)/im);
    if (!m) return 0;
    const raw = m[1].trim();
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(raw);
    return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
  }

  function isReferralRateLimitError(e) {
    return !!(e && e.rateLimited);
  }

  function warnReferralLookupFailure(e) {
    if (referralWarned) return;
    referralWarned = true;
    if (isReferralRateLimitError(e)) {
      const ms = Math.max(referralCooldownRemaining(), e.retryAfterMs || 0, REFERRAL_RATE_LIMIT_COOLDOWN);
      showToast(`导流号查询触发限流，已暂停约 ${Math.ceil(ms / 60000)} 分钟`, true);
    } else {
      showToast('导流号查询失败：X API 暂不可用或限流', true);
    }
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
            reject(makeReferralError(`HTTP ${resp.status}`, resp.status, parseRetryAfterMs(resp.responseHeaders)));
            return;
          }
          try {
            const data = JSON.parse(resp.responseText || '{}');
            captureReferralAccountsFromData(data);
            const userResult = data?.data?.user?.result;
            const legacy = userResult?.legacy;
            if (!legacy) throw new Error('missing user legacy');
            const urls = extractProfileReferralLinks(legacy, userProfileExtraTexts(userResult, key));
            rememberReferralAccount(handle, urls, { allowNegative: true, createdAt: createdAtFromProfile(legacy, userResult) });
            const remembered = cachedReferralAccount(handle);
            resolve({ isReferral: !!remembered?.isReferral, urls: remembered?.urls || urls });
          } catch (e) {
            reject(e);
          }
        },
        onerror() { reject(makeReferralError('Network error')); },
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
        if (isReferralRateLimitError(e)) throw e;
      }
    }
    throw lastError || new Error('referral lookup failed');
  }

  // ── Cross-tab coordinated referral lookup ────────────────────────────
  // Profile lookups are easy to rate-limit when many X tabs are open. Keep one
  // same-origin queue across tabs and share cooldown state through localStorage.
  const LS_LAST_REFERRAL_LOOKUP = 'xfs-last-referral-lookup';
  const LS_REFERRAL_COOLDOWN_UNTIL = 'xfs-referral-cooldown-until-v2';

  function referralCooldownRemaining() {
    const until = parseInt(localStorage.getItem(LS_REFERRAL_COOLDOWN_UNTIL) || '0', 10);
    return Math.max(0, until - Date.now());
  }

  function setReferralCooldown(ms) {
    if (!ms || ms <= 0) return;
    const next = Date.now() + ms;
    const cur = parseInt(localStorage.getItem(LS_REFERRAL_COOLDOWN_UNTIL) || '0', 10);
    if (next > cur) localStorage.setItem(LS_REFERRAL_COOLDOWN_UNTIL, String(next));
  }

  function rememberReferralFailure(key, e) {
    referralFailureCache.set(key, {
      ts: Date.now(),
      rateLimited: isReferralRateLimitError(e),
    });
  }

  function recentReferralFailure(key) {
    const item = referralFailureCache.get(key);
    if (!item) return false;
    if (Date.now() - item.ts > REFERRAL_FAILURE_TTL) {
      referralFailureCache.delete(key);
      return false;
    }
    return true;
  }

  async function referralRequestCoordinated(handle) {
    const run = async () => {
      const cooldown = referralCooldownRemaining();
      if (cooldown > 0) throw makeReferralError('referral lookup cooling down', 429, cooldown);

      const gap = REFERRAL_MIN_GAP + Math.floor(Math.random() * REFERRAL_JITTER);
      const elapsed = Date.now() - parseInt(localStorage.getItem(LS_LAST_REFERRAL_LOOKUP) || '0', 10);
      if (elapsed < gap) await sleep(gap - elapsed);
      localStorage.setItem(LS_LAST_REFERRAL_LOOKUP, String(Date.now()));

      try {
        return await requestReferralAccount(handle);
      } catch (e) {
        if (isReferralRateLimitError(e)) {
          setReferralCooldown(Math.max(e.retryAfterMs || 0, REFERRAL_RATE_LIMIT_COOLDOWN));
        }
        throw e;
      }
    };

    if (navigator.locks?.request) return navigator.locks.request('xfs-referral-lookup-lock', run);
    return run();
  }

  function fetchReferralAccount(handle, opts = {}) {
    const key = normalizeHandle(handle);
    if (!key) return Promise.reject(new Error('missing handle'));
    const cached = cachedReferralAccount(key);
    if (cached !== null && !(opts.forceRefresh && cached.isReferral === false)) return Promise.resolve(cached);
    const cooldown = referralCooldownRemaining();
    if (cooldown > 0) return Promise.reject(makeReferralError('referral lookup cooling down', 429, cooldown));
    if (!opts.forceRefresh && recentReferralFailure(key)) return Promise.reject(makeReferralError('recent referral lookup failure'));
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
    const cooldown = referralCooldownRemaining();
    if (cooldown > 0) {
      clearTimeout(referralQueueTimer);
      referralQueueTimer = setTimeout(processReferralQueue, Math.min(cooldown + 250, REFERRAL_RATE_LIMIT_COOLDOWN));
      return;
    }
    referralQueueActive = true;
    const item = referralQueue.shift();
    try {
      const result = await referralRequestCoordinated(item.handle);
      item.resolve(result);
    } catch (e) {
      console.debug(`[XFS] referral lookup failed @${item.handle}:`, e);
      rememberReferralFailure(item.key, e);
      item.reject(e);
    } finally {
      referralPending.delete(item.key);
      referralQueueActive = false;
      referralQueueTimer = setTimeout(processReferralQueue, 0);
    }
  }

  function referralDebugSnapshot() {
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')].map((art, index) => {
      const handle = normalizeHandle(art.dataset.xfsReferralHandle || extractHandleFromArticle(art));
      const cached = handle ? cachedReferralAccount(handle) : null;
      const displayName = handle ? extractDisplayNameFromArticle(art, handle) : '';
      return {
        index,
        isFirstArticle: art === firstArt,
        handle,
        displayName,
        referralIntentHint: handle ? referralIntentHints.get(handle) || '' : '',
        referralDataset: art.dataset.xfsReferralAccount || '',
        queued: art.dataset.xfsReferralQueued || '',
        cached,
        recentFailure: handle ? recentReferralFailure(handle) : false,
        text: stripInvisible((art.querySelector('[data-testid="tweetText"]')?.textContent || '').slice(0, 180)),
      };
    });
    const profileScopes = inspectReferralProfileDom(document);
    const domCapturedHandles = captureReferralAccountsFromProfileDom(document);
    const handles = [...new Set([
      ...articles.filter(a => !a.isFirstArticle).map(a => a.handle).filter(Boolean),
      ...domCapturedHandles,
    ])];
    const snapshot = {
      version: GM_info?.script?.version || '',
      href: location.href,
      path: location.pathname,
      referral: {
        cacheKey: REFERRAL_CACHE_KEY,
        cooldownMs: referralCooldownRemaining(),
        pending: [...referralPending.keys()],
        queue: referralQueue.map(item => item.key),
        queueActive: referralQueueActive,
        autoReferralDetectActive,
        hideReferralActive,
        youngAccountFilterActive,
        youngAccountCutoffMode,
        youngAccountMaxAgeDays,
        youngAccountCutoffDate,
        userLookupQueryId,
        hasCapturedApiHeaders: !!capturedApiHeaders,
      },
      handles,
      profileScopes,
      articles,
    };
    console.group('[XFS DEBUG] referral snapshot');
    console.log(snapshot);
    console.table(profileScopes.map(s => ({
      index: s.index,
      handle: s.handle,
      hasIntent: s.hasIntent,
      referralLinks: s.referralLinks.join(' | '),
      text: s.text.slice(0, 120),
    })));
    console.table(articles.map(a => ({
      index: a.index,
      first: a.isFirstArticle,
      handle: a.handle,
      name: a.displayName,
      hint: a.referralIntentHint,
      dataset: a.referralDataset,
      queued: a.queued,
      cached: a.cached ? `${a.cached.isReferral ? 'referral' : 'negative'} ${referralItemDescription(a.cached)}` : '',
      failure: a.recentFailure,
    })));
    console.groupEnd();
    copyText(JSON.stringify(snapshot, null, 2)).then(ok => {
      showToast(ok ? 'XFS debug 信息已复制' : 'XFS debug 已输出到 Console', !ok);
    });
    return snapshot;
  }

  async function referralDebugProbe(handle) {
    const key = normalizeHandle(handle);
    if (!key) {
      showToast('XFS debug: 缺少 handle', true);
      return null;
    }
    const before = cachedReferralAccount(key);
    const out = {
      handle: key,
      before,
      cooldownMs: referralCooldownRemaining(),
      recentFailure: recentReferralFailure(key),
      result: null,
      after: null,
      error: null,
    };
    try {
      out.result = await fetchReferralAccount(key, { forceRefresh: true });
    } catch (e) {
      out.error = {
        message: e?.message || String(e),
        status: e?.status || 0,
        retryAfterMs: e?.retryAfterMs || 0,
        rateLimited: !!e?.rateLimited,
      };
    }
    out.after = cachedReferralAccount(key);
    console.log('[XFS DEBUG] referral probe', out);
    copyText(JSON.stringify(out, null, 2)).then(ok => {
      showToast(ok ? `XFS debug @${key} 已复制` : `XFS debug @${key} 已输出到 Console`, !ok);
    });
    return out;
  }

  function exposeDebugTools() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    win.XFS_DEBUG = {
      referral: referralDebugSnapshot,
      probeReferral: referralDebugProbe,
      clearReferralState() {
        referralCache.clear();
        referralFailureCache.clear();
        referralPending.clear();
        referralQueue.length = 0;
        referralHintRefreshDone.clear();
        localStorage.removeItem(LS_REFERRAL_COOLDOWN_UNTIL);
        saveReferralCache();
        showToast('XFS referral cache/cooldown 已清空', false);
        return true;
      },
    };
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
  function getRegexHits(text, patterns, target = 'both') {
    const hits = [];
    for (const { pat, scope, re } of compiledRegexes(patterns)) {
      if (scope !== 'both' && target !== 'both' && scope !== target) continue;
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
    const nameReHits = getRegexHits(displayName, SUSPECT_RE_KWS, 'name').map(h => ({ ...h, snippet: `昵称: ${h.snippet}` }));
    const bodyReHits = getRegexHits(fullText, SUSPECT_RE_KWS, 'body');
    const reHits     = [...nameReHits, ...bodyReHits];
    const cats = new Set();
    if (heartHits.length  > 0) cats.add('heart');
    if (nameKwHits.length > 0) cats.add('name_kw');
    if (kwHits.length     > 0) cats.add('suspect');
    if (reHits.length     > 0) cats.add('regex_kw');
    return { matched: cats.size > 0, cats, heartHits, nameKwHits, kwHits, reHits };
  }

  const HIDE_RULE_STATS_KEY = 'hide_rule_hit_stats_v1';
  const HIDE_RULE_TYPE_LABELS = {
    name: '用户名关键词',
    content: '内容关键词',
    regex: '正则',
  };

  function hideRuleStatItems(matchInfo) {
    const seen = new Set();
    const out = [];
    const add = (type, key) => {
      const value = String(key || '').trim();
      const id = `${type}\n${value}`;
      if (!value || seen.has(id)) return;
      seen.add(id);
      out.push({ type, key: value });
    };
    (matchInfo.nameKwHits || []).forEach(kw => add('name', kw));
    (matchInfo.kwHits || []).forEach(hit => add('content', hit.kw));
    (matchInfo.reHits || []).forEach(hit => add('regex', hit.pat));
    return out;
  }

  function setArticleHideRuleStats(art, matchInfo) {
    const items = hideRuleStatItems(matchInfo);
    if (items.length) art.dataset.xfsHideRuleStats = JSON.stringify(items);
    else delete art.dataset.xfsHideRuleStats;
  }

  function loadHideRuleStats() {
    const raw = GM_getValue(HIDE_RULE_STATS_KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function incrementHideRuleStatsFromArticle(art) {
    if (art.dataset.xfsHideStatsRecorded === '1') return;
    let items = [];
    try { items = JSON.parse(art.dataset.xfsHideRuleStats || '[]'); } catch (_) {}
    if (!Array.isArray(items) || items.length === 0) return;
    const stats = loadHideRuleStats();
    items.forEach(item => {
      const type = item?.type;
      const key = String(item?.key || '').trim();
      if (!type || !key) return;
      const id = `${type}\n${key}`;
      const prev = stats[id] && typeof stats[id] === 'object' ? stats[id] : {};
      stats[id] = { type, key, count: Math.max(0, Number(prev.count || 0)) + 1, updatedAt: Date.now() };
    });
    GM_setValue(HIDE_RULE_STATS_KEY, stats);
    art.dataset.xfsHideStatsRecorded = '1';
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
      if (blockedHandles.has(normalizeHandle(handle))) return;

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
      setArticleHideRuleStats(art, { nameKwHits, kwHits, reHits });
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

  async function blockUserCoordinated(handle, csrf, shouldProceed) {
    return navigator.locks.request('xfs-block-lock', async () => {
      if (shouldProceed && !shouldProceed()) return { skipped: true };
      // Jitter computed inside the lock: each block gets a fresh random gap.
      // localStorage timestamp reflects the actual gap used, so cross-tab
      // coordination sees the same effective rate regardless of which tab ran last.
      const gap     = BLOCK_DELAY + Math.floor(Math.random() * BLOCK_JITTER);
      const elapsed = Date.now() - parseInt(localStorage.getItem(LS_LAST_BLOCK) || '0', 10);
      if (elapsed < gap) await sleep(gap - elapsed);
      if (shouldProceed && !shouldProceed()) return { skipped: true };
      localStorage.setItem(LS_LAST_BLOCK, String(Date.now()));
      await blockUser(handle, csrf);
      return { skipped: false };
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
        if (normalizeHandle(sp.textContent.trim()) === normalizeHandle(handle)) { isMatch = true; break; }
      }
      if (!isMatch) return;
      art.dataset.xfsHideMatched = '0';
      art.dataset.xfsReferralAccount = '0';
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
        if (normalizeHandle(sp.textContent.trim()) === normalizeHandle(handle)) { isMatch = true; break; }
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
    referralHot: '#f59e0b',
  };

  const CAT_META = {
    heart:    { label: '心形 Emoji 用户名',  color: C.heart },
    name_kw:  { label: '用户名关键词',       color: C.nameKw },
    suspect:  { label: '可疑关键词',         color: C.suspect },
    regex_kw: { label: '正则匹配',           color: C.regexKw },
    liker:    { label: '列表用户',           color: C.mute },
    referral: { label: '导流号',             color: C.referral },
  };

  function showHideRuleStatsPanel() {
    document.getElementById('xfs-rule-stats-panel')?.remove();
    const stats = Object.values(loadHideRuleStats())
      .filter(item => item && item.key && Number(item.count) > 0)
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
    const total = stats.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const max = Math.max(1, ...stats.map(item => Number(item.count || 0)));

    const panel = document.createElement('div');
    panel.id = 'xfs-rule-stats-panel';
    panel.style.cssText = [
      'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
      'width:min(760px, calc(100vw - 32px))',
      'max-height:min(78vh, 720px)', 'overflow:hidden',
      'background:rgba(255,255,255,0.98)', `color:${C.text}`,
      `border:1px solid ${C.border}`, 'border-radius:10px',
      'box-shadow:0 18px 50px rgba(0,0,0,0.25)',
      `font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`,
      'z-index:2147483647',
      'display:flex', 'flex-direction:column',
    ].join(';');

    const hdr = document.createElement('div');
    hdr.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid ${C.border};`;
    const title = document.createElement('div');
    title.textContent = `隐藏命中统计 · ${formatBlockedCount(total)}`;
    title.style.cssText = 'flex:1;font-size:13px;font-weight:800;';
    const note = document.createElement('div');
    note.textContent = '本地统计，重复打开同一帖子会重复计数';
    note.style.cssText = `font-size:10px;color:${C.sub};`;
    const reset = document.createElement('button');
    reset.textContent = '清零';
    reset.style.cssText = `border:1px solid ${C.btnBorder};background:#fff;color:${C.sub};border-radius:7px;padding:3px 8px;font-size:11px;cursor:pointer;`;
    reset.onclick = () => {
      if (!window.confirm('清空隐藏命中统计？')) return;
      GM_setValue(HIDE_RULE_STATS_KEY, {});
      panel.remove();
      showToast('隐藏命中统计已清空', false);
    };
    const close = document.createElement('button');
    close.textContent = '×';
    close.style.cssText = `border:none;background:transparent;color:${C.sub};font-size:18px;line-height:1;cursor:pointer;padding:0 4px;`;
    close.onclick = () => panel.remove();
    hdr.appendChild(title);
    hdr.appendChild(note);
    hdr.appendChild(reset);
    hdr.appendChild(close);

    const body = document.createElement('div');
    body.style.cssText = 'overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px;';
    if (stats.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '还没有统计数据。开启隐藏后，命中的内容规则会在这里累计。';
      empty.style.cssText = `padding:28px;text-align:center;color:${C.sub};font-size:12px;`;
      body.appendChild(empty);
    } else {
      stats.forEach(item => {
        const type = item.type || 'content';
        const color = type === 'name' ? C.nameKw : (type === 'regex' ? C.regexKw : C.suspect);
        const count = Number(item.count || 0);
        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:86px minmax(0,1fr) 64px;gap:8px;align-items:center;font-size:11px;`;
        const typeEl = document.createElement('div');
        typeEl.textContent = HIDE_RULE_TYPE_LABELS[type] || type;
        typeEl.style.cssText = `color:${color};font-weight:700;white-space:nowrap;`;
        const mid = document.createElement('div');
        mid.style.cssText = 'min-width:0;';
        const key = document.createElement('div');
        key.textContent = item.key;
        key.title = item.key;
        key.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px;';
        const barWrap = document.createElement('div');
        barWrap.style.cssText = `height:7px;background:${C.border};border-radius:999px;overflow:hidden;`;
        const bar = document.createElement('div');
        bar.style.cssText = `height:100%;width:${Math.max(3, Math.round(count / max * 100))}%;background:${color};border-radius:999px;`;
        barWrap.appendChild(bar);
        mid.appendChild(key);
        mid.appendChild(barWrap);
        const countEl = document.createElement('div');
        countEl.textContent = formatBlockedCount(count);
        countEl.style.cssText = `text-align:right;color:${C.text};font-weight:800;font-variant-numeric:tabular-nums;`;
        row.appendChild(typeEl);
        row.appendChild(mid);
        row.appendChild(countEl);
        body.appendChild(row);
      });
    }

    panel.appendChild(hdr);
    panel.appendChild(body);
    document.body.appendChild(panel);
  }

  function showPanel(allUsers, opts = {}) {
    document.getElementById('xfs-panel')?.remove();
    document.getElementById('xfs-panel-dock')?.remove();

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
    const ROW_H = 34;
    const estBodyH = Math.max(200, window.innerHeight - 160); // 160 = top offset + hdr + kwBar + ftr
    const rowsPerCol = Math.max(6, Math.floor(estBodyH / ROW_H));
    const colsNeeded = ordered.length === 0 ? 2
      : Math.min(3, Math.max(2, Math.ceil(ordered.length / rowsPerCol)));
    const COL_W = 260;
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

    const countBadge = document.createElement('span');
    countBadge.className = 'xfs-persistent-blocked-count';
    countBadge.textContent = `累计 ${formatBlockedCount(persistentBlockedCount)}`;
    countBadge.title = '仅供参考：这是 XFS 脚本累计成功屏蔽数，不是 X 平台全部已屏蔽账号数。只从该统计功能上线后开始记录，保存在本地，不受脚本更新影响。';
    countBadge.style.cssText = `font-size:10px;color:${C.mute};background:${C.mute}12;border:1px solid ${C.mute}55;border-radius:999px;padding:1px 6px;white-space:nowrap;`;

    const authDot = document.createElement('span');
    authDot.title = liveBearer ? 'Auth token captured from page' : 'Using fallback token';
    authDot.textContent = liveBearer ? 'auth ok' : 'auth?';
    authDot.style.cssText = `font-size:10px;padding:1px 5px;border-radius:8px;background:${liveBearer ? '#d4edda' : '#fff3cd'};color:${liveBearer ? '#155724' : '#856404'};`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:16px;color:${C.sub};padding:0 2px;line-height:1;`;
    closeBtn.onclick = () => panel.remove();

    const dockBtn = document.createElement('button');
    dockBtn.textContent = '收起';
    dockBtn.title = '收起到左侧进度条';
    dockBtn.style.cssText = `background:#fff;border:1px solid ${C.btnBorder};border-radius:8px;cursor:pointer;font-size:10px;color:${C.sub};padding:1px 6px;white-space:nowrap;`;

    hdr.appendChild(title);
    hdr.appendChild(badge);
    hdr.appendChild(countBadge);
    hdr.appendChild(authDot);
    hdr.appendChild(dockBtn);
    hdr.appendChild(closeBtn);

    // ── Keyword management bar ──
    const kwBar = document.createElement('div');
    kwBar.id = 'xfs-kw-bar';
    kwBar.style.cssText = [
      'position:absolute', 'top:42px', 'left:12px', 'right:12px',
      'box-sizing:border-box',
      'max-height:min(72vh, calc(100vh - 125px))',
      'overflow:auto',
      `padding:10px 12px`, `border:1px solid ${C.border}`,
      'border-radius:10px',
      'display:flex', 'flex-direction:column', 'gap:8px',
      'background:rgba(255,255,255,0.98)',
      'box-shadow:0 8px 22px rgba(0,0,0,0.16)',
      'z-index:2',
    ].join(';');

    let regexRulesOpen = false;
    function renderKwBar() {
      kwBar.innerHTML = '';
      const rowCss = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
      const refreshKwPanel = () => renderKwBar();
      const toolsRow = document.createElement('div');
      toolsRow.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:6px;min-height:28px;';
      const exportBtn = document.createElement('button');
      exportBtn.textContent = '导出自定义';
      exportBtn.title = '只复制手动添加的自定义关键词 JSON，不包含系统预设';
      exportBtn.style.cssText = `background:#fff;color:${C.text};border:1px solid ${C.btnBorder};border-radius:8px;padding:4px 10px;font-size:12px;line-height:18px;font-weight:600;cursor:pointer;`;
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

      // ── Row 1: Content keywords ──
      const textRow = document.createElement('div');
      textRow.style.cssText = rowCss;
      const textLbl = document.createElement('span');
      textLbl.textContent = '内容:';
      textLbl.style.cssText = `font-size:10px;color:${C.sub};flex-shrink:0;min-width:36px;`;
      textRow.appendChild(textLbl);
      SUSPECT_KWS.forEach((kw, i) => {
        const chip = document.createElement('span');
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:2px 6px;background:#fff;border:1px solid ${C.btnBorder};border-radius:10px;font-size:10px;color:${C.text};`;
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
      inp.style.cssText = `border:1px solid ${C.btnBorder};border-radius:10px;padding:5px 9px;font-size:10px;width:150px;min-width:150px;outline:none;`;
      const addKw = () => {
        const v = inp.value.trim();
        if (v && !SUSPECT_KWS.includes(v)) { SUSPECT_KWS.push(v); saveKws(); refreshKwPanel(); }
        else inp.value = '';
      };
      inp.onkeydown = e => { if (e.key === 'Enter') addKw(); };
      textRow.appendChild(inp);
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.style.cssText = `background:${C.blockRed};color:#fff;border:none;border-radius:10px;padding:4px 10px;font-size:11px;cursor:pointer;`;
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
        chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:2px 6px;background:#fff;border:1px solid ${C.nameKw};border-radius:10px;font-size:10px;color:${C.nameKw};`;
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
      nInp.style.cssText = `border:1px solid ${C.nameKw};border-radius:10px;padding:5px 9px;font-size:10px;width:150px;min-width:150px;outline:none;`;
      const addNKw = () => {
        const v = nInp.value.trim();
        if (v && !SUSPECT_NAME_KWS.includes(v)) { SUSPECT_NAME_KWS.push(v); saveKws(); refreshKwPanel(); }
        else nInp.value = '';
      };
      nInp.onkeydown = e => { if (e.key === 'Enter') addNKw(); };
      nameRow.appendChild(nInp);
      const addNBtn = document.createElement('button');
      addNBtn.textContent = '+';
      addNBtn.style.cssText = `background:${C.nameKw};color:#fff;border:none;border-radius:10px;padding:4px 10px;font-size:11px;cursor:pointer;`;
      addNBtn.onclick = addNKw;
      nameRow.appendChild(addNBtn);
      kwBar.appendChild(nameRow);
      kwBar.appendChild(textRow);

      // ── Row 3: RegEx patterns ──
      const reSection = document.createElement('div');
      reSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      const reHeader = document.createElement('div');
      reHeader.style.cssText = rowCss;
      const reToggle = document.createElement('button');
      reToggle.type = 'button';
      reToggle.textContent = regexRulesOpen ? '▾' : '▸';
      reToggle.title = regexRulesOpen ? '收起正则规则' : '展开正则规则';
      reToggle.style.cssText = `width:20px;height:20px;padding:0;border:1px solid ${C.regexKw};border-radius:7px;background:#fff;color:${C.regexKw};font-size:12px;font-weight:800;line-height:18px;cursor:pointer;`;
      reToggle.onclick = () => { regexRulesOpen = !regexRulesOpen; refreshKwPanel(); };
      const reLbl = document.createElement('span');
      reLbl.textContent = `正则 (${SUSPECT_RE_KWS.length})`;
      reLbl.style.cssText = `font-size:10px;color:${C.regexKw};font-weight:700;flex-shrink:0;`;
      const reTip = document.createElement('span');
      reTip.textContent = '?';
      reTip.title = '正则很有效，懂的话可以新增；不懂建议别删，删除会明显削弱匹配。';
      reTip.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid ${C.regexKw};border-radius:50%;font-size:10px;font-weight:700;color:${C.regexKw};cursor:help;`;
      reHeader.appendChild(reToggle);
      reHeader.appendChild(reLbl);
      reHeader.appendChild(reTip);
      reSection.appendChild(reHeader);
      if (regexRulesOpen) {
        const reRow = document.createElement('div');
        reRow.style.cssText = rowCss;
        SUSPECT_RE_KWS.forEach((pat, i) => {
          const chip = document.createElement('span');
          chip.title = pat;
          chip.style.cssText = `display:inline-flex;align-items:center;gap:2px;padding:2px 6px;background:#fff;border:1px solid ${C.regexKw};border-radius:10px;font-size:10px;color:${C.regexKw};max-width:360px;`;
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
        reInp.title = '输入 JS 正则表达式（不含 / 分隔符），flags: mu 自动加入；可加 content: 或 name: 限定匹配范围';
        reInp.style.cssText = `border:1px solid ${C.regexKw};border-radius:10px;padding:5px 9px;font-size:10px;width:260px;min-width:220px;outline:none;`;
        const addRe = () => {
          const v = reInp.value.trim();
          if (!v) return;
          const parsed = _regexPatternParts(v);
          try { if (!parsed.pat) throw new Error('empty regex'); new RegExp(parsed.pat, 'mu'); } catch (_) { reInp.style.borderColor = C.blockRed; return; }
          reInp.style.borderColor = C.regexKw;
          if (!SUSPECT_RE_KWS.includes(v)) { SUSPECT_RE_KWS.push(v); saveKws(); refreshKwPanel(); }
          else reInp.value = '';
        };
        reInp.onkeydown = e => { if (e.key === 'Enter') addRe(); };
        reInp.oninput   = () => {
          const v = reInp.value.trim();
          if (!v) { reInp.style.borderColor = C.regexKw; return; }
          const parsed = _regexPatternParts(v);
          try { if (!parsed.pat) throw new Error('empty regex'); new RegExp(parsed.pat, 'mu'); reInp.style.borderColor = C.regexKw; }
          catch (_) { reInp.style.borderColor = C.blockRed; }
        };
        reRow.appendChild(reInp);
        const addReBtn = document.createElement('button');
        addReBtn.textContent = '+';
        addReBtn.style.cssText = `background:${C.regexKw};color:#fff;border:none;border-radius:10px;padding:4px 10px;font-size:11px;cursor:pointer;`;
        addReBtn.onclick = addRe;
        reRow.appendChild(addReBtn);
        const statsBtn = document.createElement('button');
        statsBtn.textContent = '统计';
        statsBtn.title = '查看每条内容规则累计隐藏了多少次回复';
        statsBtn.style.cssText = `margin-left:auto;border:1px solid ${C.btnBorder};background:#fff;color:${C.sub};border-radius:8px;padding:3px 7px;font-size:10px;cursor:pointer;`;
        statsBtn.onclick = showHideRuleStatsPanel;
        reRow.appendChild(statsBtn);
        reSection.appendChild(reRow);
      }
      kwBar.appendChild(reSection);
    }
    renderKwBar();
    kwBar.style.display = opts.keywordsOpen ? 'flex' : 'none'; // popup, collapsed by default

    // Toggle button — inserted into hdr before the × close button
    const kwToggle = document.createElement('button');
    kwToggle.textContent = opts.keywordsOpen ? '关键词 ×' : '关键词';
    kwToggle.style.cssText = `background:none;border:1px solid ${C.btnBorder};border-radius:8px;cursor:pointer;font-size:10px;color:${C.sub};padding:1px 6px;white-space:nowrap;`;
    kwToggle.onclick = () => {
      const nowHidden = kwBar.style.display === 'none';
      kwBar.style.display = nowHidden ? 'flex' : 'none';
      kwToggle.textContent = nowHidden ? '关键词 ×' : '关键词';
    };
    hdr.insertBefore(kwToggle, closeBtn);

    let dockIndicator = null;
    let dockIndicatorLabel = null;
    let dockCaption = null;
    let dockRestoreBtn = null;
    let dockRefreshBtn = null;
    let dockRefreshVisible = false;
    let dockStatusText = '';
    function dockText() {
      return blockBtn?.textContent || badge.textContent || 'XFS';
    }
    function compactDockText(text) {
      const s = String(text || '').trim();
      const progress = s.match(/\d+\s*\/\s*\d+(?:\s*\(\d+失败\))?/);
      if (progress) return progress[0].replace(/\s+/g, '');
      const checked = s.match(/屏蔽\s*\((\d+)\)/);
      if (checked) return `屏蔽${checked[1]}`;
      const done = s.match(/完成\s*(\d+)/);
      if (done) return `完成${done[1]}`;
      return s.length > 12 ? `${s.slice(0, 12)}...` : s;
    }
    function updateDockIndicator(text = dockText(), opts = {}) {
      dockStatusText = text;
      if ('showRefresh' in opts) dockRefreshVisible = !!opts.showRefresh;
      if (!dockIndicator) return;
      if (dockIndicatorLabel) dockIndicatorLabel.textContent = compactDockText(text);
      if (dockRefreshBtn) dockRefreshBtn.style.display = dockRefreshVisible ? 'flex' : 'none';
      dockIndicator.title = `X Fraud Scanner · ${text}`;
    }
    function openDockIndicator() {
      document.getElementById('xfs-panel-dock')?.remove();
      dockIndicator = document.createElement('div');
      dockIndicator.id = 'xfs-panel-dock';
      dockIndicator.style.cssText = [
        'position:fixed', 'left:0', 'top:92px',
        'width:90px', 'box-sizing:border-box',
        'max-height:calc(100vh - 128px)',
        'background:rgba(255,255,255,0.72)', `color:${C.text}`,
        'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
        `border:1px solid rgba(207,217,222,0.58)`, 'border-left:none',
        'border-radius:0 10px 10px 0',
        'box-shadow:1px 0 8px rgba(0,0,0,0.10)',
        'font-size:11px', 'font-weight:700', 'line-height:1.25',
        'padding:10px',
        'display:flex', 'flex-direction:column', 'align-items:center', 'gap:8px',
        'z-index:2147483647',
        `font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`,
        'white-space:normal', 'overflow:hidden',
      ].join(';');
      const closeDockBtn = document.createElement('button');
      closeDockBtn.type = 'button';
      closeDockBtn.textContent = '\u00d7';
      closeDockBtn.title = '关闭进度提示，后台继续执行';
      closeDockBtn.style.cssText = [
        'flex-shrink:0',
        'width:18px', 'height:18px', 'line-height:1',
        'padding:0', 'border:none', 'border-radius:8px',
        'background:rgba(15,20,25,0.06)', `color:${C.sub}`,
        'font-size:12px', 'font-weight:700',
        'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
        'appearance:none', '-webkit-appearance:none',
      ].join(';');
      closeDockBtn.onclick = e => {
        e.stopPropagation();
        dockIndicator.remove();
        dockIndicator = null;
        dockIndicatorLabel = null;
        dockCaption = null;
        dockRestoreBtn = null;
        dockRefreshBtn = null;
      };
      const dockTop = document.createElement('div');
      dockTop.style.cssText = [
        'width:calc(100% + 20px)', 'box-sizing:border-box',
        'margin:-10px -10px 0', 'padding:6px 8px',
        'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:6px',
        'background:rgba(15,20,25,0.035)',
        `border-bottom:1px solid rgba(207,217,222,0.48)`,
        'border-radius:0 9px 0 0',
      ].join(';');
      dockCaption = document.createElement('div');
      dockCaption.textContent = '扫描面板';
      dockCaption.style.cssText = [
        `flex:1;color:${C.sub};opacity:0.78`,
        'font-size:10px', 'font-weight:700', 'line-height:1',
        'text-align:left', 'white-space:nowrap', 'overflow:hidden',
      ].join(';');
      dockIndicatorLabel = document.createElement('div');
      dockIndicatorLabel.style.cssText = [
        `color:${C.text}`, 'font:inherit', 'text-align:center',
        'width:100%', 'min-height:16px', 'overflow:hidden', 'overflow-wrap:anywhere',
      ].join(';');
      const dockActions = document.createElement('div');
      dockActions.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;width:100%;';
      dockRestoreBtn = document.createElement('button');
      dockRestoreBtn.type = 'button';
      dockRestoreBtn.textContent = '恢复面板';
      dockRestoreBtn.title = '恢复扫描结果面板';
      dockRestoreBtn.style.cssText = [
        'background:rgba(15,20,25,0.045)', `color:${C.sub}`,
        `border:1px solid rgba(207,217,222,0.66)`, 'border-radius:7px',
        'font-size:11px', 'font-weight:700', 'line-height:1',
        'width:70px', 'height:25px', 'padding:0', 'cursor:pointer',
        'box-sizing:border-box', 'text-align:center', 'white-space:nowrap',
        'display:flex', 'align-items:center', 'justify-content:center',
        'appearance:none', '-webkit-appearance:none',
      ].join(';');
      dockRestoreBtn.onclick = e => {
        e.stopPropagation();
        panel.style.display = 'flex';
        panelDockedActive = false;
        GM_setValue('panel_docked', false);
        dockIndicator.remove();
        dockIndicator = null;
        dockIndicatorLabel = null;
        dockCaption = null;
        dockRestoreBtn = null;
        dockRefreshBtn = null;
      };
      dockRefreshBtn = document.createElement('button');
      dockRefreshBtn.type = 'button';
      dockRefreshBtn.textContent = '刷新';
      dockRefreshBtn.title = '刷新页面';
      dockRefreshBtn.style.cssText = [
        'display:none',
        'background:rgba(15,20,25,0.045)', `color:${C.sub}`,
        `border:1px solid rgba(207,217,222,0.66)`, 'border-radius:7px',
        'font-size:11px', 'font-weight:700', 'line-height:1',
        'width:70px', 'height:25px', 'padding:0', 'cursor:pointer',
        'box-sizing:border-box', 'text-align:center', 'white-space:nowrap',
        'align-items:center', 'justify-content:center',
        'appearance:none', '-webkit-appearance:none',
      ].join(';');
      dockRefreshBtn.onclick = e => {
        e.stopPropagation();
        location.reload();
      };
      dockTop.appendChild(dockCaption);
      dockTop.appendChild(closeDockBtn);
      dockIndicator.appendChild(dockTop);
      dockIndicator.appendChild(dockIndicatorLabel);
      dockActions.appendChild(dockRestoreBtn);
      dockActions.appendChild(dockRefreshBtn);
      dockIndicator.appendChild(dockActions);
      updateDockIndicator(dockStatusText || dockText(), { showRefresh: dockRefreshVisible });
      document.body.appendChild(dockIndicator);
    }
    dockBtn.onclick = () => {
      kwBar.style.display = 'none';
      kwToggle.textContent = '关键词';
      panelDockedActive = true;
      GM_setValue('panel_docked', true);
      panel.style.display = 'none';
      openDockIndicator();
    };

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
        row.style.cssText = `display:flex;align-items:flex-start;gap:4px;padding:1px 5px 1px 4px;cursor:pointer;border-bottom:1px solid ${C.border};border-left:3px solid ${color};line-height:1.18;`;
        row.onmouseenter = () => { if (!row.dataset.blocked) row.style.background = C.rowHover; };
        row.onmouseleave = () => { if (!row.dataset.blocked) row.style.background = ''; };

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = opts.precheck !== false;
        cb.style.cssText = 'width:11px;height:11px;margin-top:2px;flex-shrink:0;cursor:pointer;accent-color:#f4212e;';
        allCheckboxes.push({ cb, handle: user.handle, row });

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        let html = `<div class="xfs-name" style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(user.displayName)}</div>`;
        html += `<div style="color:${C.sub};font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${esc(user.handle)}</div>`;
        if (user.cats.has('heart') && user.heartHits && user.heartHits.length > 0) {
          html += `<div style="font-size:9px;color:${C.heart};">[心形] ${esc(user.heartHits.join(''))} 在用户名中</div>`;
        }
        if (user.cats.has('name_kw') && user.nameKwHits && user.nameKwHits.length > 0) {
          user.nameKwHits.forEach(kw => {
            html += `<div style="font-size:9px;color:${C.nameKw};">[用户名] ${esc(kw)}</div>`;
          });
        }
        // For name/heart matches show first 10 words of the tweet so users can
        // quickly judge borderline cases without opening the tweet.
        if ((user.cats.has('heart') || user.cats.has('name_kw')) && user.tweetSnippet) {
          html += `<div style="font-size:9px;color:${C.sub};font-style:italic;word-break:break-all;">"${esc(user.tweetSnippet)}"</div>`;
        }
        if (user.cats.has('suspect') && user.kwHits.length > 0) {
          user.kwHits.forEach(h => {
            html += `<div style="font-size:9px;color:${C.suspect};word-break:break-all;">[${esc(h.kw)}] ${esc(h.snippet)}</div>`;
          });
        }
        if (user.cats.has('regex_kw') && user.reHits && user.reHits.length > 0) {
          user.reHits.forEach(h => {
            const label = h.pat.length > 18 ? h.pat.slice(0, 18) + '…' : h.pat;
            html += `<div style="font-size:9px;color:${C.regexKw};word-break:break-all;" title="${esc(h.pat)}">[re: ${esc(label)}] ${esc(h.snippet)}</div>`;
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
    hint.textContent = '清理完成 · 点击完成按钮刷新页面';

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
    let blockingInProgress = false;
    let blockingComplete = false;

    allCheckboxes.forEach(({ cb }) => {
      cb.addEventListener('change', () => {
        if (!blockingInProgress && !blockingComplete) blockBtn.textContent = `屏蔽 (${checkedCount()})`;
      });
    });

    async function startBlocking() {
      if (blockBtn.disabled) return;
      const uniqueHandles = [...new Set(allCheckboxes.filter(({ cb }) => cb.checked).map(({ handle }) => handle))];
      const isHandleStillChecked = handle => {
        const key = normalizeHandle(handle);
        return allCheckboxes.some(item => normalizeHandle(item.handle) === key && item.cb.checked);
      };
      let done = 0, failed = 0, skipped = 0;
      try {
        if (uniqueHandles.length === 0) return;

        const csrf = getCsrf();
        if (!csrf) { alert('未找到登录凭证（ct0 cookie），请确认已登录 X/Twitter'); return; }

        stopBackgroundLoad = true;  // stop background scroll so page stays put
        blockingInProgress = true;
        blockBtn.disabled = true;
        selBtn.disabled = true;

        const rowMap = new Map();
        allCheckboxes.forEach(({ handle, row }) => {
          if (!rowMap.has(handle)) rowMap.set(handle, []);
          rowMap.get(handle).push(row);
        });

        for (const handle of uniqueHandles) {
          if (!isHandleStillChecked(handle)) {
            skipped++;
            blockBtn.textContent = `${done + skipped}/${uniqueHandles.length}${failed ? ` (${failed}失败)` : ''}`;
            updateDockIndicator();
            continue;
          }
          blockBtn.textContent = `⏳ ${done + skipped + failed + 1}/${uniqueHandles.length}`;
          updateDockIndicator();
          try {
            const result = await blockUserCoordinated(handle, csrf, () => isHandleStillChecked(handle));
            if (result?.skipped) {
              skipped++;
              blockBtn.textContent = `${done + skipped}/${uniqueHandles.length}${failed ? ` (${failed}失败)` : ''}`;
              updateDockIndicator();
              continue;
            }
            done++;
            incrementPersistentBlockedCount(1);
            blockedHandles.add(handle);
            blockedHandles.add(normalizeHandle(handle));
            matchedHandlesInView.delete(handle);
            matchedHandlesInView.delete(normalizeHandle(handle));
            matchedUsersCache.delete(handle);
            matchedUsersCache.delete(normalizeHandle(handle));
            updateHideBadge();
            dimArticlesByHandle(handle);
            updateReferralBadge();
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
          blockBtn.textContent = `${done + skipped}/${uniqueHandles.length}${failed ? ` (${failed}失败)` : ''}`;
          updateDockIndicator();
        }

        blockingComplete = true;
        blockingInProgress = false;
        blockBtn.disabled = false;
        blockBtn.textContent = `完成 ${done}${skipped ? `，跳过 ${skipped}` : ''}${failed ? `，${failed} 失败` : ''}，点击刷新`;
        blockBtn.title = '清理完成，点击刷新页面';
        blockBtn.onclick = () => location.reload();
        badge.textContent = `完成 ${done} 个${skipped ? `，跳过 ${skipped} 个` : ''}${failed ? `，失败 ${failed} 个` : ''}`;
        updateDockIndicator(badge.textContent, { showRefresh: true });
        hint.style.display = '';
        markCleanupButtonsComplete(opts.refreshButtonIds);
      } finally {
        blockingInProgress = false;
        opts.onBlockDone?.({ done, failed, skipped, total: uniqueHandles.length });
      }
    }

    blockBtn.onclick = startBlocking;

    ftr.appendChild(deselBtn);
    ftr.appendChild(selBtn);
    ftr.appendChild(blockBtn);

    const rateNote = document.createElement('div');
    rateNote.style.cssText = `padding:3px 12px 5px;font-size:10px;color:${C.sub};text-align:center;flex-shrink:0;opacity:0.6;background:${C.catBg};`;
    rateNote.textContent = 'X.com 限制：每次屏蔽间隔 3-5 秒 · 执行中可取消勾选，未开始的账号会跳过';

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
    scriptFtr.appendChild(document.createTextNode(' · '));
    const xBlockedLink = document.createElement('a');
    xBlockedLink.textContent = 'X 已屏蔽账号';
    xBlockedLink.href = 'https://x.com/settings/blocked/all';
    xBlockedLink.target = '_blank';
    xBlockedLink.rel = 'noopener noreferrer';
    xBlockedLink.style.cssText = `color:${C.sub};text-decoration:underline;`;
    scriptFtr.appendChild(xBlockedLink);

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
      document.getElementById('xfs-panel-dock')?.remove();
      dockIndicator = null;
      dockIndicatorLabel = null;
      dockCaption = null;
      dockRestoreBtn = null;
      dockRefreshBtn = null;
      document.removeEventListener('keydown', onEsc);
    };
    const onEsc = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', onEsc);
    closeBtn.onclick = closePanel;

    // Set colContainer to the measured pixel height so column-fill:auto works.
    // Must happen after panel is in DOM so clientHeight is non-zero.
    requestAnimationFrame(() => {
      colContainer.style.height = body.clientHeight + 'px';
      if (panelDockedActive) {
        kwBar.style.display = 'none';
        kwToggle.textContent = '关键词';
        panel.style.display = 'none';
        openDockIndicator();
      }
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

  function scanModeLabel(mode) {
    return {
      content: '内容扫描',
      referral: '导流扫描',
      sweep: '整页扫描',
      list: '列表扫描',
    }[mode] || '扫描';
  }

  function updateScanButtonsLocked() {
    ['xfs-btn', 'xfs-referral-scan-btn', 'xfs-sweep-btn', 'xfs-list-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (activeScanMode) {
        if (!btn.dataset.xfsPrevTitle) btn.dataset.xfsPrevTitle = btn.title || '';
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.title = `${scanModeLabel(activeScanMode)}正在执行`;
      } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        if (btn.dataset.xfsPrevTitle != null) {
          if (btn.textContent !== DONE_SVG) btn.title = btn.dataset.xfsPrevTitle;
          delete btn.dataset.xfsPrevTitle;
        }
      }
    });
  }

  function beginScanMode(mode) {
    if (activeScanMode) {
      showToast(`${scanModeLabel(activeScanMode)}正在执行，请稍后再试`, true);
      return false;
    }
    activeScanMode = mode;
    updateScanButtonsLocked();
    return true;
  }

  function endScanMode(mode, force = false) {
    if (!force && activeScanMode !== mode) return;
    activeScanMode = '';
    updateScanButtonsLocked();
  }

  // ── Quick scan: show current DOM and immediately block checked users ──
  async function autoLoadAndScan() {
    if (!beginScanMode('content')) return;
    try {
      stopBackgroundLoad = true;
      const btn = document.getElementById('xfs-btn');
      showPanel(scanPage(), {
        autoBlock: true,
        refreshButtonIds: ['xfs-btn'],
        onBlockDone: (stats) => {
          endScanMode('content');
          applyHideAll(); // preserve any existing hidden state after blocking
          if (btn && (!stats || stats.done + stats.failed === 0)) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.title = '当前视图内容垃圾号自动屏蔽';
          }
        },
      });
    } catch (e) {
      endScanMode('content');
      throw e;
    }
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
    if (!beginScanMode('sweep')) return;
    try {
    stopBackgroundLoad = false;
    applyHideAll(); // preserve hidden state during scrolling
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
    applyHideAll(); // keep hide state applied after scanning
    // Merge users found by the hide feature that React may have unloaded from the DOM
    mergeInto(Array.from(matchedUsersCache.values()));
    showPanel(Array.from(acc.values()), { refreshButtonIds: ['xfs-sweep-btn'] });

    if (btn)      { btn.disabled = false; btn.style.opacity = ''; }
    if (sweepBtn) { sweepBtn.disabled = false; sweepBtn.style.opacity = ''; }
    } finally {
      endScanMode('sweep');
    }
  }

  // ── Sweep user list: likes / retweets / followers pages ─────────────
  // Scrolls to the bottom collecting every UserCell handle, then shows
  // the panel for bulk blocking. Pure DOM — no private API calls needed,
  // so it survives X.com endpoint changes.
  async function sweepUserList() {
    if (!beginScanMode('list')) return;
    try {
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
    showPanel(Array.from(acc.values()), { refreshButtonIds: ['xfs-list-btn'] });
    if (listBtn) { listBtn.disabled = false; listBtn.style.opacity = ''; }
    } finally {
      endScanMode('list');
    }
  }

  // ── Floating icon buttons ────────────────────────────────────────────
  // Magnifying glass with crosshair: "targeted scan"
  // User with minus: "block all from likes/retweets/followers list"
  const LIST_SVG      = '👤';  // bulk block from likes/retweets/followers list
  const SCAN_SVG      = '🔍';  // targeted scan current page
  const SWEEP_SVG     = '⚡';  // sweep all replies
  const DONE_SVG      = '✓';  // cleanup complete, click to reload
  const MUTE_SVG      = '🔇';  // mute selected word
  const EYE_SVG       = '👁';  // hide toggle; active state is shown by color/border
  const GEAR_SVG      = '⚙';  // low-frequency tools: keyword import/export
  const COLLAPSE_SVG  = '-';  // collapse the right-side tool stack
  const EXPAND_SVG    = 'XFS';  // restore the right-side tool stack

  // ── Hide helpers ─────────────────────────────────────────────────────
  function applyHideToArticle(art) {
    const shouldHideMatched = hideMatchedActive && art.dataset.xfsHideMatched === '1';
    const shouldHideReferral = hideReferralActive && art.dataset.xfsReferralAccount === '1';
    const shouldHide = shouldHideMatched || shouldHideReferral;
    if (shouldHide && art.dataset.xfsHidden !== '1') {
      if (shouldHideMatched) incrementHideRuleStatsFromArticle(art);
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

  function reapplyContentRulesForVisible() {
    if (!/\/status\/\d/.test(location.pathname) || isListPage()) return;
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      if (art === firstArt) return;
      const handle = art.dataset.xfsReferralHandle || extractHandleFromArticle(art);
      const key = normalizeHandle(handle);
      if (!key) return;
      const displayName = extractDisplayNameFromArticle(art, key) || key;
      const textEl = art.querySelector('[data-testid="tweetText"]');
      const cardEl = art.querySelector('[data-testid="card.wrapper"]');
      const bodyLinkText = [
        ...(textEl ? [...textEl.querySelectorAll('a[href]')] : []),
        ...(cardEl ? [...cardEl.querySelectorAll('a[href]')] : []),
      ].map(a => a.textContent).join(' ');
      const fullText = [textEl ? getTextWithEmoji(textEl) : null, cardEl ? getTextWithEmoji(cardEl) : null, bodyLinkText].filter(Boolean).join(' ');
      const { matched, cats, heartHits, nameKwHits, kwHits, reHits } = matchesFilters(displayName, fullText);
      setArticleHideRuleStats(art, { nameKwHits, kwHits, reHits });
      const alreadyBlocked = blockedHandles.has(key);
      art.dataset.xfsHideMatched = (matched && !alreadyBlocked) ? '1' : '0';
      const btn = art.querySelector(`button[data-xfs-handle]`);
      if (btn) {
        btn.dataset.xfsMatched = (matched && !alreadyBlocked) ? '1' : '0';
        updateInlineBlockButton(btn);
      }
      if (matched && !alreadyBlocked) {
        matchedHandlesInView.add(key);
        matchedUsersCache.set(key, { handle: key, displayName, cats, heartHits: [...heartHits], nameKwHits: [...nameKwHits], kwHits: [...kwHits], reHits: [...reHits], tweetSnippet: '' });
      } else {
        matchedHandlesInView.delete(key);
        matchedUsersCache.delete(key);
      }
    });
    updateHideBadge();
    applyHideAll();
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
    const color = reason === 'referral' ? C.referralHot : C.blockRed;
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

  function scheduleReferralCheck(art, handle, isOP = false, hintText = '') {
    if (!/\/status\/\d/.test(location.pathname) || isListPage()) return;
    const key = normalizeHandle(handle);
    if (!key || isOP) {
      art.dataset.xfsReferralAccount = '0';
      art.dataset.xfsReferralQueued = '0';
      return;
    }
    art.dataset.xfsReferralHandle = key;
    rememberReferralIntentHint(key, hintText || extractDisplayNameFromArticle(art, key));
    const shouldForceRefresh = !!referralIntentHints.get(key) && !referralHintRefreshDone.has(key);

    const cached = cachedReferralAccount(key);
    if (cached !== null && !(shouldForceRefresh && cached.isReferral === false)) {
      applyReferralAccountToArticles(key);
      return;
    }
    if (!autoReferralDetectActive && !hideReferralActive && !youngAccountFilterActive) return;
    if (art.dataset.xfsReferralQueued === '1') return;
    art.dataset.xfsReferralQueued = '1';

    fetchReferralAccount(handle, { forceRefresh: shouldForceRefresh })
      .then(() => {
        if (shouldForceRefresh) referralHintRefreshDone.add(key);
        art.dataset.xfsReferralQueued = '0';
        applyReferralAccountToArticles(key);
      })
      .catch(e => {
        if (shouldForceRefresh && !isReferralRateLimitError(e)) referralHintRefreshDone.add(key);
        art.dataset.xfsReferralQueued = '0';
        if (hideReferralActive) warnReferralLookupFailure(e);
      });
  }

  function applyReferralForVisible() {
    const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
      if (art === firstArt) return;
      const handle = art.dataset.xfsReferralHandle || extractHandleFromArticle(art);
      const key = normalizeHandle(handle);
      if (!key || blockedHandles.has(key)) return;
      scheduleReferralCheck(art, key, false);
    });
    updateReferralBadge();
  }

  async function scanReferralAccountsInView() {
    if (!beginScanMode('referral')) return;
    let handedOffToBlocker = false;
    const progress = showProgressToast('导流号扫描已开始，正在读取当前回复...', C.referralHot);
    try {
      const domReferralHandles = captureReferralAccountsFromProfileDom(document);
      const firstArt = document.querySelectorAll('article[data-testid="tweet"]')[0] || null;
      const handles = [];
      const displayNames = new Map();
      const rememberHandle = (handle, displayName = '') => {
        const key = normalizeHandle(handle);
        if (!key || blockedHandles.has(key)) return;
        if (displayName) displayNames.set(key, displayName);
        if (!handles.includes(key)) handles.push(key);
      };
      document.querySelectorAll('article[data-testid="tweet"]').forEach(art => {
        if (art === firstArt) return;
        const handle = art.dataset.xfsReferralHandle || extractHandleFromArticle(art);
        const key = normalizeHandle(handle);
        const displayName = key ? extractDisplayNameFromArticle(art, key) : '';
        if (key) rememberReferralIntentHint(key, displayName);
        rememberHandle(key, displayName);
      });
      domReferralHandles.forEach(handle => rememberHandle(handle));
      if (handles.length === 0) {
        progress.update('当前视图没有可扫描的回复用户');
        progress.close(1200);
        return;
      }

      let cachedReferralCount = handles.filter(handle => referralReason(handle)).length;
      const unknownHandles = handles.filter(handle => cachedReferralAccount(handle) === null);
      if (unknownHandles.length === 0) {
        progress.update(cachedReferralCount > 0
          ? `已识别 ${cachedReferralCount} 个导流号，无需重复查询`
          : '当前视图没有未检查账号，未发现导流号');
      } else {
        progress.update(cachedReferralCount > 0
          ? `已识别 ${cachedReferralCount} 个导流号，只补查 ${unknownHandles.length} 个未知账号`
          : `正在搜索导流号 0/${unknownHandles.length}`);
      }

      let lookupError = null;
      for (let i = 0; i < unknownHandles.length; i++) {
        const handle = unknownHandles[i];
        progress.update(cachedReferralCount > 0
          ? `已识别 ${cachedReferralCount} 个，补查 ${i + 1}/${unknownHandles.length}`
          : `正在搜索导流号 ${i + 1}/${unknownHandles.length}`);
        try {
          await fetchReferralAccount(handle);
          cachedReferralCount = handles.filter(h => referralReason(h)).length;
        } catch (e) {
          lookupError = lookupError || e;
          if (isReferralRateLimitError(e)) break;
        }
      }
      captureReferralAccountsFromProfileDom(document);
      applyReferralForVisible();
      const users = handles
        .map(handle => {
          const item = cachedReferralAccount(handle);
          return item && item.isReferral ? {
            handle,
            displayName: displayNames.get(handle) || handle,
            cats: new Set(['referral']),
            heartHits: [],
            nameKwHits: [],
            kwHits: [{ kw: item.isYoungAccount && !item.isLinkReferral ? '新号' : '导流号', snippet: referralItemDescription(item) }],
            reHits: [],
            tweetSnippet: referralItemDescription(item),
          } : null;
        })
        .filter(Boolean);
      if (users.length === 0) {
        if (lookupError) {
          progress.update('导流号搜索受限，请稍后再试');
          progress.close(1600);
          warnReferralLookupFailure(lookupError);
        } else {
          progress.update('搜索完成，未发现导流号');
          progress.close(1200);
        }
        return;
      }
      progress.update(unknownHandles.length > 0
        ? `发现 ${users.length} 个导流号，正在自动屏蔽...`
        : `使用已识别的 ${users.length} 个导流号，正在自动屏蔽...`);
      progress.close(900);
      handedOffToBlocker = true;
      showPanel(users, {
        autoBlock: true,
        refreshButtonIds: ['xfs-referral-scan-btn'],
        onBlockDone: () => endScanMode('referral'),
      });
    } finally {
      if (!handedOffToBlocker) endScanMode('referral');
    }
  }

  function updateHideBadge() {
    const badge = document.getElementById('xfs-hide-badge');
    if (!badge) return;
    const n = matchedHandlesInView.size;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'flex' : 'none';
    if (n > 0) resetContentCleanupButtonsIfComplete();
  }

  function updateReferralBadge() {
    const badge = document.getElementById('xfs-referral-badge');
    if (!badge) return;
    const n = document.querySelectorAll('article[data-testid="tweet"][data-xfs-referral-account="1"]').length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'flex' : 'none';
  }

  function formatBlockedCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function updatePersistentBlockedBadge() {
    document.querySelectorAll('.xfs-persistent-blocked-count').forEach(badge => {
      badge.textContent = `累计 ${formatBlockedCount(persistentBlockedCount)}`;
      badge.title = '仅供参考：这是 XFS 脚本累计成功屏蔽数，不是 X 平台全部已屏蔽账号数。只从该统计功能上线后开始记录，保存在本地，不受脚本更新影响。';
    });
  }

  function incrementPersistentBlockedCount(n = 1) {
    const inc = Math.max(0, parseInt(n, 10) || 0);
    if (!inc) return;
    persistentBlockedCount += inc;
    GM_setValue('persistent_blocked_count', persistentBlockedCount);
    updatePersistentBlockedBadge();
  }

  const TOOLBAR_DEFAULT_RIGHT = 18;
  const TOOLBAR_BASE_BOTTOM = 160;

  function clampToolbarPosition() {
    const maxRight = Math.max(8, window.innerWidth - 44);
    toolbarRight = Math.min(Math.max(8, Number(toolbarRight) || TOOLBAR_DEFAULT_RIGHT), maxRight);
    const maxBottom = Math.max(24, window.innerHeight - 292);
    toolbarBaseBottom = Math.min(Math.max(24, Number(toolbarBaseBottom) || TOOLBAR_BASE_BOTTOM), maxBottom);
  }

  function toolbarRightPx(delta = 0) {
    clampToolbarPosition();
    return `${toolbarRight + delta}px`;
  }

  function toolbarBottomPx(bottom) {
    clampToolbarPosition();
    return `${toolbarBaseBottom + (bottom - TOOLBAR_BASE_BOTTOM)}px`;
  }

  function setToolbarPosition(el, bottom, rightDelta = 0) {
    if (!el) return;
    el.style.right = toolbarRightPx(rightDelta);
    el.style.bottom = toolbarBottomPx(bottom);
  }

  function updateToolbarPositions() {
    [
      ['xfs-stack-toggle-btn', 160, 0],
      ['xfs-gear-btn', 200, 0],
      ['xfs-referral-scan-btn', 240, 0],
      ['xfs-referral-btn', 280, 0],
      ['xfs-sweep-btn', 320, 0],
      ['xfs-btn', 360, 0],
      ['xfs-hide-btn', 400, 0],
      ['xfs-btn-backdrop', 196, -4],
      ['xfs-btn-section-settings', 200, -2],
      ['xfs-btn-section-referral', 236, -2],
      ['xfs-btn-section-content', 316, -2],
      ['xfs-btn-sep-1', 302, 2],
      ['xfs-btn-sep-2', 226, 2],
      ['xfs-tools-panel', 166, 40],
    ].forEach(([id, bottom, rightDelta]) => setToolbarPosition(document.getElementById(id), bottom, rightDelta));
  }

  function saveToolbarPosition() {
    clampToolbarPosition();
    GM_setValue('toolbar_right', toolbarRight);
    GM_setValue('toolbar_base_bottom', toolbarBaseBottom);
  }

  function mkIconBtn(id, svg, title, bottom, color, onclick) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = svg;
    b.title = title;
    b.style.cssText = [
      'position:fixed', `bottom:${toolbarBottomPx(bottom)}`, `right:${toolbarRightPx()}`,
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

  function markCleanupButtonsComplete(ids = ['xfs-btn', 'xfs-sweep-btn', 'xfs-referral-scan-btn', 'xfs-list-btn']) {
    ids.forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      b.dataset.xfsCleanupComplete = '1';
      b.disabled = false;
      b.style.opacity = '';
      b.style.pointerEvents = '';
      b.textContent = DONE_SVG;
      b.title = '清理完成，点击刷新页面';
      b.style.border = `2px solid ${C.mute}`;
      b.style.color = C.mute;
      b.style.background = `${C.mute}18`;
      b.onclick = () => location.reload();
    });
  }

  function resetCompleteButton(id, icon, title, color, onclick) {
    const b = document.getElementById(id);
    if (!b || b.dataset.xfsCleanupComplete !== '1') return;
    b.dataset.xfsCleanupComplete = '0';
    b.disabled = false;
    b.style.opacity = '';
    b.style.pointerEvents = '';
    b.textContent = icon;
    b.title = title;
    b.style.border = `2px solid ${color}`;
    b.style.color = color;
    b.style.background = 'rgba(255,255,255,0.92)';
    b.onclick = onclick;
  }

  function resetContentCleanupButtonsIfComplete() {
    resetCompleteButton('xfs-btn', SCAN_SVG, '当前视图内容垃圾号自动屏蔽', C.blockRed, autoLoadAndScan);
    resetCompleteButton('xfs-sweep-btn', SWEEP_SVG, '整页回复内容垃圾号一网打尽', C.nameKw, () => {
      if (sweepHasRun) {
        sessionStorage.setItem('xfs-auto-sweep', location.pathname);
        location.reload();
      } else {
        sweepHasRun = true;
        sweepAll();
      }
    });
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
      '导流号：根据账号 profile 里的 x.com/twitter.com 导流链接，或“简介含大号且含任意链接”判断。只检查已加载回复用户，受平台接口/限速影响，识别会稍有延迟。',
      '自动检测导流号：低频后台检查滚动加载过的回复用户，命中后右上角屏蔽按钮会变橙色。',
      '',
      '屏蔽新注册账号：默认关闭。开启后，导流扫描会把少于所选天数或晚于所选日期注册的账号也标成橙色，并纳入导流扫描的屏蔽候选。日期选择框默认是一个月之前的今天。它需要额外依赖 profile 查询，慢、容易限流，而且新号不一定是垃圾号，误伤风险较高。',
      '',
      '内容扫描按钮会打开确认面板；导流扫描按钮会直接屏蔽当前视图命中的导流号。',
    ].join('\n'));
  }

  function showToolsPanel() {
    closeToolsPanel();
    const panelBottom = toolbarBottomPx(166);
    const p = document.createElement('div');
    p.id = 'xfs-tools-panel';
    p.style.cssText = [
      'position:fixed', `right:${toolbarRightPx(40)}`, `bottom:${panelBottom}`,
      'width:min(430px, calc(100vw - 24px))', `max-height:calc(100vh - ${panelBottom} - 16px)`, 'overflow:auto', 'padding:8px',
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
    title.textContent = '设置 / 工具';
    title.style.cssText = `font-size:12px;font-weight:700;color:${C.sub};padding:0 2px 2px;`;
    p.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(2, minmax(0, 1fr))',
      'gap:6px',
      'align-items:start',
    ].join(';');

    function mkToolBtn(text, onclick) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = `background:#fff;color:${C.text};border:1px solid ${C.btnBorder};border-radius:8px;padding:6px 9px;font-size:12px;font-weight:600;text-align:left;cursor:pointer;`;
      b.onclick = () => { onclick(); };
      return b;
    }

    function refreshYoungAccountControls() {
      youngAccountBtn.textContent = `屏蔽新注册账号：${youngAccountFilterActive ? '开' : '关'}`;
      youngAccountBtn.style.borderColor = youngAccountFilterActive ? C.blockRed : C.btnBorder;
      youngAccountBtn.style.color = youngAccountFilterActive ? C.blockRed : C.sub;
      youngAccountBtn.style.background = youngAccountFilterActive ? '#fff1f1' : '#fff';
      youngModeSelect.value = youngAccountCutoffMode;
      youngAccountSelect.value = String(youngAccountMaxAgeDays);
      youngDateInput.value = youngAccountCutoffDate;
      youngAccountSelect.style.display = youngAccountCutoffMode === 'days' ? '' : 'none';
      youngDateInput.style.display = youngAccountCutoffMode === 'date' ? '' : 'none';
      youngRowText.textContent = youngAccountCutoffMode === 'date' ? '晚于' : '少于';
    }

    const autoReferralBtn = mkToolBtn('', () => {
      autoReferralDetectActive = !autoReferralDetectActive;
      GM_setValue('auto_referral_detect', autoReferralDetectActive);
      autoReferralBtn.textContent = `自动检测导流号：${autoReferralDetectActive ? '开' : '关'}`;
      autoReferralBtn.style.borderColor = autoReferralDetectActive ? C.referralHot : C.btnBorder;
      autoReferralBtn.style.color = autoReferralDetectActive ? C.referralHot : C.sub;
      autoReferralBtn.style.background = autoReferralDetectActive ? '#fff8ed' : '#fff';
      if (autoReferralDetectActive) applyReferralForVisible();
      showToast(autoReferralDetectActive ? '自动检测导流号已开启' : '自动检测导流号已关闭', false);
    });
    autoReferralBtn.textContent = `自动检测导流号：${autoReferralDetectActive ? '开' : '关'}`;
    autoReferralBtn.style.borderColor = autoReferralDetectActive ? C.referralHot : C.btnBorder;
    autoReferralBtn.style.color = autoReferralDetectActive ? C.referralHot : C.sub;
    autoReferralBtn.style.background = autoReferralDetectActive ? '#fff8ed' : '#fff';

    function refreshRemoteRulesControls() {
      remoteRulesBtn.textContent = `远程规则订阅：${remoteRulesActive ? '开' : '关'}`;
      remoteRulesBtn.style.borderColor = remoteRulesActive ? C.nameKw : C.btnBorder;
      remoteRulesBtn.style.color = remoteRulesActive ? C.nameKw : C.sub;
      remoteRulesBtn.style.background = remoteRulesActive ? '#f2fbfc' : '#fff';
      remoteUpdateBtn.textContent = remoteRulesFetching ? '正在更新...' : '立即更新远程规则';
      remoteUpdateBtn.disabled = !remoteRulesActive || remoteRulesFetching;
      remoteUpdateBtn.style.opacity = remoteUpdateBtn.disabled ? '0.55' : '1';
      remoteUpdateBtn.style.cursor = remoteUpdateBtn.disabled ? 'default' : 'pointer';
      remoteStatus.textContent = remoteRulesActive
        ? `${remoteRulesSummary()} · ${remoteRulesFetchedText()}`
        : '默认关闭；开启后每小时从 GitHub 拉取一次。';
      remoteStatus.title = remoteRulesLastError ? `上次失败：${remoteRulesLastError}` : remoteStatus.textContent;
    }

    const remoteWrap = document.createElement('div');
    remoteWrap.style.cssText = `border:1px solid ${C.nameKw};background:#f7feff;border-radius:8px;padding:7px;display:flex;flex-direction:column;gap:6px;`;
    const remoteTitle = document.createElement('div');
    remoteTitle.textContent = '远程规则订阅';
    remoteTitle.style.cssText = `font-size:11px;font-weight:800;color:${C.nameKw};`;
    const remoteNote = document.createElement('div');
    remoteNote.textContent = '默认关闭。开启后同步内容、用户名和正则三类远程规则；失败时沿用本地缓存。远程正则可能误伤，开启前要谨慎。';
    remoteNote.style.cssText = `font-size:10px;line-height:1.35;color:${C.sub};`;
    const remoteStatus = document.createElement('div');
    remoteStatus.style.cssText = `font-size:10px;line-height:1.35;color:${C.sub};word-break:break-word;`;
    const remoteRulesBtn = mkToolBtn('', () => {
      remoteRulesActive = !remoteRulesActive;
      GM_setValue('remote_rules_active', remoteRulesActive);
      reloadKws();
      refreshKeywordPanelIfOpen();
      refreshRemoteRulesControls();
      showToast(remoteRulesActive ? '远程规则订阅已开启' : '远程规则订阅已关闭', false);
      if (remoteRulesActive) {
        refreshRemoteRules({ force: true, silent: false }).then(refreshRemoteRulesControls);
        refreshRemoteRulesControls();
      }
    });
    const remoteUpdateBtn = mkToolBtn('', () => {
      refreshRemoteRulesControls();
      refreshRemoteRules({ force: true, silent: false }).then(refreshRemoteRulesControls);
    });
    remoteUpdateBtn.title = '手动从 GitHub 拉取最新远程规则';
    remoteWrap.appendChild(remoteTitle);
    remoteWrap.appendChild(remoteRulesBtn);
    remoteWrap.appendChild(remoteUpdateBtn);
    remoteWrap.appendChild(remoteStatus);
    remoteWrap.appendChild(remoteNote);
    refreshRemoteRulesControls();

    const youngWrap = document.createElement('div');
    youngWrap.style.cssText = `border:1px solid ${C.blockRed};background:#fff7f7;border-radius:8px;padding:7px;display:flex;flex-direction:column;gap:6px;`;
    const youngTitle = document.createElement('div');
    youngTitle.textContent = '高误伤：屏蔽新注册账号';
    youngTitle.style.cssText = `font-size:11px;font-weight:800;color:${C.blockRed};`;
    const youngNote = document.createElement('div');
    youngNote.textContent = '默认关闭。开启后，新注册账号会进入橙标和导流扫描屏蔽候选；需要逐个查 profile，速度慢，容易限流，新号不一定是垃圾号。';
    youngNote.style.cssText = `font-size:10px;line-height:1.35;color:${C.sub};`;
    const youngAccountBtn = mkToolBtn('', () => {
      youngAccountFilterActive = !youngAccountFilterActive;
      GM_setValue('young_account_filter_active', youngAccountFilterActive);
      refreshYoungAccountControls();
      if (youngAccountFilterActive) applyReferralForVisible();
      showToast(youngAccountFilterActive ? `屏蔽新注册账号已开启：${youngAccountRuleLabel()}` : '屏蔽新注册账号已关闭', false);
    });
    const youngRow = document.createElement('label');
    youngRow.style.cssText = `display:flex;align-items:center;gap:6px;font-size:11px;color:${C.text};`;
    const youngModeSelect = document.createElement('select');
    youngModeSelect.style.cssText = `width:100%;border:1px solid ${C.btnBorder};border-radius:7px;background:#fff;color:${C.text};font-size:11px;padding:4px;`;
    [
      ['days', '按天数'],
      ['date', '按日期'],
    ].forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      youngModeSelect.appendChild(opt);
    });
    youngModeSelect.onchange = () => {
      youngAccountCutoffMode = normalizeYoungAccountCutoffMode(youngModeSelect.value);
      GM_setValue('young_account_cutoff_mode', youngAccountCutoffMode);
      referralCache.forEach((item, key) => {
        const effective = materializeReferralItem(item);
        referralCache.set(key, { ...item, isReferral: effective.isReferral, isYoungAccount: effective.isYoungAccount, accountAgeDays: effective.accountAgeDays });
      });
      saveReferralCache();
      applyReferralForVisible();
      refreshYoungAccountControls();
      showToast(`屏蔽新注册账号已切换为${youngAccountCutoffMode === 'date' ? '按日期' : '按天数'}`, false);
    };
    const youngAccountSelect = document.createElement('select');
    youngAccountSelect.style.cssText = `flex:1;min-width:0;border:1px solid ${C.btnBorder};border-radius:7px;background:#fff;color:${C.text};font-size:11px;padding:4px;`;
    YOUNG_ACCOUNT_DAY_OPTIONS.forEach(days => {
      const opt = document.createElement('option');
      opt.value = String(days);
      opt.textContent = `${days} 天`;
      youngAccountSelect.appendChild(opt);
    });
    const youngDateInput = document.createElement('input');
    youngDateInput.type = 'date';
    youngDateInput.max = toDateInputValue(new Date());
    youngDateInput.style.cssText = `flex:1;min-width:0;border:1px solid ${C.btnBorder};border-radius:7px;background:#fff;color:${C.text};font-size:11px;padding:4px;`;
    youngAccountSelect.onchange = () => {
      youngAccountMaxAgeDays = normalizeYoungAccountDays(youngAccountSelect.value);
      GM_setValue('young_account_max_age_days', youngAccountMaxAgeDays);
      referralCache.forEach((item, key) => {
        const effective = materializeReferralItem(item);
        referralCache.set(key, { ...item, isReferral: effective.isReferral, isYoungAccount: effective.isYoungAccount, accountAgeDays: effective.accountAgeDays });
      });
      saveReferralCache();
      applyReferralForVisible();
      refreshYoungAccountControls();
      showToast(`屏蔽新注册账号阈值已设为 ${youngAccountMaxAgeDays} 天`, false);
    };
    youngDateInput.onchange = () => {
      youngAccountCutoffDate = normalizeDateInputValue(youngDateInput.value);
      GM_setValue('young_account_cutoff_date', youngAccountCutoffDate);
      referralCache.forEach((item, key) => {
        const effective = materializeReferralItem(item);
        referralCache.set(key, { ...item, isReferral: effective.isReferral, isYoungAccount: effective.isYoungAccount, accountAgeDays: effective.accountAgeDays });
      });
      saveReferralCache();
      applyReferralForVisible();
      refreshYoungAccountControls();
      showToast(`屏蔽新注册账号日期已设为 ${youngAccountCutoffDate}`, false);
    };
    const youngRowText = document.createElement('span');
    youngRowText.textContent = '少于';
    youngRow.appendChild(youngRowText);
    youngRow.appendChild(youngAccountSelect);
    youngRow.appendChild(youngDateInput);
    youngWrap.appendChild(youngTitle);
    youngWrap.appendChild(youngAccountBtn);
    youngWrap.appendChild(youngModeSelect);
    youngWrap.appendChild(youngRow);
    youngWrap.appendChild(youngNote);
    refreshYoungAccountControls();

    const editBtn = mkToolBtn('关键词定义', () => {
      closeToolsPanel();
      showPanel(scanPage(), { keywordsOpen: true });
    });
    editBtn.style.borderColor = C.regexKw;
    editBtn.style.color = C.regexKw;
    editBtn.style.background = '#f2fbfc';
    editBtn.title = '打开内容关键词、用户名关键词和正则规则编辑面板';
    remoteWrap.style.gridRow = 'span 4';
    youngWrap.style.gridRow = 'span 4';
    grid.appendChild(editBtn);
    grid.appendChild(autoReferralBtn);
    grid.appendChild(remoteWrap);
    grid.appendChild(youngWrap);
    grid.appendChild(mkToolBtn('两类账号说明', showCategoryHelp));
    grid.appendChild(mkToolBtn('导出自定义词', exportKws));
    grid.appendChild(mkToolBtn('合并导入自定义词', () => importKws('merge')));
    grid.appendChild(mkToolBtn('覆盖自定义词', () => importKws('replace')));
    p.appendChild(grid);
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
    const btn = mkIconBtn('xfs-gear-btn', GEAR_SVG, '设置 / 关键词定义', 200, C.sub, e => {
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

      const allowFilterHighlight = location.pathname !== '/home';
      const matchInfo = allowFilterHighlight
        ? matchesFilters(displayName, fullText)
        : { matched: false, cats: new Set(), heartHits: [], nameKwHits: [], kwHits: [], reHits: [] };
      const { matched, cats, heartHits, nameKwHits, kwHits, reHits } = matchInfo;
      setArticleHideRuleStats(art, { nameKwHits, kwHits, reHits });
      const alreadyBlocked = blockedHandles.has(normalizeHandle(handle));
      const isOP = art === firstArt;
      art.dataset.xfsHideMatched = (!isOP && matched && !alreadyBlocked) ? '1' : '0';
      if (alreadyBlocked) art.dataset.xfsReferralAccount = '0';
      else scheduleReferralCheck(art, handle, isOP, displayName);
      if (!isOP && matched && !alreadyBlocked && /\/status\/\d/.test(location.pathname)) {
        matchedHandlesInView.add(handle);
        if (!matchedUsersCache.has(handle))
          matchedUsersCache.set(handle, { handle, displayName, cats, heartHits: [...heartHits], nameKwHits: [...nameKwHits], kwHits: [...kwHits], reHits: [...reHits], tweetSnippet: '' });
      }

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
        const color = reason === 'referral' ? C.referralHot : C.blockRed;
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
            blockedHandles.delete(normalizeHandle(handle));
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
            incrementPersistentBlockedCount(1);
            blockedHandles.add(handle);
            blockedHandles.add(normalizeHandle(handle));
            matchedHandlesInView.delete(handle);
            matchedHandlesInView.delete(normalizeHandle(handle));
            matchedUsersCache.delete(handle);
            matchedUsersCache.delete(normalizeHandle(handle));
            dimArticlesByHandle(handle);
            updateHideBadge();
            updateReferralBadge();
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
        'position:fixed', `right:${toolbarRightPx(-4)}`, `bottom:${toolbarBottomPx(196)}`,
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
        'position:fixed', `right:${toolbarRightPx(-2)}`, `bottom:${toolbarBottomPx(section.bottom)}`,
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
        'position:fixed', `right:${toolbarRightPx(2)}`, `bottom:${toolbarBottomPx(bottom)}`,
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

  function toggleButtonStack() {
    buttonsCollapsed = !buttonsCollapsed;
    GM_setValue('buttons_collapsed', buttonsCollapsed);
    closeToolsPanel();
    if (buttonsCollapsed) {
      removeBtnStack();
    } else {
      injectBtn();
    }
    updateStackToggleBtn();
    updateToolbarPositions();
  }

  function enableToolbarDrag(btn) {
    let drag = null;
    btn.onpointerdown = e => {
      if (e.button !== 0) return;
      clampToolbarPosition();
      drag = {
        x: e.clientX,
        y: e.clientY,
        right: toolbarRight,
        bottom: toolbarBaseBottom,
        moved: false,
      };
      try { btn.setPointerCapture?.(e.pointerId); } catch (_) {}
    };
    btn.onpointermove = e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      toolbarRight = drag.right - dx;
      toolbarBaseBottom = drag.bottom - dy;
      clampToolbarPosition();
      updateToolbarPositions();
      e.preventDefault();
    };
    const endDrag = e => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      try { btn.releasePointerCapture?.(e.pointerId); } catch (_) {}
      if (moved) {
        btn.dataset.xfsDragged = '1';
        saveToolbarPosition();
        setTimeout(() => {
          if (btn.dataset.xfsDragged === '1') btn.dataset.xfsDragged = '0';
        }, 250);
        e.preventDefault();
      }
    };
    btn.onpointerup = endDrag;
    btn.onpointercancel = endDrag;
  }

  function injectStackToggleBtn() {
    if (!document.body) return;
    let btn = document.getElementById('xfs-stack-toggle-btn');
    if (!btn) {
      btn = mkIconBtn('xfs-stack-toggle-btn', buttonsCollapsed ? EXPAND_SVG : COLLAPSE_SVG, '', 160, C.sub, e => {
        if (btn.dataset.xfsDragged === '1') {
          btn.dataset.xfsDragged = '0';
          e?.preventDefault?.();
          return;
        }
        toggleButtonStack();
      });
      btn.style.touchAction = 'none';
      btn.onmouseenter = () => {
        if (btn.disabled) return;
        btn.style.opacity = '1';
        btn.style.transform = buttonsCollapsed ? 'translateX(-1px)' : 'scale(1.06)';
        btn.style.boxShadow = buttonsCollapsed ? '0 4px 16px rgba(83,100,113,0.24)' : '0 2px 10px rgba(0,0,0,0.14)';
      };
      btn.onmouseleave = () => {
        btn.style.transform = '';
        updateStackToggleBtn();
      };
      enableToolbarDrag(btn);
      document.body.appendChild(btn);
    }
    updateStackToggleBtn();
    updateToolbarPositions();
  }

  function updateStackToggleBtn() {
    const btn = document.getElementById('xfs-stack-toggle-btn');
    if (!btn) return;
    const collapsed = buttonsCollapsed;
    btn.textContent = collapsed ? EXPAND_SVG : COLLAPSE_SVG;
    btn.title = collapsed ? 'X Fraud Scanner · 已收起，点击展开右侧工具栏；拖动可移动' : 'X Fraud Scanner · 收起右侧工具栏；拖动可移动';
    btn.style.width = collapsed ? '46px' : '32px';
    btn.style.height = collapsed ? '30px' : '32px';
    btn.style.borderRadius = collapsed ? '15px' : '50%';
    btn.style.opacity = collapsed ? '0.92' : '0.58';
    btn.style.background = collapsed ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.76)';
    btn.style.border = collapsed ? `1.5px solid ${C.sub}` : `1.5px solid ${C.btnBorder}`;
    btn.style.boxShadow = collapsed ? '0 3px 12px rgba(83,100,113,0.18)' : '0 1px 6px rgba(0,0,0,0.10)';
    btn.style.fontFamily = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    btn.style.fontSize = collapsed ? '11px' : '18px';
    btn.style.fontWeight = collapsed ? '800' : '700';
    btn.style.letterSpacing = '0';
    btn.style.color = C.sub;
  }

  function removeStackToggleBtn() {
    document.getElementById('xfs-stack-toggle-btn')?.remove();
  }

  function removeBtnStack() {
    document.getElementById('xfs-btn')?.remove();
    document.getElementById('xfs-referral-scan-btn')?.remove();
    document.getElementById('xfs-sweep-btn')?.remove();
    removeGearBtn();
    removeReferralBtn();
    removeHideBtn();
    removeBtnBackdrop();
  }

  function injectBtn() {
    if (!document.body) return;
    if (!/\/status\/\d/.test(location.pathname)) return;
    if (isListPage()) return; // likes/retweets/followers use their own button
    injectStackToggleBtn();
    if (buttonsCollapsed) {
      removeBtnStack();
      return;
    }
    injectHideBtn();
    injectBtnBackdrop();
    injectReferralBtn();
    injectGearBtn();
    if (!document.getElementById('xfs-referral-scan-btn')) {
      document.body.appendChild(mkIconBtn(
        'xfs-referral-scan-btn', SCAN_SVG, '扫描并自动屏蔽当前视图导流号；只检查已加载回复，识别会稍有延迟', 240, C.referral, scanReferralAccountsInView));
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
    updateToolbarPositions();
    updateScanButtonsLocked();
  }

  function removeBtn() {
    removeBtnStack();
    removeStackToggleBtn();
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
    updateScanButtonsLocked();
  }

  function removeListBtn() {
    document.getElementById('xfs-list-btn')?.remove();
  }

  // ── Referral-account hide toggle button ──────────────────────────────
  // Defaults on. Hides replies from accounts that match profile referral rules.
  function updateReferralBtn() {
    const btn = document.getElementById('xfs-referral-btn');
    if (!btn) return;
    const badge = document.getElementById('xfs-referral-badge');
    btn.textContent = EYE_SVG;
    if (badge) btn.appendChild(badge);
    btn.title = hideReferralActive
      ? '导流号回复已隐藏（橙标），点击显示。受平台接口/限速影响，识别会稍有延迟'
      : '点击隐藏 profile 导流号回复（橙标）。只检查已加载回复，识别会稍有延迟';
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
      ? '内容垃圾号回复已隐藏（红标），点击显示'
      : '点击隐藏匹配关键词/正则的内容垃圾号回复（红标）';
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
              : /\/status\/\d/.test(p) ? (buttonsCollapsed
                ? ['xfs-stack-toggle-btn']
                : ['xfs-stack-toggle-btn', 'xfs-btn-backdrop', 'xfs-hide-btn', 'xfs-referral-btn', 'xfs-btn', 'xfs-referral-scan-btn', 'xfs-sweep-btn', 'xfs-gear-btn'])
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
    let routeBtnTimer = null;
    let watchdogTimer = null;

    function startButtonWatchdog(duration = 30000, interval = 500) {
      clearTimeout(watchdogTimer);
      const until = Date.now() + duration;
      const tick = () => {
        ensureRouteButtons();
        if (Date.now() < until && !routeButtonsReady()) {
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
      endScanMode(activeScanMode, true);
      matchedHandlesInView.clear();
      matchedUsersCache.clear();
      referralIntentHints.clear();
      referralHintRefreshDone.clear();
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
      clearTimeout(routeBtnTimer);
      routeBtnTimer = setTimeout(ensureRouteButtons, 300);
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

  exposeDebugTools();
  scheduleRemoteRulesRefresh();
  startUI();
  document.addEventListener('DOMContentLoaded', startUI);
  window.addEventListener('load', startUI);

})();
