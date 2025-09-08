/* Steady Intake – Frontend (v3.6)
 * - Checklist + estimator
 * - Next-available slot finder (>=48h)
 * - Stripe booking via Apps Script (simple POST, CORS-safe)
 * - Friendly errors + diagnostics
 */

(function () {
  // ------- Config -------
  const APPS_SCRIPT_URL =
    (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL) || '';

  // ------- DOM helpers -------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const setText = (el, t = '') => (el ? (el.textContent = t) : null);
  const show = (el, yes = true) => (el ? (el.style.display = yes ? '' : 'none') : null);
  const fmtUSD = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      isFinite(n) ? n : 0
    );

  // ------- Elements -------
  const els = {
    list: $('#list'),
    search: $('#search'),
    prefDate: $('#prefDate'),
    flexible: $('#flexible'),
    btnFind: $('#btnFind'),
    estTasks: $('#estTasks'),
    estMinutes: $('#estMinutes'),
    estIncluded: $('#estIncluded'),
    estExtra: $('#estExtra'),
    estTotal: $('#estTotal'),
    estStatus: $('#estStatus'),
    btnSummary: $('#btnSummary'),
    btnCopy: $('#btnCopy'),
    btnBook: $('#btnBook'),
    summary: $('#summary'),
    msg: $('#msg'),
    diag: $('#diag'),
    // customer fields
    name: $('#custName'),
    email: $('#custEmail'),
    phone: $('#custPhone'),
    zip: $('#custZip'),
    details: $('#projectDetails'),
  };

  // ------- Data (seed checklist) -------
  const TASKS = [
    // Safety
    { id: 'smoke-batt', title: 'Replace smoke/CO alarm batteries', cat: 'Safety', minutes: 15 },
    { id: 'gfci-test', title: 'Test GFCI outlets', cat: 'Safety', minutes: 10 },
    // Seasonal
    { id: 'squeak-door', title: 'Adjust squeaky / rubbing door', cat: 'Seasonal', minutes: 20 },
    // Baby
    { id: 'baby-gate', title: 'Install baby gate', cat: 'Baby', minutes: 30 },
  ];

  // ------- State -------
  const state = {
    arrival: 'quickfix', // quickfix | standard | halfday | fullday | custom
    selected: new Map(), // id -> task
    schedule: { timeslot: 'morning', flexible: false }, // morning | afternoon
    totals: { tasks: 0, minutes: 0, included: 60, extra: 0, totalUsd: 129 },
  };

  // price table / behavior
  const PRICING = {
    quickfix: { base: 129, included: 60, extra15: 25 },
    standard: { base: 229, included: 120, extra15: 25 },
    halfday: { base: 499, included: 240, extra15: 0 }, // flat
    fullday: { base: 899, included: 480, extra15: 0 }, // flat
    custom: { base: 99, included: 0, extra15: 0 }, // deposit only (handled server-side too)
  };

  // ------- UI: radio bindings -------
  function initRadios() {
    // Arrival
    $$('.radio input[name="arrival"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (r.checked) {
          state.arrival = r.value;
          updateEstimate();
        }
      })
    );
    // Timeslot
    $$('.radio input[name="timeslot"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (r.checked) {
          state.schedule.timeslot = r.value;
        }
      })
    );
    // Flexible
    els.flexible?.addEventListener('change', (e) => {
      state.schedule.flexible = !!e.target.checked;
    });
  }

  // ------- Checklist -------
  function renderChecklist(q = '') {
    if (!els.list) return;
    els.list.innerHTML = '';
    const query = (q || els.search?.value || '').trim().toLowerCase();
    const items = TASKS.filter(
      (t) => !query || t.title.toLowerCase().includes(query) || t.cat.toLowerCase().includes(query)
    );
    for (const t of items) {
      const card = document.createElement('div');
      card.className = 'task';
      card.innerHTML = `
        <h4>${t.title}</h4>
        <small>${t.cat} · ${t.minutes} min</small>
        <div class="row" style="margin-top:8px">
          <div class="grow"></div>
          <button class="btn" data-id="${t.id}">${state.selected.has(t.id) ? 'Added' : 'Add'}</button>
        </div>`;
      els.list.appendChild(card);
      card.querySelector('button').addEventListener('click', () => toggleTask(t));
    }
  }

  function toggleTask(t) {
    if (state.selected.has(t.id)) {
      state.selected.delete(t.id);
    } else {
      state.selected.set(t.id, t);
    }
    updateEstimate();
    renderChecklist(); // refresh buttons to show Added/Add
  }

  // ------- Estimator -------
  function ceilTo15(mins) {
    if (mins <= 0) return 0;
    return Math.ceil(mins / 15) * 15;
  }

  function updateEstimate() {
    // counts
    const tasks = state.selected.size;
    const minutes = Array.from(state.selected.values()).reduce((a, b) => a + (b.minutes || 0), 0);
    const rules = PRICING[state.arrival] || PRICING.quickfix;

    // included/extra
    const included = rules.included;
    const over = Math.max(0, minutes - included);
    const extraBilled = rules.extra15 ? ceilTo15(over) : 0;

    // total
    const extraBlocks = extraBilled / 15;
    const addl = extraBlocks * (rules.extra15 || 0);
    const totalUsd = rules.base + addl;

    state.totals = { tasks, minutes, included, extra: extraBilled, totalUsd };

    // write
    setText(els.estTasks, String(tasks));
    setText(els.estMinutes, String(minutes));
    setText(els.estIncluded, String(included));
    setText(els.estExtra, String(extraBilled));
    setText(els.estTotal, fmtUSD(totalUsd));

    const status =
      state.arrival === 'custom'
        ? 'Custom quote deposit ($99)'
        : state.arrival === 'halfday' || state.arrival === 'fullday'
        ? 'Flat rate window'
        : extraBilled > 0
        ? `Includes ${included} min · ${extraBilled} min over`
        : 'Ready';
    setText(els.estStatus, status);
  }

  // ------- Messages / diagnostics -------
  function flash(el, msg, tone = 'info') {
    if (!el) return;
    el.className = 'dim';
    el.style.color =
      tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : '';
    setText(el, msg);
    if (msg) {
      // gently clear after 7s
    }
  }
  function diag(payload) {
    if (!els.diag) return;
    try {
      els.diag.textContent = JSON.stringify(payload, null, 2);
    } catch {
      els.diag.textContent = String(payload || '');
    }
  }

  // ------- Summary -------
  function buildSummary() {
    const a = state.arrival;
    const rules = PRICING[a];
    const tasks = Array.from(state.selected.values())
      .map((t) => `• ${t.title} (${t.minutes} min)`)
      .join('\n');
    const slot = state.schedule.timeslot === 'afternoon' ? 'afternoon' : 'morning';

    const lines = [
      `Arrival: ${a === 'quickfix' ? 'Quick Fix — $129' :
        a === 'standard' ? 'Standard Arrival — $229' :
        a === 'halfday' ? 'Half Day — $499' :
        a === 'fullday' ? 'Full Day — $899' : 'Custom Quote — $99 deposit'}`,
      `Preferred: ${(els.prefDate?.value || '(none)')} ${state.schedule.flexible ? '(flexible)' : ''} ${a === 'fullday' ? '(full day)' : `(${slot})`}`,
      tasks ? `\nChecklist:\n${tasks}` : '',
      `\nEstimate: ${state.totals.tasks} tasks, ${state.totals.minutes} min, includes ${rules.included} min${state.totals.extra ? `, ${state.totals.extra} min over` : ''}`,
      a === 'halfday' || a === 'fullday'
        ? `Window is flat-rate.`
        : `Overages billed at $25 per 15 minutes.`,
    ].filter(Boolean);

    return lines.join('\n');
  }

  function onGenerateSummary() {
    const s = buildSummary();
    if (els.summary) els.summary.textContent = s;
    flash(els.msg, 'Summary generated.', 'ok');
  }

  async function onCopySummary() {
    try {
      const text = els.summary?.textContent || buildSummary();
      await navigator.clipboard.writeText(text);
      flash(els.msg, 'Summary copied to clipboard.', 'ok');
    } catch (e) {
      flash(els.msg, 'Could not copy to clipboard.', 'warn');
    }
  }

  // ------- Next available -------
  async function onFindNext() {
    disable(els.btnFind, true, 'Finding…');
    try {
      const params = new URLSearchParams({
        action: 'nextslot',
        arrival: state.arrival,
        timeslot: state.schedule.timeslot,
        min_hours: '48',
      });
      const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      const data = await res.json();
      if (data && data.ok && data.preferred_date) {
        if (els.prefDate) els.prefDate.value = data.preferred_date;
        if (data.timeslot) {
          const r = $(`.radio input[name="timeslot"][value="${data.timeslot}"]`);
          if (r) r.checked = true;
          state.schedule.timeslot = data.timeslot;
        }
        flash(els.msg, `Next available: ${data.preferred_date} (${data.timeslot})`, 'ok');
      } else {
        flash(els.msg, 'No availability found. Try a wider window.', 'warn');
        diag(data);
      }
    } catch (err) {
      flash(els.msg, 'Could not check availability (network).', 'danger');
      diag({ error: String(err) });
    } finally {
      disable(els.btnFind, false);
    }
  }

  // ------- Booking -------
  function disable(btn, yes = true, label) {
    if (!btn) return;
    btn.disabled = !!yes;
    if (label != null) btn.dataset.label = btn.textContent, (btn.textContent = label);
    else if (!yes && btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  function buildPayload() {
    const arrival = state.arrival;
    const pay = 'cash';
    const deposit_usd = arrival === 'custom' ? 99 : 49; // server enforces 99 for custom again
    const schedule = {
      preferred_date: els.prefDate?.value || '',
      timeslot: state.schedule.timeslot,
      flexible: !!state.schedule.flexible,
    };
    return {
      action: 'book',
      arrival,
      pay,
      deposit_usd,
      summary: buildSummary(),
      schedule,
      customer: {
        name: els.name?.value || '',
        email: els.email?.value || '',
        phone: els.phone?.value || '',
        zip: els.zip?.value || '',
      },
      estimate: {
        tasks: state.totals.tasks,
        minutes: state.totals.minutes,
        extra: state.totals.extra,
      },
      source: 'steady-intake-v3.6',
    };
  }

  async function onBook() {
    // basic validation
    if (!APPS_SCRIPT_URL) {
      flash(els.msg, 'Booking service URL not configured (config.js).', 'danger');
      return;
    }
    if (!els.email?.value) {
      flash(els.msg, 'Please add your email so we can send the receipt.', 'warn');
      return;
    }

    const payload = buildPayload();
    diag({ try: 'book', payload });

    disable(els.btnBook, true, 'Processing…');
    flash(els.msg, 'Connecting to secure checkout…', 'ok');

    try {
      // IMPORTANT: simple POST, no preflight → CORS safe with Apps Script
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore parse errors, will be handled below
      }

      if (!res.ok || !data || !data.ok) {
        // Friendly message + diagnosis
        const code = res.status || 'network';
        const reason =
          (data && (data.error || data.details)) ||
          'Could not complete booking. Please try again.';
        flash(
          els.msg,
          `Booking error — ${reason}${
            code && code !== 200 ? ` (code: ${code})` : ''
          }`,
          'danger'
        );
        diag({ status: res.status, body: data });
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        flash(els.msg, 'Booking created, but no checkout link returned.', 'warn');
        diag(data);
      }
    } catch (err) {
      // This is where CORS/preflight problems previously surfaced as TypeError
      flash(
        els.msg,
        'Network blocked before reaching the booking server. Please try again.',
        'danger'
      );
      diag({ error: String(err) });
    } finally {
      disable(els.btnBook, false);
    }
  }

  // ------- Search -------
  els.search?.addEventListener('input', () => renderChecklist());

  // ------- Events -------
  els.btnFind?.addEventListener('click', onFindNext);
  els.btnSummary?.addEventListener('click', onGenerateSummary);
  els.btnCopy?.addEventListener('click', onCopySummary);
  els.btnBook?.addEventListener('click', onBook);

  // ------- Init -------
  initRadios();
  renderChecklist();
  updateEstimate();

  // Set initial timeslot (radio default)
  const checkedTS = $('.radio input[name="timeslot"]:checked');
  if (checkedTS) state.schedule.timeslot = checkedTS.value;

  // Ping backend on load (optional)
  (async () => {
    if (!APPS_SCRIPT_URL) {
      console.warn('APPS_SCRIPT_URL is missing. Configure it in config.js');
      return;
    }
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=ping`, { method: 'GET', mode: 'cors' });
      const data = await res.json();
      console.log('ping →', data);
    } catch (e) {
      console.log('ping failed (non-blocking)');
    }
  })();

  console.log('Intake app loaded');
})();
