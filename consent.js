/*!
 * Kaiman Isles cookie consent — single file, no dependencies.
 *
 * Install: put ONE line in <head>, before anything else that loads media:
 *   <script src="/consent.js"></script>
 *
 * What it does
 *  - Shows a consent banner (Accept all / Reject non-essential / Customize).
 *  - Holds back YouTube embeds (the trailer) until "Embedded media" is allowed,
 *    swapping in a click-to-load placeholder. Allowed embeds use youtube-nocookie.com.
 *  - Holds back any <script type="text/plain" data-consent="analytics"> until allowed.
 *  - Remembers the choice for 180 days (localStorage). Nothing is pre-ticked.
 *  - Adds a "Cookie settings" link to the footer so people can change their mind.
 *
 * REQUIRED for a real block: edit the trailer's iframe so the browser never gets a src:
 *   <iframe src="https://www.youtube.com/embed/ID">
 *     becomes
 *   <iframe data-consent="media" data-src="https://www.youtube.com/embed/ID">
 * With a plain src, the browser starts the YouTube request before any script can stop it
 * (the script still swaps it out, but the request has already fired).
 */
(function () {
  'use strict';
  if (window.KaimanConsent) return;

  /* ---------- Config: edit me ---------- */
  var CFG = {
    storageKey: 'ki_consent_v1',
    version: 1,            // bump to ask everyone again (e.g. after adding a category)
    days: 180,
    privacyUrl: '',        // e.g. '/privacy'  (leave '' to hide the link)
    title: 'A quick word about cookies',
    intro: 'This site only needs one small preference to work. The trailer is a YouTube embed, ' +
           'and YouTube may set its own cookies when it loads. Your call.',
    categories: [
      { id: 'necessary', label: 'Strictly necessary', locked: true,
        desc: 'Remembers your cookie choice on this device. Nothing else.' },
      { id: 'media', label: 'Embedded media',
        desc: 'Lets the YouTube trailer load. YouTube (Google) may set cookies and receive your IP address.' }
      /* To add analytics later:
         { id: 'analytics', label: 'Analytics', desc: 'Anonymous visit counts.' }
         then tag its script: <script type="text/plain" data-consent="analytics" src="..."></script> */
    ]
  };

  /* ---------- State ---------- */
  var DAY = 864e5;
  var consent = load();
  var frames = [];
  var ranScriptCats = {};

  function load() {
    try {
      var r = JSON.parse(localStorage.getItem(CFG.storageKey));
      if (r && r.v === CFG.version && r.exp > Date.now() && r.c) return r.c;
    } catch (e) {}
    return null;
  }
  function save(c) {
    try {
      localStorage.setItem(CFG.storageKey, JSON.stringify({ v: CFG.version, exp: Date.now() + CFG.days * DAY, c: c }));
    } catch (e) {}
  }
  function allowed(cat) {
    return cat === 'necessary' || !!(consent && consent[cat] === true);
  }

  /* ---------- Embeds ---------- */
  var YT = /^(https?:)?\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i;

  function noCookie(src) {
    return src.replace(/^((?:https?:)?\/\/)(?:www\.)?youtube\.com\//i, '$1www.youtube-nocookie.com/');
  }
  function frameCat(f) {
    var c = f.getAttribute('data-consent');
    if (c) return c;
    var s = f.getAttribute('src');
    return s && YT.test(s) ? 'media' : null;
  }

  function scan(root) {
    var list = [];
    if (root.nodeType === 1 && root.tagName === 'IFRAME') list = [root];
    else if (root.querySelectorAll) list = root.querySelectorAll('iframe');
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.__ki) continue;
      var cat = frameCat(f);
      var src = f.getAttribute('data-src') || f.getAttribute('src');
      if (!cat || !src) continue;
      f.__ki = { cat: cat, src: src, ph: null, disp: f.style.display };
      frames.push(f);
      if (allowed(cat)) activate(f); else block(f);
    }
  }

  function block(f) {
    var k = f.__ki;
    if (f.getAttribute('src') !== 'about:blank') f.setAttribute('src', 'about:blank');
    whenReady(function () { placeholder(f); });
  }

  function placeholder(f) {
    var k = f.__ki;
    if (k.ph || allowed(k.cat)) return;
    var r = f.getBoundingClientRect();
    var ph = document.createElement('div');
    ph.className = 'ki-root ki-embed';
    ph.innerHTML =
      '<p class="ki-embed-t">This video is hosted by YouTube.</p>' +
      '<p class="ki-embed-s">Loading it may set cookies from YouTube/Google.</p>' +
      '<div class="ki-embed-a">' +
      '<button type="button" class="ki-btn ki-primary" data-ki-once>Load video</button>' +
      '<button type="button" class="ki-btn ki-alt" data-ki-always>Always allow media</button>' +
      '</div>';
    ph.style.aspectRatio = (r.width && r.height) ? (r.width / r.height).toFixed(4) : '16 / 9';
    ph.style.width = '100%';
    if (r.width) ph.style.maxWidth = Math.round(r.width) + 'px';
    ph.style.margin = '0 auto';
    ph.querySelector('[data-ki-once]').addEventListener('click', function () { activate(f); });
    ph.querySelector('[data-ki-always]').addEventListener('click', function () {
      var c = copy(consent); c[k.cat] = true; commit(c);
    });
    k.ph = ph;
    f.style.display = 'none';
    f.parentNode.insertBefore(ph, f);
  }

  function activate(f) {
    var k = f.__ki;
    if (k.ph) { k.ph.remove(); k.ph = null; }
    f.style.display = k.disp || '';
    var target = noCookie(k.src);
    if (f.getAttribute('src') !== target) f.setAttribute('src', target);
  }

  /* ---------- Deferred scripts ---------- */
  function runScripts() {
    var list = document.querySelectorAll('script[type="text/plain"][data-consent]');
    for (var i = 0; i < list.length; i++) {
      var s = list[i], cat = s.getAttribute('data-consent');
      if (s.__done || !allowed(cat)) continue;
      var n = document.createElement('script');
      for (var j = 0; j < s.attributes.length; j++) {
        var a = s.attributes[j];
        if (a.name !== 'type' && a.name !== 'data-consent') n.setAttribute(a.name, a.value);
      }
      if (!s.src) n.text = s.text;
      s.__done = true;
      ranScriptCats[cat] = true;
      s.parentNode.insertBefore(n, s.nextSibling);
    }
  }

  /* ---------- Commit a choice ---------- */
  function copy(o) { var c = {}; for (var k in (o || {})) c[k] = o[k]; return c; }
  function everything(v) {
    var c = {};
    CFG.categories.forEach(function (x) { if (!x.locked) c[x.id] = v; });
    return c;
  }

  function commit(c) {
    var needsReload = false;
    for (var cat in ranScriptCats) if (ranScriptCats[cat] && c[cat] !== true) needsReload = true;
    consent = c;
    save(c);
    frames.forEach(function (f) { if (allowed(f.__ki.cat)) activate(f); else block(f); });
    runScripts();
    if (window.gtag) {
      try {
        window.gtag('consent', 'update', {
          analytics_storage: c.analytics ? 'granted' : 'denied',
          ad_storage: c.ads ? 'granted' : 'denied'
        });
      } catch (e) {}
    }
    try { document.dispatchEvent(new CustomEvent('kaiman:consent', { detail: copy(c) })); } catch (e) {}
    hideBanner(); closePrefs();
    if (needsReload) location.reload();
  }

  /* ---------- UI ---------- */
  var root, banner, overlay, modal, lastFocus;

  var CSS =
'.ki-root{--ki-bg:#1C1210;--ki-bg2:#2A1F1B;--ki-fg:#E8D5B7;--ki-mut:#D4A574;--ki-acc:#C4813D;--ki-accfg:#1C1210;--ki-line:rgba(196,129,61,.3);' +
'font-family:inherit;font-size:15px;line-height:1.55;color:var(--ki-fg);box-sizing:border-box}' +
'.ki-root *,.ki-root *::before,.ki-root *::after{box-sizing:border-box}' +
'.ki-root [hidden]{display:none!important}' +
'.ki-banner{position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;margin:0 auto;max-width:800px;display:flex;flex-wrap:wrap;align-items:center;gap:16px 24px;' +
'padding:20px 22px;background:var(--ki-bg2);border:1px solid var(--ki-line);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);animation:ki-up .35s ease-out both}' +
'.ki-copy{flex:1 1 320px;min-width:0}' +
'.ki-title{margin:0 0 4px;font-family:"DM Serif Display",Georgia,serif;font-size:21px;font-weight:400;line-height:1.25;color:var(--ki-fg)}' +
'.ki-copy p{margin:0;color:var(--ki-mut)}' +
'.ki-copy a,.ki-foot a{color:var(--ki-acc);text-decoration:underline;text-underline-offset:2px}' +
'.ki-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
'.ki-btn{font:inherit;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px;border:1px solid transparent;cursor:pointer;line-height:1.2;white-space:nowrap}' +
'.ki-primary{background:var(--ki-acc);color:var(--ki-accfg);border-color:var(--ki-acc)}' +
'.ki-primary:hover{filter:brightness(1.08)}' +
'.ki-alt{background:transparent;color:var(--ki-fg);border-color:rgba(236,220,194,.5)}' +
'.ki-alt:hover{background:rgba(236,220,194,.08)}' +
'.ki-link{font:inherit;font-size:14px;background:none;border:0;padding:10px 4px;color:var(--ki-mut);text-decoration:underline;text-underline-offset:3px;cursor:pointer}' +
'.ki-link:hover{color:var(--ki-fg)}' +
'.ki-root button:focus-visible,.ki-root input:focus-visible,.ki-root a:focus-visible{outline:2px solid var(--ki-fg);outline-offset:2px}' +
'.ki-overlay{position:fixed;z-index:2147483001;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,5,3,.74);animation:ki-fade .2s ease-out both}' +
'.ki-modal{width:100%;max-width:560px;max-height:90vh;overflow:auto;background:var(--ki-bg2);border:1px solid var(--ki-line);border-radius:16px;padding:26px;box-shadow:0 24px 70px rgba(0,0,0,.6)}' +
'.ki-mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px}' +
'.ki-x{font:inherit;font-size:22px;line-height:1;background:none;border:0;color:var(--ki-mut);cursor:pointer;padding:4px 8px;border-radius:6px}' +
'.ki-x:hover{color:var(--ki-fg)}' +
'.ki-modal>p{margin:0 0 16px;color:var(--ki-mut)}' +
'.ki-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:14px 0;border-top:1px solid var(--ki-line)}' +
'.ki-row h3{margin:0 0 2px;font-size:15px;font-weight:700;color:var(--ki-fg)}' +
'.ki-row p{margin:0;font-size:14px;color:var(--ki-mut)}' +
'.ki-sw{flex:none;appearance:none;-webkit-appearance:none;width:44px;height:26px;margin:2px 0 0;border-radius:99px;background:rgba(236,220,194,.2);position:relative;cursor:pointer;transition:background .2s}' +
'.ki-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--ki-fg);transition:transform .2s}' +
'.ki-sw:checked{background:var(--ki-acc)}' +
'.ki-sw:checked::after{transform:translateX(18px);background:var(--ki-accfg)}' +
'.ki-sw:disabled{opacity:.55;cursor:not-allowed}' +
'.ki-mact{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid var(--ki-line)}' +
'.ki-foot{margin:14px 0 0;font-size:13px;color:var(--ki-mut)}' +
'.ki-embed{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:20px;background:var(--ki-bg);border:1px dashed var(--ki-line);border-radius:12px;min-height:200px}' +
'.ki-embed-t{margin:0;font-weight:700;font-size:16px}' +
'.ki-embed-s{margin:0 0 8px;color:var(--ki-mut);font-size:14px}' +
'.ki-embed-a{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
'.ki-fab{position:fixed;z-index:2147482000;left:16px;bottom:16px;font:inherit;font-size:13px;padding:8px 12px;border-radius:99px;background:var(--ki-bg2);color:var(--ki-mut);border:1px solid var(--ki-line);cursor:pointer}' +
'@keyframes ki-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}' +
'@keyframes ki-fade{from{opacity:0}to{opacity:1}}' +
'@media (max-width:640px){.ki-banner{left:10px;right:10px;bottom:10px;padding:18px}.ki-actions{width:100%}.ki-actions .ki-btn{flex:1 1 100%}.ki-actions .ki-link{flex:1 1 100%;text-align:center}.ki-mact .ki-btn{flex:1 1 100%}}' +
'@media (prefers-reduced-motion:reduce){.ki-banner,.ki-overlay{animation:none}.ki-sw,.ki-sw::after{transition:none}}';

  function build() {
    var st = document.createElement('style');
    st.id = 'ki-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    var priv = CFG.privacyUrl ? ' <a href="' + CFG.privacyUrl + '">Privacy policy</a>' : '';
    var rows = CFG.categories.map(function (c) {
      return '<div class="ki-row"><div><h3 id="ki-l-' + c.id + '">' + c.label + '</h3><p>' + c.desc + '</p></div>' +
        '<input type="checkbox" class="ki-sw" data-cat="' + c.id + '" aria-labelledby="ki-l-' + c.id + '"' +
        (c.locked ? ' checked disabled' : '') + '></div>';
    }).join('');

    root = document.createElement('div');
    root.className = 'ki-root';
    root.innerHTML =
      '<section class="ki-banner" role="region" aria-label="Cookie consent" hidden>' +
        '<div class="ki-copy"><h2 class="ki-title">' + CFG.title + '</h2><p>' + CFG.intro + priv + '</p></div>' +
        '<div class="ki-actions">' +
          '<button type="button" class="ki-btn ki-primary" data-act="accept">Accept all</button>' +
          '<button type="button" class="ki-btn ki-alt" data-act="reject">Reject non-essential</button>' +
          '<button type="button" class="ki-link" data-act="prefs">Customize</button>' +
        '</div>' +
      '</section>' +
      '<div class="ki-overlay" hidden>' +
        '<div class="ki-modal" role="dialog" aria-modal="true" aria-labelledby="ki-mt">' +
          '<div class="ki-mhead"><h2 class="ki-title" id="ki-mt">Cookie preferences</h2>' +
          '<button type="button" class="ki-x" data-act="close" aria-label="Close">&times;</button></div>' +
          '<p>Choose what you\'re comfortable with. You can change this any time from the footer.</p>' +
          rows +
          '<div class="ki-mact">' +
            '<button type="button" class="ki-btn ki-primary" data-act="save">Save choices</button>' +
            '<button type="button" class="ki-btn ki-alt" data-act="accept">Accept all</button>' +
            '<button type="button" class="ki-btn ki-alt" data-act="reject">Reject non-essential</button>' +
          '</div>' +
          (priv ? '<p class="ki-foot">' + priv.trim() + '</p>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    banner = root.querySelector('.ki-banner');
    overlay = root.querySelector('.ki-overlay');
    modal = root.querySelector('.ki-modal');

    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'accept') commit(everything(true));
      else if (a === 'reject') commit(everything(false));
      else if (a === 'prefs') openPrefs();
      else if (a === 'close') closePrefs();
      else if (a === 'save') {
        var c = {};
        modal.querySelectorAll('.ki-sw').forEach(function (i) {
          if (!i.disabled) c[i.getAttribute('data-cat')] = i.checked;
        });
        commit(c);
      }
    });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closePrefs(); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePrefs(); return; }
      if (e.key !== 'Tab') return;
      var f = modal.querySelectorAll('button,input:not([disabled]),a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-cookie-settings]');
      if (t) { e.preventDefault(); openPrefs(); }
    });

    footerLink();
    if (!consent) showBanner();
  }

  function footerLink() {
    if (document.querySelector('[data-cookie-settings]')) return;
    var p = document.querySelector('footer p') ||
            document.querySelector('[role="contentinfo"] p') ||
            document.querySelector('footer');
    if (p) {
      var sep = document.createTextNode(' · ');
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-cookie-settings', '');
      a.textContent = 'Cookie settings';
      p.appendChild(sep); p.appendChild(a);
    } else {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ki-root ki-fab';
      b.setAttribute('data-cookie-settings', '');
      b.textContent = 'Cookie settings';
      document.body.appendChild(b);
    }
  }

  function showBanner() { if (banner) banner.hidden = false; }
  function hideBanner() { if (banner) banner.hidden = true; }

  function openPrefs() {
    if (!overlay) return;
    lastFocus = document.activeElement;
    modal.querySelectorAll('.ki-sw').forEach(function (i) {
      if (!i.disabled) i.checked = !!(consent && consent[i.getAttribute('data-cat')]);
    });
    overlay.hidden = false;
    var first = modal.querySelector('.ki-sw:not([disabled])') || modal.querySelector('button');
    if (first) first.focus();
  }
  function closePrefs() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- Boot ---------- */
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // Catch embeds as the parser adds them (works when this script sits in <head>).
  try {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) if (m.addedNodes[i].nodeType === 1) scan(m.addedNodes[i]);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  whenReady(function () {
    scan(document);
    runScripts();
    build();
  });

  window.KaimanConsent = {
    open: openPrefs,
    get: function () { return consent ? copy(consent) : null; },
    reset: function () {
      try { localStorage.removeItem(CFG.storageKey); } catch (e) {}
      location.reload();
    }
  };
})();
