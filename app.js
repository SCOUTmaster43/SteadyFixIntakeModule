/* Intake v3.6 – UX cleanup:
   - Removed Fix Credits UI/logic
   - Standard Arrival => 120 min included + $25 per 15-min over
   - Contact section moved under estimator
   - Keeps Apps Script booking (book + nextslot)
*/
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const UI = {
    arrival: () => $('input[name="arrival"]:checked')?.value || 'quickfix',
    timeslot: () => $('input[name="timeslot"]:checked')?.value || 'morning',
    prefDate: () => $('#prefDate')?.value || '',
    flexible: () => $('#flexible')?.checked || false,
    name: () => $('#custName')?.value?.trim() || '',
    email: () => $('#custEmail')?.value?.trim() || '',
    phone: () => $('#custPhone')?.value?.trim() || '',
    zip: () => $('#custZip')?.value?.trim() || '',
    details: () => $('#projectDetails')?.value?.trim() || '',
    setText: (id, v) => { const el = $(id); if (el) el.textContent = v; },
    setHTML: (id, v) => { const el = $(id); if (el) el.innerHTML = v; },
    setMsg: (v) => UI.setText('#msg', v || ''),
    setDiag: (v) => UI.setText('#diag', v || ''),
    btnBook: () => $('#btnBook'),
    btnFind: () => $('#btnFind'),
    findMsg: () => $('#findMsg'),
  };

  // --- Checklist sample (we’ll flesh out packages next) ---
  const TASKS = [
    { id:'door-hinge', label:'Adjust squeaky / rubbing door', minutes:20, pkg:'Seasonal' },
    { id:'smoke-alarm', label:'Replace smoke/CO alarm batteries', minutes:15, pkg:'Safety' },
    { id:'gfi-check', label:'Test GFCI outlets', minutes:10, pkg:'Safety' },
    { id:'baby-gate', label:'Install baby gate', minutes:30, pkg:'Baby' },
  ];

  const state = {
    items: new Map(),   // id -> {label, minutes, qty}
    minutes: 0,
    tasks: 0
  };

  function renderTasks(filter=''){
    const list = $('#list'); if (!list) return;
    const f = filter.trim().toLowerCase();
    list.innerHTML = '';
    TASKS.filter(t => !f || t.label.toLowerCase().includes(f) || (t.pkg||'').toLowerCase().includes(f))
      .forEach(t => {
        const card = document.createElement('div');
        card.className = 'task';
        card.innerHTML = `
          <h4>${t.label}</h4>
          <div class="row">
            <small>${t.pkg||'General'} • ${t.minutes} min</small>
            <span style="flex:1"></span>
            <button class="btn secondary btn-add" data-id="${t.id}">Add</button>
          </div>`;
        list.appendChild(card);
      });
    list.onclick = (e) => {
      const b = e.target.closest('.btn-add');
      if (!b) return;
      const id = b.dataset.id;
      const t = TASKS.find(x => x.id === id);
      if (!t) return;
      const current = state.items.get(id) || { ...t, qty: 0 };
      current.qty += 1;
      state.items.set(id, current);
      recalc();
    };
  }

  // --- Estimator ---
  const PRICES = {
    quickfix: { base:129, included:60, overUnit:0, overCost:0 },     // fixed
    standard: { base:229, included:120, overUnit:15, overCost:25 },  // $25 / 15-min over
    halfday:  { base:499, included:240, overUnit:0, overCost:0 },    // flat
    fullday:  { base:899, included:480, overUnit:0, overCost:0 },    // flat
    custom:   { base:99,  included:0,   overUnit:0, overCost:0 }     // deposit only
  };

  function recalc(){
    // minutes/tasks from selected checklist items
    let minutes = 0, tasks = 0;
    state.items.forEach(i => { minutes += i.minutes * i.qty; tasks += i.qty; });

    const a = UI.arrival();
    const rules = PRICES[a];
    let included = rules.included;
    let extra = Math.max(0, minutes - included);

    // only Standard charges overages
    let total = rules.base;
    if (a === 'standard' && extra > 0){
      const steps = Math.ceil(extra / rules.overUnit);
      total += steps * rules.overCost;
    }

    // display
    UI.setText('#estTasks', String(tasks));
    UI.setText('#estMinutes', String(minutes));
    UI.setText('#estIncluded', String(included));
    UI.setText('#estExtra', String(extra));
    UI.setText('#estTotal', `$${total}`);
    UI.setText('#estStatus', minutes ? 'Ready' : 'Ready');

    // regenerate summary if it’s already shown
    const sum = makeSummary(minutes, tasks, total);
    UI.setText('#summary', sum);
  }

  function makeSummary(minutes, tasks, total){
    const a = UI.arrival();
    const arrivalLabel =
      a==='quickfix' ? 'Quick Fix — $129 (1 task / 60 min)' :
      a==='standard' ? 'Standard Arrival — $229 (multiple tasks / 120 min, $25 per 15 min over)' :
      a==='halfday'  ? 'Half Day — $499 (4 hours)' :
      a==='fullday'  ? 'Full Day — $899 (8 hours)' :
      'Custom Quote — $99 deposit';

    const items = [];
    state.items.forEach(i => items.push(`• ${i.label} (${i.minutes} min) × ${i.qty}`));

    return [
      `Arrival: ${arrivalLabel}`,
      `Preferred: ${UI.prefDate() || '(none)'} ${UI.timeslot()}`,
      UI.flexible() ? 'Flexible: yes' : '',
      '',
      'Checklist:',
      items.length ? items.join('\n') : '• (none selected yet)',
      '',
      `Estimate: ${minutes} min, ${state.tasks} task(s)`,
      `Displayed total: $${total}`,
      '',
      'We’ll confirm before starting if anything could prevent a satisfactory resolution or incur extra charges.',
      'Safety issues → deposit returned.'
    ].filter(Boolean).join('\n');
  }

  // --- Actions ---
  $('#search')?.addEventListener('input', (e)=>renderTasks(e.target.value));
  $$('input[name="arrival"]').forEach(r => r.addEventListener('change', recalc));

  $('#btnSummary')?.addEventListener('click', recalc);

  $('#btnCopy')?.addEventListener('click', async ()=>{
    const txt = $('#summary')?.textContent || '';
    if (!txt) { UI.setMsg('Generate a summary first.'); return; }
    try { await navigator.clipboard.writeText(txt); UI.setMsg('Summary copied.'); }
    catch { UI.setMsg('Copy failed — select and copy manually.'); }
  });

  $('#btnFind')?.addEventListener('click', async ()=>{
    try{
      UI.findMsg().textContent = 'Finding next available…';
      const params = new URLSearchParams({
        action:'nextslot',
        arrival:UI.arrival(),
        timeslot:UI.timeslot(),
        min_hours:'48'
      });
      const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode:'cors' });
      const data = await res.json();
      if (data && data.ok){
        $('#prefDate').value = (data.preferred_date || '');
        if (data.timeslot) {
          const el = document.querySelector(`input[name="timeslot"][value="${data.timeslot}"]`);
          if (el) el.checked = true;
        }
        UI.findMsg().textContent = `Next available: ${data.preferred_date} (${data.timeslot})`;
      } else {
        UI.findMsg().textContent = 'No slot found. Try a different option.';
      }
    } catch(err){
      UI.findMsg().textContent = 'Could not check availability right now.';
    }
  });

  $('#btnBook')?.addEventListener('click', async ()=>{
    try{
      UI.setMsg('Creating checkout…');

      const arrival = UI.arrival();
      const deposit = arrival === 'custom' ? 99 : 49;

      // Minutes from checklist for overage visibility (the backend does final email/notes)
      let minutes = 0, tasks = 0; state.items.forEach(i => { minutes += i.minutes * i.qty; tasks += i.qty; });

      const payload = {
        action:'book',
        customer:{ name:UI.name(), email:UI.email(), phone:UI.phone(), zip:UI.zip() },
        arrival,
        pay:'cash',                          // credits removed
        deposit_usd:deposit,
        summary:($('#summary')?.textContent || ''),
        schedule:{
          preferred_date:UI.prefDate(),
          timeslot:UI.timeslot(),
          flexible:UI.flexible(),
          find_next:false
        },
        estimate:{ tasks, minutes, extra: Math.max(0, minutes - (PRICES[arrival]?.included||0)) },
        source:'intake-v3.6'
      };

      const res = await fetch(APPS_SCRIPT_URL, {
        method:'POST',
        mode:'cors',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data && data.ok && data.checkout_url){
        UI.setMsg('');
        window.location.href = data.checkout_url;
      } else {
        UI.setMsg('Booking failed. Please try again.');
        UI.setDiag(JSON.stringify(data || {}, null, 2));
      }
    } catch(err){
      UI.setMsg('Booking error — try again.');
      UI.setDiag(String(err));
    }
  });

  // initial render
  renderTasks();
  recalc();
  console.log('Intake app loaded');
})();
