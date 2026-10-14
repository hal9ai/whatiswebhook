/* whatislocalhost.com — interactions (v2). No dependencies, progressive enhancement:
   every page reads fine without this file; it only adds motion and interactivity. */
(() => {
  "use strict";
  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => reduceMQ.matches;
  const hasIO = "IntersectionObserver" in window;
  const rafThrottle = (fn) => { let q = false; return (...a) => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...a); }); }; };
  const onVisible = (el, cb, opts = {}) => {
    if (!hasIO) { cb(true); return; }
    new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting, e)), { rootMargin: opts.margin || "0px", threshold: opts.threshold || 0 }).observe(el);
  };

  /* ---------- Theme ---------- */
  const themeBtn = $(".theme-toggle");
  function setTheme(t, persist, init) {
    doc.dataset.theme = t;
    if (persist) { try { localStorage.setItem("theme", t); } catch (e) { /* private mode */ } }
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", String(t === "dark"));
      themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark blueprint theme");
    }
    if (!init) {
      const paper = getComputedStyle(doc).getPropertyValue("--paper").trim();
      $$('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", paper));
      document.dispatchEvent(new CustomEvent("themechange"));
    }
  }
  setTheme(doc.dataset.theme === "dark" ? "dark" : "light", false, true);
  themeBtn?.addEventListener("click", () => setTheme(doc.dataset.theme === "dark" ? "light" : "dark", true));
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    let stored = null;
    try { stored = localStorage.getItem("theme"); } catch (err) { /* ignore */ }
    if (!stored) setTheme(e.matches ? "dark" : "light", false);
  });

  /* ---------- Mobile menu ---------- */
  const mast = $(".masthead");
  const menuBtn = $(".menu-toggle");
  const closeMenu = () => { mast?.removeAttribute("data-open"); menuBtn?.setAttribute("aria-expanded", "false"); };
  menuBtn?.addEventListener("click", () => {
    const open = !mast.hasAttribute("data-open");
    mast.toggleAttribute("data-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$(".nav a").forEach((a) => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mast?.hasAttribute("data-open")) { closeMenu(); menuBtn.focus(); }
  });

  /* ---------- Reading progress (fallback where scroll timelines are unsupported) ---------- */
  if (!(window.CSS && CSS.supports("animation-timeline: scroll()"))) {
    const bar = $(".progress span");
    if (bar) {
      const upd = () => { const h = doc.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
      addEventListener("scroll", rafThrottle(upd), { passive: true });
      upd();
    }
  }

  /* ---------- Reveal on scroll ---------- */
  if (hasIO) {
    doc.classList.add("reveal-ready");
    const obs = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); obs.unobserve(en.target); }
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    $$(".reveal").forEach((el) => obs.observe(el));
  }

  /* ---------- Lines that draft themselves ---------- */
  const drafts = $$(".draft");
  if (drafts.length && hasIO && !reduced()) {
    doc.classList.add("draft-ready");
    drafts.forEach((fig) => {
      $$(".ln, .ln-2", fig).forEach((el) => {
        if (el.matches(".dash, .flow, .flow-slow, .dot") || !el.getTotalLength) return;
        try { el.style.setProperty("--len", Math.ceil(el.getTotalLength() + 2)); } catch (e) { /* not rendered */ }
      });
      onVisible(fig, (vis) => {
        if (!vis || fig.classList.contains("is-in")) return;
        fig.classList.add("is-in");
        setTimeout(() => fig.classList.remove("draft"), 1800);
      }, { margin: "0px 0px -10% 0px" });
    });
  }

  /* ---------- SMIL animations: pause offscreen and for reduced motion ---------- */
  $$("svg.anim").forEach((svg) => {
    if (!svg.pauseAnimations) return;
    if (reduced()) { svg.pauseAnimations(); return; }
    onVisible(svg, (vis) => { if (vis) svg.unpauseAnimations(); else svg.pauseAnimations(); svg.classList.toggle("anim-off", !vis); });
  });

  /* ---------- Narrow-screen viewBox crops ---------- */
  const narrowMQ = matchMedia("(max-width: 640px)");
  const applyVB = () => $$("svg[data-vb-narrow]").forEach((svg) => {
    if (!svg.dataset.vb) svg.dataset.vb = svg.getAttribute("viewBox");
    svg.setAttribute("viewBox", narrowMQ.matches ? svg.dataset.vbNarrow : svg.dataset.vb);
  });
  applyVB();
  narrowMQ.addEventListener?.("change", applyVB);

  /* ---------- Drafting crosshair ---------- */
  $$("[data-crosshair]").forEach((fig) => {
    const svg = $("svg", fig);
    if (!svg) return;
    const ch = document.createElement("div");
    ch.className = "crosshair";
    ch.setAttribute("aria-hidden", "true");
    ch.innerHTML = '<i class="cx"></i><i class="cy"></i><span class="cxy"></span>';
    fig.append(ch);
    const [cx, cy, lab] = [$(".cx", ch), $(".cy", ch), $(".cxy", ch)];
    fig.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = fig.getBoundingClientRect();
      cx.style.transform = `translateX(${e.clientX - r.left}px)`;
      cy.style.transform = `translateY(${e.clientY - r.top}px)`;
      const m = svg.getScreenCTM();
      if (m) {
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
        lab.textContent = `X ${String(Math.max(0, Math.round(p.x))).padStart(3, "0")} · Y ${String(Math.max(0, Math.round(p.y))).padStart(3, "0")}`;
      }
      ch.classList.add("on");
    });
    fig.addEventListener("pointerleave", () => ch.classList.remove("on"));
  });

  /* ---------- Clipboard ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  function flash(el, label) {
    if (!el.dataset.label) el.dataset.label = el.textContent;
    el.textContent = label;
    el.setAttribute("data-copied", "");
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = el.dataset.label; el.removeAttribute("data-copied"); }, 1700);
  }
  const textOf = (el) => { const c = el.cloneNode(true); $$(".p", c).forEach((n) => n.remove()); return c.textContent.replace(/\s+$/, ""); };
  function addCopy(host, source, label) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "copy"; btn.textContent = "Copy";
    btn.setAttribute("aria-label", label || "Copy to clipboard");
    btn.addEventListener("click", async () => flash(btn, (await copyText(textOf(source))) ? "Copied" : "Select & copy"));
    host.append(btn);
  }
  const scrollers = [];
  $$(".code").forEach((block) => {
    const pre = $("pre", block);
    if (!pre) return;
    let head = $(".code-head", block);
    if (!head) { head = document.createElement("div"); head.className = "code-head"; head.innerHTML = "<span>Terminal</span>"; block.prepend(head); }
    addCopy(head, pre, "Copy code");
    scrollers.push([pre, ($("span", head) || head).textContent.trim()]);
  });
  // Code that scrolls sideways must be reachable by keyboard; read all sizes in one layout pass.
  const markScrollers = () => {
    const wide = scrollers.map(([pre]) => pre.scrollWidth > pre.clientWidth + 1);
    scrollers.forEach(([pre, label], i) => {
      if (wide[i]) { pre.tabIndex = 0; pre.setAttribute("role", "region"); pre.setAttribute("aria-label", label ? `Code: ${label}` : "Code"); }
      else if (pre.hasAttribute("tabindex")) { pre.removeAttribute("tabindex"); pre.removeAttribute("role"); pre.removeAttribute("aria-label"); }
    });
  };
  requestAnimationFrame(markScrollers);
  addEventListener("resize", rafThrottle(markScrollers));
  $$(".cmd").forEach((c) => { const code = $("code", c); if (code) addCopy(c, code, "Copy command"); });

  /* ---------- OS tabs (synced across the page) ---------- */
  function detectOS() {
    const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "").toLowerCase();
    if (p.includes("win")) return "win";
    if (p.includes("linux") || p.includes("android") || p.includes("cros")) return "linux";
    return "mac";
  }
  const tabGroups = $$("[data-tabs]").map((tabs) => {
    const btns = $$(".tab", tabs);
    const panels = $$(".tab-panel", tabs);
    const select = (i, focus) => {
      btns.forEach((b, j) => { const on = i === j; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (panels[j]) panels[j].hidden = !on; });
      if (focus) btns[i].focus();
    };
    btns.forEach((b, i) => {
      b.addEventListener("click", () => { select(i); if (b.dataset.os) syncOS(b.dataset.os, tabs); });
      b.addEventListener("keydown", (e) => {
        const n = { ArrowRight: (i + 1) % btns.length, ArrowLeft: (i - 1 + btns.length) % btns.length, Home: 0, End: btns.length - 1 }[e.key];
        if (n !== undefined) { e.preventDefault(); select(n, true); }
      });
    });
    return { tabs, btns, select };
  });
  function syncOS(os, except) {
    tabGroups.forEach((g) => { if (g.tabs === except) return; const i = g.btns.findIndex((b) => b.dataset.os === os); if (i >= 0) g.select(i); });
  }
  const os = detectOS();
  tabGroups.forEach((g) => { const i = g.btns.findIndex((b) => b.dataset.os === os); g.select(i >= 0 ? i : 0); });

  /* ---------- Live round trip to this site's server ---------- */
  let rttPromise = null;
  function measureRTT() {
    if (rttPromise) return rttPromise;
    rttPromise = (async () => {
      const samples = [];
      for (let i = 0; i < 6; i++) {
        const url = new URL(`/healthz?rtt=${Date.now().toString(36)}${i}`, location.href).href;
        const t0 = performance.now();
        try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) return null; await r.text(); } catch (e) { return null; }
        let d = performance.now() - t0;
        const entry = performance.getEntriesByName(url).pop();
        if (entry && entry.requestStart > 0 && entry.responseStart > entry.requestStart) d = entry.responseStart - entry.requestStart;
        if (i > 0) samples.push(d);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    })();
    return rttPromise;
  }
  const fmtMs = (v) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v).toString());
  $$("[data-live-rtt]").forEach((el) => {
    let done = false;
    onVisible(el, async (vis) => {
      if (!vis || done) return;
      done = true;
      const v = await measureRTT();
      el.textContent = v == null ? el.dataset.liveRttFallback || "unavailable" : `≈ ${fmtMs(v)} ms`;
      el.classList.add("measured");
    }, { margin: "200px" });
  });

  /* ---------- Approximate location, computed locally from the time zone ---------- */
  const TZ = {
    "America/New_York": [40.7, -74], "America/Detroit": [42.3, -83], "America/Toronto": [43.7, -79.4], "America/Chicago": [41.9, -87.6],
    "America/Denver": [39.7, -105], "America/Phoenix": [33.4, -112], "America/Los_Angeles": [34.05, -118.2], "America/Vancouver": [49.3, -123.1],
    "America/Anchorage": [61.2, -149.9], "Pacific/Honolulu": [21.3, -157.8], "America/Mexico_City": [19.4, -99.1], "America/Bogota": [4.7, -74.1],
    "America/Lima": [-12, -77], "America/Santiago": [-33.4, -70.6], "America/Sao_Paulo": [-23.5, -46.6], "America/Argentina/Buenos_Aires": [-34.6, -58.4],
    "America/Caracas": [10.5, -66.9], "America/Halifax": [44.6, -63.6], "Europe/London": [51.5, -0.1], "Europe/Dublin": [53.3, -6.3],
    "Europe/Lisbon": [38.7, -9.1], "Europe/Madrid": [40.4, -3.7], "Europe/Paris": [48.9, 2.35], "Europe/Brussels": [50.85, 4.35],
    "Europe/Amsterdam": [52.4, 4.9], "Europe/Berlin": [52.5, 13.4], "Europe/Zurich": [47.4, 8.5], "Europe/Rome": [41.9, 12.5],
    "Europe/Vienna": [48.2, 16.4], "Europe/Prague": [50.1, 14.4], "Europe/Stockholm": [59.3, 18.1], "Europe/Oslo": [59.9, 10.75],
    "Europe/Copenhagen": [55.7, 12.6], "Europe/Helsinki": [60.2, 24.9], "Europe/Warsaw": [52.2, 21], "Europe/Athens": [38, 23.7],
    "Europe/Istanbul": [41, 29], "Europe/Kyiv": [50.45, 30.5], "Europe/Kiev": [50.45, 30.5], "Europe/Moscow": [55.75, 37.6],
    "Africa/Casablanca": [33.6, -7.6], "Africa/Lagos": [6.5, 3.4], "Africa/Cairo": [30, 31.2], "Africa/Nairobi": [-1.3, 36.8],
    "Africa/Johannesburg": [-26.2, 28], "Asia/Dubai": [25.2, 55.3], "Asia/Riyadh": [24.7, 46.7], "Asia/Tehran": [35.7, 51.4],
    "Asia/Karachi": [24.9, 67], "Asia/Kolkata": [21, 78], "Asia/Calcutta": [21, 78], "Asia/Dhaka": [23.8, 90.4],
    "Asia/Bangkok": [13.75, 100.5], "Asia/Ho_Chi_Minh": [10.8, 106.7], "Asia/Jakarta": [-6.2, 106.8], "Asia/Singapore": [1.35, 103.8],
    "Asia/Kuala_Lumpur": [3.1, 101.7], "Asia/Manila": [14.6, 121], "Asia/Hong_Kong": [22.3, 114.2], "Asia/Shanghai": [31.2, 121.5],
    "Asia/Taipei": [25, 121.5], "Asia/Seoul": [37.6, 127], "Asia/Tokyo": [35.7, 139.7], "Australia/Perth": [-31.95, 115.9],
    "Australia/Adelaide": [-34.9, 138.6], "Australia/Brisbane": [-27.5, 153], "Australia/Sydney": [-33.9, 151.2], "Australia/Melbourne": [-37.8, 145],
    "Pacific/Auckland": [-36.85, 174.8],
  };
  let LOC = null;
  function approxLocation() {
    if (LOC) return LOC;
    LOC = locate();
    return LOC;
  }
  function locate() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignore */ }
    if (TZ[tz]) return { lat: TZ[tz][0], lon: TZ[tz][1] };
    const lon = Math.max(-170, Math.min(175, -new Date().getTimezoneOffset() / 4));
    const lat = /^Australia|^Pacific\/(Auckland|Fiji)/.test(tz) ? -30 : /^Africa/.test(tz) ? 5 : /^Europe/.test(tz) ? 48 : /^Asia/.test(tz) ? 28 : /^America\/(Argentina|Sao|Santiago|Lima|La_Paz|Montevideo|Asuncion)/.test(tz) ? -20 : 35;
    return { lat, lon };
  }

  /* ---------- Color probe (resolves CSS custom properties for canvas) ---------- */
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
  document.body.appendChild(probe);
  const cssColor = (v) => { probe.style.color = `var(${v})`; const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]; return m.slice(0, 3).map(Number); };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /* ---------- Dotted globe ---------- */
  // Land mask: Natural Earth 1:110m, sampled every 1.5° (see tools/landmask.py).
  const LAND = "////+///z///+P+///wP9n///h/8L////A/+A////+A//wH////4ABP4A/////4AAAEAP/////wAAAGAAf/7///gAAADAAAD/P//4AAAAAAAAAH8//+AAAAAAQAAAAMAFlgAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAABxgAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAMAAAAAAAAD4AAAAAAAAAAAAAAAAAAwAAAAAAAAD4AAAAAAAAAAAAAAAAEACAAAAAAAAAeAAAAAAAAAAAAAAAAAMADAAAAAAAAAH4AAAAAAAAAAAAAAAAAAACAAAAAAAAAH+AAAAAAAAAAAAAAAAAUAAwAAAAAAAAA/4AAAAAAAAAAAAAAAAA+AAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAP4AEAAAAAAAAAAf+AAAAAAHgAAAAAAAHwL+AAAAAAAAAAAAD/4AAAAAAfgAAAAAAAPw/+AAAAAAAAAAAAD/8AAAAAAfwAAAAAAAH///gAAAAAAAAAAAAf/wAAAAAD/gAAAAAAAf///AAAAAAAAAAAAAf/wAAAAAD/wAAAAAAAP///gAAAAAAAAAAAAD/+AAAAAAf/AAAAAAAA////AAAAAAAAAAAAAD//AAAAAAP/wMAAAAAAP///gAAAAAAAAAAAAAf/+AAAAAB//BwAAAAAA///+AAAAAAAAAAAAAAf//gAAAAB//BwAAAAAAP//+AEAAAAAAAAAAAAH//4AAAAAf/wOAAAAAAAf//gAAAAAAAAAAAAAA///gAAAAD//g8AAAAAAAf/+AAAAAAAAAAAAAAB///wAAAAD//4cAAAAAAAP/uAAAAAAAAAAAAAAB///8AAAAA///DAAAAAAAA/xwAAAAAAAAAAAAAAf///gAAAAD//+CAAAAAAAAvDAAAAAAAAAAAAAAA////gAAAAB//8AAAAAAAAAHiAAAAAAAAAAAAAAA////wAAAAB//+AAAAAAAAAABAAAAAAAAAAAAAAAf///+AAAAAf//gAAAAAAABIAAgAAAAAAAAAAAAAD////4AAAAB//8AAAAAAADAAHkBAAAAAAAAAAAAAf////gAAAAP//wAAAAAADQAAPgQAAAAAAAAAAAAB////+AAAAA///AAAAAAAIAAA+AAAAAAAAAAAAAAD////wAAAAB///AAAAAABwAgP4AAAAAAAAAAAAAAH///4AAAAAH///AAAAAADj7ALAAAAAAAAAAAAAAAH///wAAAAAH///gAAAAADD4CQAAAAAAAAAAAAAAAD///AAAAAAH///wAAAAAHD9yAAAAAAAAAAAAAAAAB//+AAAAAAH///8AAAAANB8AAAAAAAAAAAAAAAAAB//+AAAAAAH///8AAAAAWA4AAAAAAAAAAAAAAAAAD//4AAAAfh////8AAAABMA4AAAAAAAAAAAAAAAAAH/8AAAAD//////4AABAAgBDAAAAAAAAAAAAAAAAC//gAAAAf//////gAAUAEAAcAAAAAAAAAAAAAAABg34AAAAD//////+AADAAhASAAAAAAAAAAAAAAAAYDgAAAAB//////xgABwAJwFQAAAAAAAAAAAAAAAcAAAAAAB//////4AABwAL4AgAAAAAAAAAAAAAAD8AAAAAAD//////eAADgAfwCAAAAAAAAAAAAAABfgAAAAAAH/////5+AAeAD+AwAAAAAAAAAAAAAB/gAAAAAAB/////8/4APwD/AIAAAAAAAAAAAAAD4wAwAAAAB/////5/4Af4H8gAAAAAAAAAAAAAAfhgYAAAAAH/////n/wB/x/wAAAAAAAAAAAAAAD4AMAAAAAB/////z/8B/+//gAAAAAAAAAAAAAD4AAAAAAAA/////n/8D////5AAAAAAAAAAAABPwAAAAAAAD////8/yA/////oAAAAAAAAAAAAv4AQAAAAAB////9/g//////gAAAAAAAAAAAC/wDAAAAAAH////v8//////8AAAAAAAAAAAA/8RAAAAAAA/////5//////8AAAAAAAAAAAD//8AAAAAAH//v/////////AAAAAAAAAAAD///AAAAAAD//GB////////BAAAAAAAAAAf//+AAAAAAH/gAH///////wWAAAAAAAAAf///wAAAAAC/gIH///////CeAAAAAAAAD///+AAAAAAx4A7///////zDAAAAAAAAH///8AAAAAPgA3/5/////4wIAAAAAAAD///+AAAAAHggn/5/////6gQAAAAAAAP///8AAAAA+DPO+f/////4IAAAAAAAf///4AAAAD458Dj//////DAAAAAAAH///+gAAAAf38HP//////iAAAAAAA/////AAAAH/+Xz//////gAAAAAAD////hgAAB//////////4AAAAAAD////mAAAH//////////wAAAAAD////KAAAB/////////9AAAAAAf//3/AAAHf////////+CAAAAD//+/8AADz////////8DAAIAH//9/gAAKA///////8AwACAH//h+AAAQp///////AcAAwP/+B8AAAgx//////8DAA4P/+B0AAAHz//////5IAPv//g4BAAHv//////94B///4IBgADn///////4D///Qw4EA7///////0///+4eDAd3//////x///znwAH9/f////P/5eY/AB+v////8PldDH8AOBf//8UAFnw/gABP/7wAAbMH4AAl/4AABAB/AAQeAAACIPwAEHCAAAX+AAAAAAH/hAAAAAf4QCAAD/AAAABAAAAAAAAAAAA";
  let LAND_XYZ = null;
  const D2R = Math.PI / 180;
  const xyz = (lat, lon) => { const c = Math.cos(lat * D2R); return [c * Math.sin(lon * D2R), Math.sin(lat * D2R), c * Math.cos(lon * D2R)]; };
  function landPoints() {
    if (LAND_XYZ) return LAND_XYZ;
    const bin = atob(LAND), STEP = 1.5, out = [];
    let idx = 0;
    for (let i = 0; i < 180 / STEP; i++) {
      const lat = (-90 + STEP * (i + 0.5)) * D2R, c = Math.cos(lat), y = Math.sin(lat);
      const n = Math.max(1, Math.round((360 / STEP) * c));
      for (let j = 0; j < n; j++, idx++) {
        if ((bin.charCodeAt(idx >> 3) >> (7 - (idx & 7))) & 1) {
          const lon = (-180 + ((j + 0.5) * 360) / n) * D2R;
          out.push(c * Math.sin(lon), y, c * Math.cos(lon));
        }
      }
    }
    LAND_XYZ = new Float32Array(out);
    return LAND_XYZ;
  }
  // Graticule polylines, computed once: meridians every 20°, parallels every 20° up to ±60°.
  let GRAT = null;
  function graticule() {
    if (GRAT) return GRAT;
    GRAT = [];
    for (let lon = -180; lon < 180; lon += 20) { const a = []; for (let t = -90; t <= 90; t += 3) a.push(...xyz(t, lon)); GRAT.push(new Float32Array(a)); }
    for (let lat = -60; lat <= 60; lat += 20) { const a = []; for (let t = -180; t <= 180; t += 3) a.push(...xyz(lat, t)); GRAT.push(new Float32Array(a)); }
    return GRAT;
  }
  // Great-circle arc between two unit vectors, lifted off the surface, as flat xyz triples.
  const ARC_N = 56;
  function arcPoints(a, b, lift = 0.16) {
    const om = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), so = Math.sin(om) || 1, out = new Float32Array((ARC_N + 1) * 3);
    for (let i = 0; i <= ARC_N; i++) {
      const t = i / ARC_N, k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so, alt = 1 + Math.min(0.2, lift * om) * Math.sin(Math.PI * t);
      for (let d = 0; d < 3; d++) out[i * 3 + d] = (a[d] * k1 + b[d] * k2) * alt;
    }
    return out;
  }
  const TAU = Math.PI * 2;
  const clampLat = (v) => Math.max(-50, Math.min(50, v));
  const REGIONS = [
    ["N. Virginia", 39, -77.5], ["Ohio", 40, -83], ["Oregon", 45.6, -121.2], ["N. California", 37.4, -121.9], ["Montréal", 45.5, -73.6],
    ["Querétaro", 20.6, -100.4], ["São Paulo", -23.5, -46.6], ["Santiago", -33.4, -70.6], ["Dublin", 53.3, -6.3], ["London", 51.5, -0.1],
    ["Paris", 48.9, 2.35], ["Frankfurt", 50.1, 8.7], ["Stockholm", 59.3, 18.1], ["Milan", 45.5, 9.2], ["Tel Aviv", 32.1, 34.8],
    ["Johannesburg", -26.2, 28], ["UAE", 25.2, 55.3], ["Mumbai", 19.1, 72.9], ["Singapore", 1.35, 103.8], ["Jakarta", -6.2, 106.8],
    ["Hong Kong", 22.3, 114.2], ["Seoul", 37.6, 127], ["Tokyo", 35.7, 139.7], ["Osaka", 34.7, 135.5], ["Sydney", -33.9, 151.2],
  ];

  class Globe {
    constructor(canvas, opts = {}) {
      this.c = canvas; this.ctx = canvas.getContext("2d");
      this.o = Object.assign({ speed: 5, tilt: 18, labels: false, arcs: 4, scale: 0.42, you: true, fps: 30 }, opts);
      const loc = approxLocation();
      this.you = loc;
      this.lon0 = loc.lon + (this.o.offset || 0);
      this.lat0 = this.o.centerYou ? clampLat(loc.lat) : Math.max(-35, Math.min(35, loc.lat * 0.6)) || this.o.tilt;
      this.vel = 0; this.drag = null; this.running = false; this.last = 0; this.lastDraw = 0; this.t = 0;
      this.pts = landPoints();
      this.grat = graticule();
      const n = this.pts.length / 3;
      this.bk = [0, 1, 2, 3].map(() => new Float32Array(n * 2));
      this.bn = new Int32Array(4);
      this.q = new Float32Array(3);
      this.scr = new Float32Array((ARC_N + 1) * 2);
      this.vis = new Uint8Array(ARC_N + 1);
      this.regions = REGIONS.map(([name, la, lo]) => ({ n: name.toUpperCase(), p: xyz(la, lo) }));
      this.youP = xyz(loc.lat, loc.lon);
      this.pickArcs();
      this.readColors();
      this.resize();
      new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas);
      document.addEventListener("themechange", () => { this.readColors(); this.draw(); });
      if (this.o.interactive) this.bindDrag();
      this.loop = this.loop.bind(this);
      this.draw();
      canvas.classList.add("drawn");
    }
    recenter() { this.lon0 = this.you.lon; this.lat0 = clampLat(this.you.lat); this.vel = 0; }
    pickArcs() {
      // Arcs from "you" to a spread of regions (only nearby ones when asked), plus a few region-to-region links.
      const y = this.youP;
      const byDist = this.regions.map((r) => ({ r, d: Math.acos(Math.min(1, r.p[0] * y[0] + r.p[1] * y[1] + r.p[2] * y[2])) })).sort((a, b) => a.d - b.d);
      const pool = this.o.near ? byDist.filter((x) => x.d > 0.3 && x.d < 1.25) : byDist;
      const pick = (f) => pool[Math.min(pool.length - 1, Math.floor(pool.length * f))];
      const picks = (pool.length >= 4 ? [pick(0.1), pick(0.4), pick(0.7), pick(0.97)] : [byDist[2], byDist[8], byDist[14], byDist[20]]).filter(Boolean).slice(0, this.o.arcs);
      this.arcs = picks.map((x, i) => ({ pts: arcPoints(y, x.r.p), off: i * 0.27, sp: 0.16 + i * 0.03 }));
      if (this.o.arcs > 4) {
        const R = (n) => this.regions.find((r) => r.n === n).p;
        [["FRANKFURT", "SINGAPORE", 0.5, 0.14], ["N. VIRGINIA", "SÃO PAULO", 0.1, 0.18], ["TOKYO", "OREGON", 0.7, 0.15]].forEach(([a, b, off, sp]) => this.arcs.push({ pts: arcPoints(R(a), R(b)), off, sp }));
      }
    }
    readColors() {
      const c = { stroke: cssColor("--stroke"), blue: cssColor("--blue"), signal: cssColor("--signal"), ink3: cssColor("--ink-3"), surface: cssColor("--surface"), paper: cssColor("--paper") };
      const dk = (this.dark = doc.dataset.theme === "dark");
      this.c3 = c;
      this.st = {
        grat: rgba(c.stroke, dk ? 0.16 : 0.14), limb: rgba(c.stroke, dk ? 0.55 : 0.45),
        dots: [0, 1, 2, 3].map((k) => rgba(c.blue, (dk ? 0.3 : 0.28) + k * 0.2)),
        arc: rgba(c.signal, dk ? 0.42 : 0.38), trail: Array.from({ length: 10 }, (_, k) => rgba(c.signal, (k / 9) * 0.95)),
        halo: rgba(c.signal, 0.25), sig: rgba(c.signal, 1),
      };
      this.grads = null;
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.c.clientWidth || 300, h = this.c.clientHeight || 300;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.dpr = dpr; this.w = w; this.h = h; this.grads = null;
    }
    gradients(cx, cy, R) {
      if (this.grads && this.grads.R === R) return this.grads;
      const { ctx, c3: c, dark: dk } = this;
      const atm = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
      atm.addColorStop(0, rgba(c.blue, dk ? 0.32 : 0.16)); atm.addColorStop(1, rgba(c.blue, 0));
      const disc = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      disc.addColorStop(0, rgba(c.surface, 1)); disc.addColorStop(1, rgba(dk ? c.paper : c.surface, dk ? 1 : 0.92));
      return (this.grads = { R, atm, disc });
    }
    bindDrag() {
      const c = this.c;
      c.addEventListener("pointerdown", (e) => { this.drag = { x: e.clientX, y: e.clientY, lon: this.lon0, lat: this.lat0 }; this.vel = 0; c.setPointerCapture(e.pointerId); });
      c.addEventListener("pointermove", (e) => {
        if (!this.drag) return;
        const k = 160 / (this.R || 200), now = performance.now();
        const nl = this.drag.lon - (e.clientX - this.drag.x) * k * 0.55;
        this.vel = ((nl - this.lon0) / Math.max(8, now - (this.drag.lt || now - 16))) * 16;
        this.drag.lt = now;
        this.lon0 = nl;
        this.lat0 = Math.max(-60, Math.min(60, this.drag.lat + (e.clientY - this.drag.y) * k * 0.4));
        if (!this.running) this.draw();
      });
      const end = () => { this.drag = null; };
      c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    }
    start() { if (this.running) return; this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
    stop() { this.running = false; }
    loop(now) {
      if (!this.running) return;
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
      this.t += dt;
      if (!this.drag) {
        if (Math.abs(this.vel) > 0.01) { this.lon0 += this.vel; this.vel *= 0.94; }
        else if (!reduced()) this.lon0 -= this.o.speed * dt;
      }
      // A slow spin looks the same at 30 fps and costs half the work; dragging gets every frame.
      if (this.drag || now - this.lastDraw >= 1000 / this.o.fps - 4) { this.lastDraw = now; this.draw(); }
      requestAnimationFrame(this.loop);
    }
    rot(x, y, z) {
      const x1 = x * this.ca + z * this.sa, z1 = -x * this.sa + z * this.ca, q = this.q;
      q[0] = x1; q[1] = y * this.cb - z1 * this.sb; q[2] = y * this.sb + z1 * this.cb;
      return q;
    }
    draw() {
      const { ctx, dpr, w, h, st } = this;
      const R = (this.R = Math.min(w, h) * this.o.scale), cx = w / 2, cy = h / 2;
      const a = -this.lon0 * D2R, b = this.lat0 * D2R;
      const ca = (this.ca = Math.cos(a)), sa = (this.sa = Math.sin(a)), cb = (this.cb = Math.cos(b)), sb = (this.sb = Math.sin(b));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const g = this.gradients(cx, cy, R);
      ctx.fillStyle = g.atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, TAU); ctx.fill();
      ctx.fillStyle = g.disc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      // graticule
      ctx.lineWidth = 1; ctx.strokeStyle = st.grat; ctx.beginPath();
      for (const L of this.grat) {
        let pen = false;
        for (let i = 0; i < L.length; i += 3) {
          const q = this.rot(L[i], L[i + 1], L[i + 2]);
          if (q[2] > 0) { const x = cx + q[0] * R, y = cy - q[1] * R; if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; } else pen = false;
        }
      }
      ctx.stroke();
      // land dots, bucketed by depth: one path and one fill per bucket
      const P = this.pts, bk = this.bk, bn = this.bn;
      bn.fill(0);
      for (let i = 0; i < P.length; i += 3) {
        const x1 = P[i] * ca + P[i + 2] * sa, z1 = -P[i] * sa + P[i + 2] * ca, y = P[i + 1];
        const z2 = y * sb + z1 * cb;
        if (z2 <= 0.02) continue;
        const k = z2 >= 0.75 ? 3 : (z2 * 4) | 0, j = bn[k];
        bk[k][j] = cx + x1 * R; bk[k][j + 1] = cy - (y * cb - z1 * sb) * R; bn[k] = j + 2;
      }
      const base = Math.max(0.7, R / 210);
      for (let k = 0; k < 4; k++) {
        const s = base * (1.35 + k * 0.3), hs = s / 2, arr = bk[k], m = bn[k];
        ctx.fillStyle = st.dots[k]; ctx.beginPath();
        for (let i = 0; i < m; i += 2) ctx.rect(arr[i] - hs, arr[i + 1] - hs, s, s);
        ctx.fill();
      }
      // limb
      ctx.strokeStyle = st.limb; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      // arcs with travelling packets
      for (const arc of this.arcs) this.drawArc(arc, cx, cy, R);
      // regions
      const c = this.c3, rr = Math.max(2.6, R / 70);
      ctx.font = `500 ${Math.max(9, R / 26)}px "IBM Plex Mono", ui-monospace, monospace`;
      for (const r of this.regions) {
        const q = this.rot(r.p[0], r.p[1], r.p[2]);
        if (q[2] <= 0.05) continue;
        const x = cx + q[0] * R, y = cy - q[1] * R, z = q[2], col = rgba(c.stroke, Math.min(1, z * 1.6));
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, TAU); ctx.fill();
        if (this.o.labels && z > 0.55) { ctx.fillStyle = rgba(c.ink3, (z - 0.55) * 2.2); ctx.fillText(r.n, x + 7, y + 3); }
      }
      // you
      if (this.o.you) {
        const q = this.rot(this.youP[0], this.youP[1], this.youP[2]);
        if (q[2] > 0) {
          const x = cx + q[0] * R, y = cy - q[1] * R, ph = (this.t * 0.8) % 1;
          ctx.strokeStyle = rgba(c.signal, (1 - ph) * 0.8); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 4 + (ph * R) / 9, 0, TAU); ctx.stroke();
          ctx.fillStyle = st.sig; ctx.beginPath(); ctx.arc(x, y, Math.max(3.4, R / 55), 0, TAU); ctx.fill();
          ctx.fillText("YOU (APPROX.)", x + 9, y - 8);
        }
      }
    }
    drawArc(arc, cx, cy, R) {
      const { ctx, st } = this, P = arc.pts, S = this.scr, V = this.vis;
      for (let i = 0; i <= ARC_N; i++) {
        const q = this.rot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        S[i * 2] = cx + q[0] * R; S[i * 2 + 1] = cy - q[1] * R;
        V[i] = q[2] > -0.05 || q[0] * q[0] + q[1] * q[1] > 1 ? 1 : 0;
      }
      ctx.lineWidth = 1.3; ctx.strokeStyle = st.arc; ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= ARC_N; i++) { if (V[i]) { if (pen) ctx.lineTo(S[i * 2], S[i * 2 + 1]); else ctx.moveTo(S[i * 2], S[i * 2 + 1]); pen = true; } else pen = false; }
      ctx.stroke();
      const ph = reduced() ? 0.62 : (this.t * arc.sp + arc.off) % 1, head = Math.floor(ph * ARC_N), tail = Math.max(0, head - 9);
      ctx.lineWidth = 2.2;
      for (let i = tail; i < head; i++) {
        if (!V[i] || !V[i + 1]) continue;
        ctx.strokeStyle = st.trail[i - tail]; ctx.beginPath(); ctx.moveTo(S[i * 2], S[i * 2 + 1]); ctx.lineTo(S[i * 2 + 2], S[i * 2 + 3]); ctx.stroke();
      }
      if (V[head]) {
        ctx.fillStyle = st.halo; ctx.beginPath(); ctx.arc(S[head * 2], S[head * 2 + 1], 6, 0, TAU); ctx.fill();
        ctx.fillStyle = st.sig; ctx.beginPath(); ctx.arc(S[head * 2], S[head * 2 + 1], 2.6, 0, TAU); ctx.fill();
      }
    }
  }

  // Stand-alone globes (the cloud page hero) are built when the browser is idle, so they never hold up the page.
  const idle = (fn, timeout = 1500) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200));
  $$("canvas[data-globe]").forEach((c) => {
    let gl = null, vis = false;
    const sync = () => { if (gl) (vis && !document.hidden ? gl.start() : gl.stop()); };
    idle(() => { gl = new Globe(c, { interactive: true, labels: c.dataset.globe === "labels", arcs: 7, scale: 0.43, speed: 4.5 }); sync(); });
    onVisible(c, (v) => { vis = v; sync(); });
    document.addEventListener("visibilitychange", sync);
  });

  /* ---------- Journey: localhost → home → ISP → internet → cloud ---------- */
  const journey = $("[data-journey]");
  if (journey) {
    const steps = $$(".step", journey);
    const canvas = $(".stage-canvas", journey);
    const layers = [...$$(".stage-svg .lvl", journey), canvas].filter(Boolean);
    const hud = Object.fromEntries($$("[data-hud]", journey).map((el) => [el.dataset.hud, el]));
    const rail = $$(".zoom-rail span", journey);
    const stage = $(".stage", journey);
    let globe = null;
    const makeGlobe = () => (globe || !canvas ? globe : (globe = new Globe(canvas, { arcs: 4, scale: 0.36, speed: 2.5, centerYou: true, near: true })));
    onVisible(journey, (v) => { if (v) idle(makeGlobe); }, { margin: "600px" });
    journey.classList.add("journey-ready");
    journey.classList.remove("no-js-stage");
    let cur = -1, prev = -1, liveRtt = null;
    measureRTT().then((v) => { liveRtt = v; if (cur >= 0) apply(cur, true); });
    function apply(i, force) {
      if (i === cur && !force) return;
      cur = i;
      layers.forEach((l) => {
        const n = +l.dataset.level;
        l.classList.toggle("is-past", n < i); l.classList.toggle("is-future", n > i); l.classList.toggle("is-current", n === i);
      });
      steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
      rail.forEach((r, j) => r.classList.toggle("on", j === i));
      if (stage) stage.dataset.level = String(i);
      const ds = steps[i].dataset;
      ["scale", "dist", "rtt", "reach"].forEach((k) => { if (hud[k] && ds[k]) hud[k].textContent = ds[k]; });
      if (hud.rtt) {
        const live = ds.rtt === "live";
        hud.rtt.classList.toggle("sig", live);
        if (live) hud.rtt.textContent = liveRtt != null ? `≈ ${fmtMs(liveRtt)} ms (you → here)` : "measuring…";
      }
      const g = i >= 2 ? makeGlobe() : globe;
      if (g) {
        if (i === 3 && prev !== 3) g.recenter();
        if (i >= 2) g.start(); else g.stop();
      }
      prev = i;
    }
    const pick = () => {
      const mobile = matchMedia("(max-width: 900px)").matches;
      const line = innerHeight * (mobile ? 0.8 : 0.58);
      let idx = 0;
      steps.forEach((s, j) => { if (s.getBoundingClientRect().top < line) idx = j; });
      apply(idx);
    };
    addEventListener("scroll", rafThrottle(pick), { passive: true });
    addEventListener("resize", rafThrottle(pick));
    pick();
  }

  /* ---------- Who can reach my server? ---------- */
  $$("[data-explorer]").forEach((root) => {
    const MODES = {
      loopback: {
        barriers: ["iface", "nat"],
        clients: {
          laptop: [true, "Works", "http://localhost:3000 — the request loops back inside your laptop."],
          phone: [false, "Connection refused", "Your phone reaches your laptop, but the server only accepts connections from 127.0.0.1."],
          friend: [false, "Can't get in", "Your home router has no rule to forward strangers to your laptop, so the connection never arrives."],
        },
      },
      all: {
        barriers: ["nat"],
        clients: {
          laptop: [true, "Works", "localhost still works — 0.0.0.0 includes the loopback interface."],
          phone: [true, "Works on the same Wi-Fi", "Open http://192.168.1.23:3000 (your laptop's LAN address). A firewall may still ask for permission."],
          friend: [false, "Still blocked", "0.0.0.0 opens every door of your laptop — but your laptop is still inside your home network."],
        },
      },
      cloud: {
        barriers: [],
        clients: {
          laptop: [true, "Works", "https://my-app.example.com — you reach it over the internet like everyone else."],
          phone: [true, "Works anywhere", "On Wi-Fi or cellular — the server has a public address."],
          friend: [true, "Works", "Anyone with the link can open it, any time, even when your laptop is closed."],
        },
      },
    };
    const btns = $$("[data-mode]", root);
    const set = (mode) => {
      const d = MODES[mode];
      if (!d) return;
      root.dataset.mode = mode;
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      Object.entries(d.clients).forEach(([k, [ok, title, text]]) => {
        $$(`[data-client="${k}"]`, root).forEach((g) => (g.dataset.state = ok ? "ok" : "no"));
        const out = $(`[data-out="${k}"]`, root);
        if (out) {
          const b = $("b", out), p = $("span.t", out);
          b.textContent = ""; const i = document.createElement("i"); i.className = ok ? "ok-i" : "no-i"; i.textContent = ok ? "✓" : "✕"; i.setAttribute("aria-hidden", "true");
          b.append(i, document.createTextNode(`${out.dataset.name}: ${title}`));
          p.textContent = text;
        }
      });
      $$("[data-barrier]", root).forEach((el) => (el.dataset.active = String(d.barriers.includes(el.dataset.barrier))));
      $$("[data-mode-show]", root).forEach((el) => (el.style.opacity = el.dataset.modeShow.split(" ").includes(mode) ? "1" : "0"));
    };
    btns.forEach((b) => b.addEventListener("click", () => set(b.dataset.mode)));
    set(root.dataset.mode || "loopback");
  });

  /* ---------- Port simulator ---------- */
  // Ports browsers refuse to request (WHATWG Fetch "bad port" list).
  const BAD_PORTS = new Set([0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);
  $$("[data-portsim]").forEach((root) => {
    const input = $("input[type=number]", root);
    const sw = $("[data-app-switch]", root);
    const result = $(".sim-result", root);
    const pkt = $(".sim-packet", root);
    const doors = $$(".door", root);
    const other = doors.find((d) => d.dataset.port === "other");
    const home = { x: +pkt.dataset.x, y: +pkt.dataset.y };
    const SERVICES = { 3000: { name: "your app", http: true, toggle: true }, 5432: { name: "PostgreSQL", http: false } };
    const listening = (p) => (SERVICES[p] ? (SERVICES[p].toggle ? !sw || sw.checked : true) : false);
    const paintDoors = () => doors.forEach((d) => d.classList.toggle("listening", listening(+d.dataset.port)));
    const say = (kind, title, text) => {
      result.dataset.kind = kind;
      $(".ico", result).textContent = { ok: "200", refused: "✕", blocked: "⛔", nothttp: "?", invalid: "!" }[kind] || "·";
      $(".sim-title", result).textContent = title;
      $("p:not(.sim-title)", result).textContent = text;
    };
    const move = (x, y) => { pkt.style.transform = `translate(${x - home.x}px, ${y - home.y}px)`; };
    let timer = null;
    const echo = () => $$("[data-port-echo]", root).forEach((e) => (e.textContent = input.value || "____"));
    input.addEventListener("input", echo);
    function send() {
      clearTimeout(timer);
      echo();
      const port = Number(input.value);
      doors.forEach((d) => d.classList.remove("hit", "ok", "refused"));
      move(home.x, home.y);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        say("invalid", "Not a valid port", "Ports are whole numbers from 1 to 65535 (port 0 is reserved). Try 3000.");
        return;
      }
      if (BAD_PORTS.has(port)) {
        pkt.style.opacity = "1";
        say("blocked", "ERR_UNSAFE_PORT", `Your browser refuses to send web requests to port ${port} at all — it's on a short list of ports used by other protocols (SSH, mail, IRC…). The packet never leaves the browser.`);
        return;
      }
      let door = doors.find((d) => +d.dataset.port === port);
      if (!door && other) { door = other; $(".door-num", other).textContent = String(port); $(".door-what", other).textContent = "?"; }
      const tx = +door.dataset.x, ty = +door.dataset.y;
      pkt.style.opacity = "1";
      requestAnimationFrame(() => move(tx, ty));
      timer = setTimeout(() => {
        door.classList.add("hit");
        const svc = SERVICES[port];
        if (listening(port) && svc && svc.http) { door.classList.add("ok"); say("ok", "200 OK", `Something is listening on port ${port} — ${svc.name} answers, and the page loads.`); }
        else if (listening(port) && svc) { door.classList.add("ok"); say("nothttp", "Something answered — but it doesn't speak HTTP", `${svc.name} is listening on ${port}, but it isn't a web server, so the browser shows an empty or invalid response.`); }
        else { door.classList.add("refused"); say("refused", "ERR_CONNECTION_REFUSED", `localhost refused to connect: nothing is listening on port ${port}${port === 3000 ? " — your app isn't running" : ""}. The operating system turns the request away instantly.`); }
        setTimeout(() => move(home.x, home.y), 900);
      }, reduced() ? 0 : 900);
    }
    $("[data-send]", root)?.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    $$("[data-port-chip]", root).forEach((c) => c.addEventListener("click", () => { input.value = c.dataset.portChip; send(); }));
    sw?.addEventListener("change", () => { paintDoors(); send(); });
    paintDoors();
  });

  /* ---------- Port reference filter ---------- */
  $$("[data-port-filter]").forEach((input) => {
    const table = $("[data-port-table]");
    if (!table) return;
    const rows = $$("tbody tr", table).filter((r) => !r.classList.contains("tgroup") && !r.classList.contains("port-none"));
    const groups = $$("tr.tgroup", table);
    const none = $("tr.port-none", table);
    const count = $("[data-port-count]");
    const run = () => {
      const q = input.value.trim().toLowerCase().replace(/^:/, "");
      let n = 0;
      rows.forEach((r) => { const hit = !q || r.textContent.toLowerCase().includes(q); r.hidden = !hit; if (hit) n++; });
      groups.forEach((g) => {
        let el = g.nextElementSibling, any = false;
        while (el && !el.classList.contains("tgroup")) { if (!el.hidden && !el.classList.contains("port-none")) any = true; el = el.nextElementSibling; }
        g.hidden = !any;
      });
      if (none) none.hidden = n > 0;
      if (count) count.textContent = q ? `${n} match${n === 1 ? "" : "es"}` : `${rows.length} ports`;
    };
    input.addEventListener("input", run);
    run();
  });

  /* ---------- Sequence diagram ---------- */
  $$("[data-seq]").forEach((root) => {
    const msgs = $$(".msg", root);
    const clock = $("[data-clock]", root);
    const replay = $("[data-replay]", root);
    let timers = [];
    doc.classList.add("seq-ready");
    const reset = () => { timers.forEach(clearTimeout); timers = []; msgs.forEach((m) => m.classList.remove("on")); };
    const play = () => {
      reset();
      if (reduced()) { msgs.forEach((m) => m.classList.add("on")); if (clock) clock.textContent = msgs[msgs.length - 1].dataset.t + " ms"; return; }
      msgs.forEach((m, i) => timers.push(setTimeout(() => { m.classList.add("on"); if (clock) clock.textContent = `${m.dataset.t} ms`; }, 350 + i * 900)));
    };
    let played = false;
    onVisible(root, (vis) => { if (vis && !played) { played = true; play(); } }, { threshold: 0.35 });
    replay?.addEventListener("click", play);
  });

  /* ---------- Latency ladder ---------- */
  $$("[data-viz=latency]").forEach((root) => {
    const MIN = 0.01, MAX = 1000, span = Math.log10(MAX) - Math.log10(MIN);
    const pos = (ms) => Math.max(0.4, ((Math.log10(Math.max(MIN, ms)) - Math.log10(MIN)) / span) * 100);
    const rows = $$(".viz-row", root);
    const tip = $(".viz-tip", root);
    const setRow = (row, ms) => { const w = pos(ms); row.style.setProperty("--w", `${w}%`); row.classList.toggle("inside", w > 72); };
    const draw = () => rows.forEach((r) => { if (r.dataset.ms) setRow(r, +r.dataset.ms); });
    // grid + axis
    const axis = $(".viz-axis", root), grid = $(".viz-grid", root);
    let sync = () => {};
    if (axis && grid) {
      sync = () => {
        const track = $(".viz-track", root), ax = axis.getBoundingClientRect(), tr = track.getBoundingClientRect(), op = grid.offsetParent.getBoundingClientRect();
        grid.style.left = `${tr.left - op.left}px`; grid.style.width = `${tr.width}px`;
        axis.style.marginLeft = `${tr.left - ax.left + (parseFloat(getComputedStyle(axis).marginLeft) || 0)}px`; axis.style.width = `${tr.width}px`;
      };
      [0.01, 0.1, 1, 10, 100, 1000].forEach((v) => {
        const p = pos(v);
        const s = document.createElement("span"); s.style.left = `${p}%`; s.textContent = v >= 1000 ? "1 s" : `${v} ms`; axis.append(s);
        const i = document.createElement("i"); i.style.left = `${p}%`; grid.append(i);
      });
      addEventListener("resize", rafThrottle(sync)); document.fonts?.ready.then(() => started && sync());
    }
    const show = (row, x, y) => {
      if (!tip) return;
      tip.textContent = "";
      const b = document.createElement("b"); b.textContent = $(".viz-val", row).textContent;
      const s = document.createElement("span"); s.textContent = row.dataset.note || $(".viz-label", row).textContent;
      tip.append(b, s);
      const host = root.getBoundingClientRect();
      tip.style.left = `${Math.min(host.width - 270, Math.max(0, x - host.left + 12))}px`;
      tip.style.top = `${y - host.top + 14}px`;
      tip.classList.add("on");
    };
    rows.forEach((row) => {
      const bar = $(".viz-bar", row);
      bar.addEventListener("pointermove", (e) => show(row, e.clientX, e.clientY));
      bar.addEventListener("pointerleave", () => tip?.classList.remove("on"));
      bar.addEventListener("focus", () => { const r = bar.getBoundingClientRect(); show(row, r.right, r.top); });
      bar.addEventListener("blur", () => tip?.classList.remove("on"));
    });
    let started = false;
    onVisible(root, async (vis) => {
      if (!vis || started) return;
      started = true;
      draw();
      sync();
      const live = $(".viz-row.is-live", root);
      if (!live) return;
      const v = await measureRTT();
      const val = $(".viz-val", live), cell = $("[data-live-cell]", root);
      if (v == null) { val.textContent = "unavailable"; if (cell) cell.textContent = "unavailable"; return; }
      setRow(live, v);
      val.textContent = `≈ ${fmtMs(v)} ms`;
      if (cell) cell.textContent = `≈ ${fmtMs(v)} ms`;
    }, { threshold: 0.2 });
  });

  /* ---------- Launchpad: one-click prompts for AI assistants ---------- */
  const AI_URL = {
    chatgpt: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`,
    claude: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
    grok: (p) => `https://grok.com/?q=${encodeURIComponent(p)}`,
    claudecode: (p) => `claude-cli://open?q=${encodeURIComponent(p)}`,
  };
  $$("[data-launchpad]").forEach((root) => {
    const idea = $("[data-idea]", root);
    const preview = $("[data-prompt-preview]", root);
    const tpl = root.dataset.tpl;
    const chips = $$("[data-idea-chip]", root);
    const prompt = () => tpl.replace("{idea}", (idea && idea.value.trim()) || (idea && idea.placeholder) || "a small web app");
    const update = () => {
      const p = prompt();
      $$("[data-ai]", root).forEach((a) => { if (!a.hasAttribute("data-fixed")) a.href = AI_URL[a.dataset.ai](p); });
      if (preview) {
        const v = (idea && idea.value.trim()) || (idea && idea.placeholder) || "";
        const [pre, post] = tpl.split("{idea}");
        preview.textContent = "";
        const m = document.createElement("mark"); m.textContent = v;
        preview.append(document.createTextNode(pre), m, document.createTextNode(post || ""));
      }
    };
    idea?.addEventListener("input", () => { chips.forEach((c) => c.setAttribute("aria-pressed", "false")); update(); });
    chips.forEach((c) => c.addEventListener("click", () => { idea.value = c.dataset.ideaChip; chips.forEach((x) => x.setAttribute("aria-pressed", String(x === c))); update(); }));
    $$("[data-ai]", root).forEach((a) => a.addEventListener("click", () => {
      const p = a.hasAttribute("data-fixed") ? a.dataset.prompt : prompt();
      copyText(p).then((ok) => { const s = $("small", a); if (s && ok) flash(s, "Prompt copied too"); });
    }));
    if (tpl) update();
  });

  /* ---------- Typing terminal ---------- */
  $$("[data-term]").forEach((term) => {
    const lines = $$(".term-line", term);
    if (reduced() || !hasIO) return;
    term.classList.add("term-ready");
    const typed = lines.map((l) => { const t = $(".typed", l); return t ? t.textContent : null; });
    let running = false, visible = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function play() {
      if (running) return;
      running = true;
      while (visible) {
        lines.forEach((l) => l.classList.remove("on"));
        for (let i = 0; i < lines.length && visible; i++) {
          const l = lines[i];
          if (typed[i] != null) {
            const t = $(".typed", l); t.textContent = ""; l.classList.add("on");
            for (const ch of typed[i]) { t.textContent += ch; await wait(28 + Math.random() * 40); }
            await wait(450);
          } else { await wait(+l.dataset.delay || 520); l.classList.add("on"); }
        }
        await wait(5200);
      }
      running = false;
    }
    onVisible(term, (vis) => { visible = vis; if (vis) play(); });
  });

  /* ---------- Pipeline ---------- */
  $$("[data-pipeline]").forEach((p) => { if (!reduced()) onVisible(p, (vis) => p.classList.toggle("run", vis)); });
})();
