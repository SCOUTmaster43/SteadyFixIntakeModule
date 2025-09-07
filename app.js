// ===== Config =====
const APPS_SCRIPT_URL = (window.STEADY_CONFIG && window.STEADY_CONFIG.APPS_SCRIPT_URL) || "";
const DEBUG = true; // set false later

// ===== Pricing =====
const PRICING = {
  quickfix: { label: 'Quick Fix', price: 129, includedMinutes: 60, maxTasks: 1, extraPer15: 0 },
  standard: { label: 'Standard Arrival', price: 229, includedMinutes: 90, maxTasks: 99, extraPer15: 25 },
  halfday:  { label: 'Half Day', price: 499, includedMinutes: 240, maxTasks: 99, extraPer15: 0 },
  fullday:  { label: 'Full Day', price: 899, includedMinutes: 480, maxTasks: 99, extraPer15: 0 },
  custom:   { label: 'Custom Quote', price: 99,  includedMinutes: 0,   maxTasks: 99, extraPer15: 0 }
};
const CREDITS = { price: 59, quickfixBase: 2, standardBase: 4, overPer30: 1 };
const getDepositForArrival = a => (a === 'custom' ? 99 : 49);

// ===== Sample Checklist Data (trim/expand anytime) =====
const DATA = {
  "Handyman Services Seattle": [
    { task: "Test and tighten door handles, hinges, knobs", why: "Loose hardware causes wear and reduces security.", defaultMinutes: 15 },
    { task: "Lubricate squeaky doors and drawers", why: "Lubrication prevents damage and extends hardware life.", defaultMinutes: 15 },
    { task: "Inspect caulking around sinks and tubs", why: "Fresh caulk prevents water leaks and mold growth.", defaultMinutes: 15 }
  ],
  "Electrical Fixtures": [
    { task: "Test outlets with a plug-in tester", why: "Bad outlets are fire hazards.", defaultMinutes: 15 },
    { task: "Inspect switches for looseness or cracks", why: "Loose switches can spark and damage wiring.", defaultMinutes: 15 }
  ]
};

// ===== State & DOM helpers =====
const state = { arrival: 'quickfix', pay: 'cash', selected: new Map(), search: '' };
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// elements used below (created after DOM parsed)
let listEl, estTasksEl, estMinutesEl, estIncludedEl, estExtraEl, estTotalEl, estCreditsEl, estStatusEl, cashRow, credRow, msgEl;

function flash(text, tone='ok') {
  if (!msgEl) msgEl = $('#msg');
  if (!msgEl) return;
  msgEl.innerHTML = `<span class="${tone}">${text}</span>`;
  setTimeout(()=> msgEl.textContent = '', 5000);
}

function taskMatches(t, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return t.task.toLowerCase().includes(q) || (t.why||'').toLowerCase().includes(q);
}

function renderList() {
  listEl = listEl || $('#list');
  if (!listEl) return;
  const q = (state.search || '').trim().toLowerCase();
  const html = [];
  for (const [pillar, tasks] of Object.entries(DATA)) {
    for (const t of tasks) {
      if (!taskMatches(t, q)) continue;
      const id = `${pillar}|${t.task}`;
      const sel = state.selected.get(id);
      html.push(`
        <div class="task"
