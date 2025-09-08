/* global window, document, navigator, fetch */

const APPS_SCRIPT_URL = (window.STEADY_CONFIG && window.STEADY_CONFIG.APPS_SCRIPT_URL) || "";
const DEBUG = true;

// Pricing + credits
const PRICING = {
  quickfix: { label: "Quick Fix", price: 129, includedMinutes: 60, maxTasks: 1, extraPer15: 0 },
  standard: { label: "Standard Arrival", price: 229, includedMinutes: 90, maxTasks: 99, extraPer15: 25 },
  halfday:  { label: "Half Day", price: 499, includedMinutes: 240, maxTasks: 99, extraPer15: 0 },
  fullday:  { label: "Full Day", price: 899, includedMinutes: 480, maxTasks: 99, extraPer15: 0 },
  custom:   { label: "Custom Quote", price: 99,  includedMinutes: 0,  maxTasks: 99, extraPer15: 0 }
};
const CREDITS = { price: 59, quickfixBase: 2, standardBase: 4, overPer30: 1 };
const depositFor = a => (a === "custom" ? 99 : 49);

// Minimal demo checklist (edit freely)
const DATA = {
  "Handyman Services Seattle": [
    { task: "Test and tighten door handles, hinges, knobs", why: "Loose hardware causes wear and reduces security.", defaultMinutes: 15 },
    { task: "Lubricate squeaky doors and drawers",        why: "Lubrication prevents damage and extends hardware life.", defaultMinutes: 15 },
    { task: "Inspect caulking around sinks and tubs",      why: "Fresh caulk prevents water leaks and mold growth.", defaultMinutes: 15 }
  ],
  "Electrical Fixtures": [
    { task: "Test outlets with a plug-in tester",          why: "Bad outlets are fire hazards.", defaultMinutes: 15 },
    { task: "Inspect switches for looseness or cracks",    why: "Loose switches can spark and damage wiring.", defaultMinutes: 15 }
  ]
};

// State
const state = { arrival: "quickfix", pay: "cash", selected: new Map(), search: "" };

// Shorthands
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let listEl, estTasksEl, estMinutesEl, estIncludedEl, estExtraEl, estTotalEl, estCreditsEl, estStatusEl, cashRow, credRow, msgEl;

function flash(text, tone = "ok") {
  msgEl = msgEl || $("#msg");
  if (!msgEl) return;
  msgEl.innerHTML = `<span class="${tone}">${text}</span>`;
  setTimeout(() => { msgEl.textContent = ""; }, 4000);
}

function taskMatches(t, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return t.task.toLowerCase().includes(q) || (t.why || "").toLowerCase().includes(q);
}

function renderList() {
  listEl = listEl || $("#list");
  if (!listEl) return;
  const q = (state.search || "").trim().toLowerCase();
  const html = [];
  for (const [pillar, tasks] of Object.entries(DATA)) {
    for (const t of tasks) {
      if (!taskMatches(t, q)) continue;
      const id = `${pillar}|${t.task}`;
      const sel = state.selected.get(id);
      html.push(`
        <div class="task" data-id="${id}">
          <div class="row">
            <div class="grow">
              <h4>${t.task} <span class="tooltip">i<div class="tip">${t.why}</div></span></h4>
              <small class="dim">${pillar}</small>
            </div>
            <label><input class="task-toggle" type="checkbox" ${sel ? "checked" : ""}> include</label>
          </div>
          <div class="row" style="margin-top:8px">
            <input class="mins mins-input" type="number" min="5" step="5" value="${sel ? sel.minutes : t.defaultMinutes}"> min
            <input class="note note-input" placeholder="Notes (optional)" value="${sel ? (sel.note || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""}">
          </div>
        </div>
      `);
    }
  }
  listEl.innerHTML = html.join("");
  updateEstimate();
}

