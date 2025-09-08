/* app.js — Intake v3.5 (UX tidy: no credits, Std=120min, move info, relabel) */
/* expects window.APPS_SCRIPT_URL from config.js, and success.html in this site */

(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // --- DOM refs
  const els = {
    arrivalRadios: $$('input[name="arrival"]'),
    timeslotRadios: $$('input[name="timeslot"]'),
    prefDate: $('#prefDate'),
    flexible: $('#flexible'),

    // estimate boxes
    estTasks: $('#estTasks'),
    estMinutes: $('#estMinutes'),
    estIncluded: $('#estIncluded'),
    estExtra: $('#estExtra'),
    estTotal: $('#estTotal'),
    estCredits: $('#estCredits'),
    estStatus: $('#estStatus'),
    cashRow: $('#cashRow'),
    credRow: $('#credRow'),

    // info block
    infoStackPill: $$('.pill').find(p => p.textContent.trim() === 'Your Info'),
    name: $('#custName'),
    email: $('#custEmail'),
    phone: $('#custPhone'),
    zip: $('#custZip'),
    details: $('#projectDetails'),

    // actions
    btnFind: $('#btnFind'),
    btnSummary: $('#btnSummary'),
    btnCopy: $('#btnCopy'),
    btnBook: $('#btnBook'),

    // output
    summary: $('#summary'),
    msg: $('#msg'),
    diag: $('#diag'),
  };

  // --- one-time DOM surgery for UX -------------------------
  function removePaymentMethodBlock() {
    const pill = $$('.pill').find(p => p.textContent.trim() === 'Payment Method');
    if (!pill) return;
    const stack = pill.closest('.stack');
    if (stack && stack.parentNode) stack.parentNode.removeChild(stack);
  }

  function moveInfoBelowEstimator() {
    const pill = els.infoStackPill;
    if (!pill) return;
    const infoStack = pill.closest('.stack');
    const estPill = $$('.pill').find(p => p.textContent.trim() === 'Estimate');
    const estStack = estPill && estPill.closest('.stack');
    const actionsStack = els.btnBook && els.btnBook.closest('.stack');
    if (infoStack && actionsStack && estStack) {
      // Insert infoStack right before the actions (summary/book) block
      actionsStack.parentNode.insertBefore(infoStack, actionsStack);
    }
  }

  function relabelStandardArrival() {
    const std = $('input[name="arrival"][value="standard"]');
    if (std) {
      const label = std.closest('label.radio');
      if (label) {
        label.lastChild.nodeValue = ' Standard Arrival — $229 (multiple tasks / 120 min)';
      }
    }
  }

  function hideCreditsEverywhere() {
    if (els.credRow) els.credRow.style.display = 'none';
    // Also remove any banner that referenced credits
    const banners = $$('.banner');
    banners.forEach(b => {
      if (b.textContent.toLowerCase().includes('credit')) b.remove();
    });
  }

  removePaymentMethodBlock();
  moveInfoBelowEstimator();
  relabelStandardArrival();
  hideCreditsEverywhere();

  // --- state & rules --------------------------------------
  const RULES = {
    quickfix: { base: 129, includedMin: 60, overPer15: 25, deposit: 49, label: 'Quick Fix' },
    standard: { base: 229, includedMin: 120, overPer15: 25, deposit: 49, label: 'Standard Arrival' },
    halfday:  { base: 499, includedMin: 240, overPer15: 0,  deposit: 49, label: 'Half Day' },
    fullday:  { base: 899, includedMin: 480, overPer15: 0,  deposit: 49, label: 'Full Day' },
    custom:   { base: 99,  includedMin: 0,   overPer15: 0,  deposit: 99, label: 'Custom Quote' }, // show deposit as total
  };

  // checklist counters (hook up later as you add items)
  let tasks = 0;
  let minutes = 0;

  function selectedArrival() {
    const r = $('input[name="arrival"]:checked');
    return (r && r.value) || 'standard';
    // (leaves "cash/card" as the implicit-only payment method)
  }

  function selectedTimeslot() {
    const r = $('input[name="timeslot"]:checked');
    return (r && r.value) || 'morning';
  }

  function fmtMoney(n) {
    return '$' + Number(Math.round(n)).toLocaleString();
  }

  function computeTotals() {
    const a = selectedArrival();
    const rule = RULES[a];

    // Included minutes & base
    const included = rule.includedMin;
    let extraMin = Math.max(0, minutes - included);
    const extraBlocks = rule.overPer15 > 0 ? Math.ceil(extraMin / 15) : 0;
    const extraCost = extraBlocks * rule.overPer15;

    // Subtotal logic:
    // - For custom: show the deposit as the "total" so the UI stays consistent
    // - For flat day blocks: just the base
    let total;
    if (a === 'custom') total = rule.base;
    else total = rule.base + extraCost;

    // Paint UI
    els.estTasks.textContent = tasks;
    els.estMinutes.textContent = minutes;
    els.estIncluded.textContent = included;
    els.estExtra.textContent = extraMin > 0 ? extraMin : 0;
    els.estTotal.textContent = fmtMoney(total);
    els.estStatus.textContent = 'Ready';
  }

  // If you later wire the checklist, update `tasks`/`minutes` then:
  function touch() { computeTotals(); }

  // --- Summary --------------------------------------------
  function buildSummary() {
    const a = selectedArrival();
    const r = RULES[a];
    const parts = [];

    parts.push(`${r.label} — base ${fmtMoney(r.base)}${a==='custom' ? ' (deposit)' : ''}`);
    if (r.includedMin) parts.push(`Included: ${r.includedMin} min`);
    if (r.overPer15) parts.push(`Overage: ${fmtMoney(r.overPer15)} / 15 min`);

    if (minutes > 0) {
      parts.push('');
      parts.push(`Estimate → Tasks: ${tasks || 0}, Minutes: ${minutes || 0}`);
    }

    // Schedule bits
    const date = els.prefDate && els.prefDate.value || '';
    const slot = selectedTimeslot();
    const flex = !!(els.flexible && els.flexible.checked);
    if (date || flex) {
      parts.push('');
      parts.push('Requested schedule:');
      if (date) parts.push(`• Preferred date: ${date}`);
      parts.push(`• Time: ${slot === 'morning' ? 'Morning (8–12)' : slot === 'afternoon' ? 'Afternoon (1–5)' : slot}`);
      if (flex) parts.push('• Flexible date/time: Yes');
    }

    // Project details
    const details = (els.details && els.details.value || '').trim();
    if (details) {
      parts.push('');
      parts.push('Project details:');
      parts.push(details);
    }

    return parts.join('\n');
  }

  function showSummary() {
    els.summary.textContent = buildSummary();
  }

  // --- Find next available (backend GET) -------------------
  async function findNext() {
    try {
      setMsg('Looking up next available slot…');
      const u = new URL(window.APPS_SCRIPT_URL);
      u.searchParams.set('action', 'nextslot');
      u.searchParams.set('arrival', selectedArrival());
      u.searchParams.set('timeslot', selectedTimeslot());
      u.searchParams.set('min_hours', '48');

      const res = await fetch(u.toString(), { method: 'GET' });
      const json = await res.json();
      if (!json.ok) throw json;

      // Set date/timeslot from backend suggestion
      if (els.prefDate) els.prefDate.value = (json.preferred_date || '').slice(0, 10);
      const toClick = json.timeslot === 'afternoon' ? 'afternoon' : json.timeslot === 'fullday' ? 'fullday' : 'morning';
      const radio = $(`input[name="timeslot"][value="${toClick}"]`);
      if (radio) radio.checked = true;

      setMsg(`Next available: ${json.preferred_date} (${json.timeslot})`);
    } catch (e) {
      setMsg('Couldn’t find a slot right now.', true);
    }
  }

  // --- Book (backend POST) --------------------------------
  function depositFor(arrival) { return RULES[arrival].deposit; }

  async function book() {
    try {
      setBusy(true);
      setMsg('Creating secure checkout…');

      const arrival = selectedArrival();
      const payload = {
        action: 'book',
        arrival,
        pay: 'cash', // single method now
        deposit_usd: depositFor(arrival),
        customer: {
          name: (els.name && els.name.value) || '',
          email: (els.email && els.email.value) || '',
          phone: (els.phone && els.phone.value) || '',
          zip: (els.zip && els.zip.value) || '',
        },
        schedule: {
          preferred_date: els.prefDate && els.prefDate.value || '',
          timeslot: selectedTimeslot(),
          flexible: !!(els.flexible && els.flexible.checked),
          find_next: false
        },
        estimate: { tasks, minutes, extra: Math.max(0, minutes - RULES[arrival].includedMin) },
        summary: buildSummary(),
        source: 'intake-v3.5'
      };

      const res = await fetch(window.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.ok || !json.checkout_url) throw json;

      window.location.assign(json.checkout_url);
    } catch (err) {
      console.log('book error >', err);
      setMsg('Checkout failed. Please try again or email hello@thesteadyfix.com.', true);
    } finally {
      setBusy(false);
    }
  }

  // --- helpers --------------------------------------------
  function setMsg(text, isError = false) {
    if (!els.msg) return;
    els.msg.textContent = text || '';
    els.msg.style.color = isError ? '#f87171' : '#9aa3b2';
  }
  function setBusy(b) {
    [els.btnFind, els.btnSummary, els.btnCopy, els.btnBook].forEach(btn=>{
      if (btn) btn.disabled = !!b;
    });
  }

  // --- Wire listeners -------------------------------------
  if (els.btnFind) els.btnFind.addEventListener('click', findNext);
  if (els.btnSummary) els.btnSummary.addEventListener('click', showSummary);
  if (els.btnCopy) els.btnCopy.addEventListener('click', () => {
    const txt = els.summary && els.summary.textContent || buildSummary();
    navigator.clipboard.writeText(txt).then(()=> setMsg('Summary copied!')).catch(()=> setMsg('Couldn’t copy', true));
  });
  if (els.btnBook) els.btnBook.addEventListener('click', book);

  els.arrivalRadios.forEach(r => r.addEventListener('change', () => {
    // when switching arrivals, snap included minutes + total
    touch();
  }));
  els.timeslotRadios.forEach(r => r.addEventListener('change', touch));
  if (els.prefDate) els.prefDate.addEventListener('change', touch);
  if (els.flexible) els.flexible.addEventListener('change', touch);

  // Initial label/estimate paint
  console.log('Intake app loaded');
  // Set the quick visible defaults (no checklist yet, so minutes=0 -> we’ll just show base)
  tasks = tasks || 0;
  minutes = minutes || 0;
  computeTotals();

  // Ping backend (optional tiny sanity)
  (async () => {
    try {
      const u = new URL(window.APPS_SCRIPT_URL);
      u.searchParams.set('action', 'ping');
      const res = await fetch(u.toString());
      await res.json();
      console.log('ping ✓');
    } catch (_) {}
  })();
})();
