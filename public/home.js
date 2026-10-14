/* whatiswebhook.com — the polling calculator on the home page. */
(() => {
  "use strict";
  const root = document.querySelector("[data-polling]");
  if (!root) return;
  const EVERY = [1, 5, 10, 30, 60, 300, 900, 3600, 86400];
  const EVENTS = [1, 10, 50, 100, 500, 1000, 10000];
  const $ = (s) => root.querySelector(s);
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const dur = (s) => (s < 60 ? `${+s.toFixed(1)} s` : s < 3600 ? `${+(s / 60).toFixed(1)} min` : s < 86400 ? `${+(s / 3600).toFixed(1)} h` : `${+(s / 86400).toFixed(1)} days`);
  const pct = (p) => (p >= 0.9995 ? "99.9+ %" : p < 0.0005 ? "0 %" : `${(p * 100).toFixed(1)} %`);

  function update() {
    const every = EVERY[+$("[data-in=every]").value];
    const events = EVENTS[+$("[data-in=events]").value];
    const polls = 86400 / every;
    // Events arrive at random; a poll finds nothing if none happened since the last one.
    const empty = Math.exp(-events * every / 86400);
    $("[data-out=every]").textContent = dur(every);
    $("[data-out=events]").textContent = num(events);
    $("[data-r=poll-req]").textContent = num(polls);
    $("[data-r=poll-empty]").textContent = pct(empty);
    $("[data-r=poll-delay]").textContent = dur(every / 2);
    $("[data-r=hook-req]").textContent = num(events);
    const per = polls / events;
    $("[data-r=note]").textContent = per >= 1.5
      ? `Polling every ${dur(every)} costs ${num(per)} requests for each event you learn about, and news reaches you ${dur(every / 2)} late on average.`
      : `At this rate polling is cheap, but each event still reaches you ${dur(every / 2)} late on average. A webhook delivers it in under a second.`;
  }
  root.querySelectorAll("input[type=range]").forEach((i) => i.addEventListener("input", update));
  update();
})();