function wireListDelegation() {
  listEl = listEl || $("#list");
  if (!listEl) return;
  listEl.addEventListener("change", (e) => {
    const card = e.target.closest(".task"); if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches(".task-toggle")) {
      if (state.selected.has(id)) state.selected.delete(id);
      else {
        const [pillar, task] = id.split("|");
        const why = (Object.entries(DATA).find(([p]) => p === pillar)[1] || []).find(it => it.task === task)?.why || "";
        const defMin = Number(card.querySelector(".mins-input")?.value || 15);
        state.selected.set(id, { pillar, task, why, minutes: defMin, note: "" });
      }
      updateEstimate();
    } else if (e.target.matches(".mins-input")) {
      if (state.selected.has(id)) {
        state.selected.get(id).minutes = Math.max(5, parseInt(e.target.value || "0", 10));
        updateEstimate();
      }
    }
  });
  listEl.addEventListener("input", (e) => {
    const card = e.target.closest(".task"); if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches(".note-input") && state.selected.has(id)) {
      state.selected.get(id).note = e.target.value;
    }
  });
}

function updateEstimate() {
  estTasksEl    = estTasksEl    || $("#estTasks");
  estMinutesEl  = estMinutesEl  || $("#estMinutes");
  estIncludedEl = estIncludedEl || $("#estIncluded");
  estExtraEl    = estExtraEl    || $("#estExtra");
  estTotalEl    = estTotalEl    || $("#estTotal");
  estCreditsEl  = estCreditsEl  || $("#estCredits");
  estStatusEl   = estStatusEl   || $("#estStatus");
  cashRow       = cashRow       || $("#cashRow");
  credRow       = credRow       || $("#credRow");

  if (!estTasksEl) return;

  const arrival = PRICING[state.arrival];
  const tasks = Array.from(state.selected.values());
  const totalMin = tasks.reduce((a, b) => a + (b.minutes || 0), 0);
  const included = arrival.includedMinutes;
  const extra = Math.max(0, totalMin - included);

  estTasksEl.textContent = String(tasks.length);
  estMinutesEl.textContent = String(totalMin);
  estIncludedEl.textContent = String(included);
  estExtraEl.textContent = String(extra);

  const btn = $("#btnBook");
  if (state.pay === "cash") {
    if (cashRow) cashRow.style.display = "block";
    if (credRow) credRow.style.display = "none";
    let total = arrival.price;
    if (arrival.extraPer15 > 0 && extra > 0) total += Math.ceil(extra / 15) * arrival.extraPer15;
    if (estTotalEl) estTotalEl.textContent = `$${total}`;
    if (btn) btn.textContent = `Book & Pay $${depositFor(state.arrival)} Deposit`;
  } else {
    if (cashRow) cashRow.style.display = "none";
    if (credRow) credRow.style.display = "block";
    let credits = state.arrival === "quickfix" ? CREDITS.quickfixBase : CREDITS.standardBase;
    if (state.arrival === "quickfix" && totalMin > 60) {
      const over = totalMin - 60; credits += Math.ceil(over / 30) * CREDITS.overPer30;
    }
    if (estCreditsEl) estCreditsEl.textContent = String(credits);
    if (btn) btn.textContent = `Book & Pay $${depositFor(state.arrival)} Deposit`;
  }

  if (estStatusEl) {
    estStatusEl.textContent =
      (state.arrival === "quickfix" && tasks.length > 1)
        ? "Quick Fix allows 1 task — consider other options."
        : "Ready";
  }
}

function buildSummary() {
  const tasks = Array.from(state.selected.values());
  const a = PRICING[state.arrival];
  const lines = [];
  lines.push(`Arrival: ${a.label} ($${a.price})`);
  lines.push(`Payment: ${state.pay === "cash" ? "Cash/Card" : `Fix Credits ($${CREDITS.price} ea.)`}`);
  lines.push("");
  lines.push("Tasks:");
  tasks.forEach((t, i) => {
    lines.push(`  ${i + 1}. [${t.pillar}] ${t.task} — ${t.minutes} min${t.note ? `\n     Note: ${t.note}` : ""}`);
  });
  lines.push("");
  lines.push(`Estimate: Tasks ${tasks.length} • Minutes ${$("#estMinutes")?.textContent || "0"}`);
  return lines.join("\n");
}

function safeFetchJson(url, opts = {}, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: "timeout" }); } }, timeoutMs);
    try {
      fetch(url, opts).then(async (r) => {
        if (done) return; done = true; clearTimeout(timer);
        try { resolve(await r.json()); } catch (_e) { resolve({ ok: false, error: "bad_json" }); }
      }).catch(() => {
        if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: "network" }); }
      });
    } catch (_e) {
      if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: "blocked" }); }
    }
  });
}

async function handleFindNext() {
  const slot = (document.querySelector('input[name="timeslot"]:checked') || {}).value || "";
  const url = `${APPS_SCRIPT_URL}?action=nextslot&arrival=${encodeURIComponent(state.arrival)}&timeslot=${encodeURIComponent(slot)}&min_hours=48`;
  const res = await safeFetchJson(url, { method: "GET" }, 10000);
  if (res && res.ok) {
    $("#prefDate").value = res.preferred_date;
    flash(`Next available: ${res.preferred_date} • ${res.timeslot}`, "ok");
  } else {
    flash("No open slots found. Reach out for priority scheduling.", "warn");
  }
}

async function handleBook() {
  if (!APPS_SCRIPT_URL) { flash("Missing backend URL. Set it in config.js", "danger"); return; }
  const customer = {
    name:  $("#custName")?.value.trim()  || "",
    email: $("#custEmail")?.value.trim() || "",
    phone: $("#custPhone")?.value.trim() || "",
    zip:   $("#custZip")?.value.trim()   || ""
  };
  if (!customer.name || !customer.email || !customer.phone || !customer.zip) {
    flash("Please enter your name, email, phone, and ZIP to continue.", "warn"); return;
  }
  const payload = {
    action: "book",
    arrival: state.arrival,
    pay: state.pay,
    deposit_usd: depositFor(state.arrival),
    estimate: {},
    customer,
    selected: Array.from(state.selected.values()),
    summary: buildSummary(),
    schedule: {
      preferred_date: $("#prefDate")?.value || "",
      timeslot: (document.querySelector('input[name="timeslot"]:checked') || {}).value || "",
      flexible: !!$("#flexible")?.checked,
      find_next: !$("#prefDate")?.value
    },
    project_details: ($("#projectDetails")?.value || "").trim(),
    source: "steady-intake-v3.5"
  };
  flash("Creating booking…");
  const data = await safeFetchJson(APPS_SCRIPT_URL + "?action=book", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids preflight
    body: JSON.stringify(payload)
  });
  if (!data || data.ok !== true) {
    flash("Booking failed. Check backend / config.", "danger");
    if (DEBUG) console.log("book error", data);
    return;
  }
  if (data.checkout_url) window.location.assign(data.checkout_url);
  else flash("Booked! Check your email for confirmation.", "ok");
}

function wireControls() {
  // radios
  $$('input[name="arrival"]').forEach(r => r.addEventListener("change", e => { state.arrival = e.target.value; updateEstimate(); }));
  $$('input[name="pay"]').forEach(r => r.addEventListener("change", e => { state.pay = e.target.value; updateEstimate(); }));
  // buttons
  $("#btnSummary")?.addEventListener("click", () => { $("#summary").textContent = buildSummary(); });
  $("#btnCopy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(buildSummary()); flash("Copied.", "ok"); }
    catch (_e) { flash("Copy failed.", "warn"); }
  });
  $("#btnBook")?.addEventListener("click", handleBook);
  $("#btnFind")?.addEventListener("click", handleFindNext);
  // search
  $("#search")?.addEventListener("input", (e) => { state.search = e.target.value || ""; renderList(); });
}

async function pingBackend() {
  if (!APPS_SCRIPT_URL) { if (DEBUG) console.log("No APPS_SCRIPT_URL set"); return; }
  const r = await safeFetchJson(APPS_SCRIPT_URL + "?action=ping", { method: "GET" }, 6000);
  if (DEBUG) console.log("ping", r);
  if (r && r.ok) flash("Backend connected.", "ok");
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  if (DEBUG) console.log("Intake app loaded");
  wireControls();
  wireListDelegation();
  renderList();
  updateEstimate();
  pingBackend();
});
