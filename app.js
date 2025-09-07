/* global localStorage */
(() => {
  const CFG = (window.STEADY_CONFIG || {});
  const API = CFG.APPS_SCRIPT_URL || "";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ---------- DATA ----------
  // Seed checklist: add/remove freely (minutes are rough ballparks)
  const SEED = [
    { id:'faucet-replace',   name:'Replace faucet (bath/kitchen)', minutes:60, tags:['plumbing'] },
    { id:'disposal',         name:'Install garbage disposal',      minutes:60, tags:['plumbing','electrical'] },
    { id:'toilet-fix',       name:'Toilet fix (fill/flush/leak)',  minutes:45, tags:['plumbing'] },
    { id:'toilet-replace',   name:'Toilet replace',                 minutes:90, tags:['plumbing'] },
    { id:'outlet',           name:'Replace outlet/switch',          minutes:30, tags:['electrical'] },
    { id:'light-fixture',    name:'Replace light fixture',          minutes:45, tags:['electrical'] },
    { id:'ceiling-fan',      name:'Install ceiling fan',            minutes:90, tags:['electrical'] },
    { id:'tv-mount',         name:'Mount TV (no wire conceal)',     minutes:75, tags:['mounting'] },
    { id:'door-hinge',       name:'Adjust/repair door & hardware',  minutes:45, tags:['carpentry'] },
    { id:'lock-smart',       name:'Install smart lock',             minutes:45, tags:['doors','low-voltage'] },
    { id:'drywall-small',    name:'Drywall patch (≤ 6")',           minutes:60, tags:['drywall','paint'] },
    { id:'caulk-tub',        name:'Re-caulk tub/shower',            minutes:60, tags:['bath'] },
    { id:'leak-diagnose',    name:'Leak diagnosis',                 minutes:60, tags:['plumbing','diagnostic'] },
    { id:'gfi',              name:'Add/replace GFCI',               minutes:40, tags:['electrical'] },
    { id:'garagedoor-seal',  name:'Replace garage door bottom seal',minutes:45, tags:['weather'] },
    { id:'dishwasher',       name:'Install dishwasher',             minutes:120,tags:['plumbing','electrical'] },
    { id:'range-hood',       name:'Replace range hood (recirc)',    minutes:90, tags:['kitchen'] },
    { id:'tile-repair',      name:'Small tile repair (1–4 tiles)',  minutes:90, tags:['tile'] },
    { id:'window-blinds',    name:'Install window blinds (per room)',minutes:45,tags:['install'] },
    { id:'misc',             name:'General handyman task',          minutes:60, tags:['general'] }
  ];

  // ---------- STATE ----------
  const state = {
    tasks: SEED.slice(),          // full catalog
    selected: load('selected', []), // array of {id,name,minutes}
    arrival: load('arrival', 'quickfix'),
    pay:     load('pay', 'cash'),
    depositUsd: 49,                // 99 for custom
  };

  // ---------- INIT ----------
  function init() {
    console.log('Intake app loaded');

    // Restore form selections
    $$('input[name=arrival]').forEach(r => { r.checked = (r.value === state.arrival); });
    $$('input[name=pay]').forEach(r => { r.checked = (r.value === state.pay); });

    // Wire controls
    $$('input[name=arrival]').forEach(r => on(r, 'change', () => {
      state.arrival = r.value; save('arrival', state.arrival);
      state.depositUsd = (state.arrival === 'custom') ? 99 : 49;
      updateEstimate(); togglePayRows();
    }));
    $$('input[name=pay]').forEach(r => on(r, 'change', () => {
      state.pay = r.value; save('pay', state.pay); togglePayRows(); updateEstimate();
    }));
    on($('#btnFind'), 'click', findNextAvailable);
    on($('#btnSummary'), 'click', genSummary);
    on($('#btnCopy'), 'click', copySummary);
    on($('#btnBook'), 'click', bookDeposit);

    // Checklist UI
    on($('#search'), 'input', renderChecklist);
    on($('#btnAddCustom'), 'click', addCustom);

    renderChecklist();
    renderSelected();
    togglePayRows();
    updateEstimate();

    // quick backend ping (diagnostics)
    if (API) fetch(API + '?action=ping').then(r=>r.json()).then(x=>console.log('ping >', x)).catch(()=>{});
  }

  // ---------- STORAGE ----------
  function save(key, val){ localStorage.setItem('steady_' + key, JSON.stringify(val)); }
  function load(key, fallback){ try{ return JSON.parse(localStorage.getItem('steady_' + key)) ?? fallback; }catch{ return fallback; } }

  // ---------- CHECKLIST RENDER ----------
  function renderChecklist(){
    const q = ($('#search').value || '').toLowerCase().trim();
    const list = $('#list'); list.innerHTML = '';
    const items = state.tasks.filter(t => !q || t.name.toLowerCase().includes(q) || (t.tags||[]).some(x=>x.includes(q)));
    if (items.length === 0){ list.innerHTML = `<div class="dim">No tasks match “${q}”.</div>`; return; }

    for (const t of items){
      const checked = !!state.selected.find(s => s.id === t.id);
      const el = document.createElement('div');
      el.className = 'task';
      el.innerHTML = `
        <div class="row">
          <label class="grow"><input type="checkbox" ${checked?'checked':''} data-id="${t.id}"> <b>${t.name}</b></label>
          <div class="dim">${t.minutes} min</div>
        </div>
        ${t.tags?.length ? `<small class="dim">${t.tags.join(' • ')}</small>` : ''}
      `;
      on(el.querySelector('input[type=checkbox]'), 'change', (e) => {
        if (e.target.checked) addSelected(t);
        else removeSelected(t.id);
      });
      list.appendChild(el);
    }
  }

  function renderSelected(){
    const cur = $('#current'); cur.innerHTML = '';
    if (state.selected.length === 0){
      cur.innerHTML = `<div class="dim">Nothing selected yet — pick from the checklist or add a custom to-do.</div>`;
      updateEstimate(); return;
    }
    for (const t of state.selected){
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<b>${t.name}</b> · ${t.minutes} min <button title="Remove" aria-label="Remove">×</button>`;
      on(chip.querySelector('button'), 'click', () => removeSelected(t.id));
      cur.appendChild(chip);
    }
    updateEstimate();
  }

  function addCustom(){
    const name = ($('#customText').value || '').trim();
    const minutes = Number($('#customMinutes').value || 0);
    if (!name || minutes <= 0) { toast('Enter a name and minutes for the custom task.'); return; }
    const id = 'custom-' + Math.random().toString(36).slice(2,8);
    const t = { id, name, minutes, tags:['custom'] };
    state.tasks.unshift(t);           // becomes searchable
    addSelected(t);                   // and selected immediately
    $('#customText').value = ''; $('#customMinutes').value = '';
    renderChecklist();
  }

  function addSelected(t){
    if (!state.selected.find(s => s.id === t.id)) {
      state.selected.push({ id:t.id, name:t.name, minutes:Number(t.minutes||0) });
      save('selected', state.selected);
    }
    renderSelected();
  }
  function removeSelected(id){
    state.selected = state.selected.filter(s => s.id !== id);
    save('selected', state.selected);
    renderSelected();
    // also uncheck in list view if visible
    const cb = $(`input[type=checkbox][data-id="${id}"]`); if (cb) cb.checked = false;
  }

  // ---------- ESTIMATE ----------
  function includedMinutes(arrival){
    if (arrival === 'quickfix') return 60;
    if (arrival === 'standard') return 90;
    if (arrival === 'halfday')  return 240;
    if (arrival === 'fullday')  return 480;
    return 0; // custom
  }

  function computeTotals(){
    const totalMin = state.selected.reduce((a,b)=>a + Number(b.minutes||0), 0);
    const inc = includedMinutes(state.arrival);
    const extra = Math.max(0, totalMin - inc);
    let estCash = 0, credits = 0;

    if (state.arrival === 'quickfix'){
      estCash = 129 + Math.ceil(extra / 15) * 25;
      credits = Math.max(2, 2 + Math.ceil(Math.max(0, totalMin - 60) / 30));
    } else if (state.arrival === 'standard'){
      estCash = 229 + Math.ceil(extra / 15) * 25;
      credits = 4;
    } else if (state.arrival === 'halfday'){
      estCash = 499;
      credits = Math.ceil(totalMin / 30); // guidance only if credits selected
    } else if (state.arrival === 'fullday'){
      estCash = 899;
      credits = Math.ceil(totalMin / 30);
    } else { // custom
      estCash = 99; // deposit only; final pricing on-site
      credits = Math.ceil(totalMin / 30);
    }
    return { totalMin, inc, extra, estCash, credits };
  }

  function togglePayRows(){
    const showCredits = (state.pay === 'credits');
    $('#cashRow').style.display = showCredits ? 'none' : '';
    $('#credRow').style.display = showCredits ? '' : 'none';
  }

  function updateEstimate(){
    const { totalMin, inc, extra, estCash, credits } = computeTotals();
    $('#estTasks').textContent    = String(state.selected.length);
    $('#estMinutes').textContent  = String(totalMin);
    $('#estIncluded').textContent = String(inc);
    $('#estExtra').textContent    = String(extra);
    $('#estTotal').textContent    = `$${estCash}`;
    $('#estCredits').textContent  = String(credits);
    $('#estStatus').textContent   = extra > 0 ? `Over included by ${extra} min` : 'Ready';
  }

  // ---------- SUMMARY ----------
  function genSummary(){
    const lines = [];
    lines.push(`Arrival: ${readableArrival(state.arrival)}  •  Pay: ${state.pay === 'credits' ? 'Fix Credits' : 'Cash/Card'}`);
    if ($('#prefDate').value){
      lines.push(`Preferred date: ${$('#prefDate').value}  •  ${$('input[name=timeslot]:checked').value === 'morning' ? 'Morning (8–12)' : 'Afternoon (1–5)'}`);
    }
    if ($('#flexible').checked) lines.push('Flexible date/time: yes');

    if (state.selected.length){
      lines.push('\nTasks:');
      state.selected.forEach((t,i)=> lines.push(`  ${i+1}. ${t.name} — ${t.minutes} min`));
    }

    const { totalMin, inc, extra, estCash, credits } = computeTotals();
    lines.push('\nEstimate:');
    lines.push(`  Minutes: ${totalMin}  •  Included: ${inc}  •  Extra: ${extra}`);
    if (state.pay === 'credits') lines.push(`  Credits: ${credits}`);
    else lines.push(`  Est. Total: $${estCash}`);

    const notes = ($('#projectDetails').value || '').trim();
    if (notes) lines.push('\nNotes:\n' + notes);

    $('#summary').textContent = lines.join('\n');
  }

  async function copySummary(){
    const t = $('#summary').textContent || '';
    try { await navigator.clipboard.writeText(t); toast('Summary copied.'); }
    catch { toast('Couldn’t copy — select and copy manually.'); }
  }

  // ---------- BOOKING ----------
  function buildPayload(){
    const schedule = {
      preferred_date: $('#prefDate').value || '',
      timeslot: $('input[name=timeslot]:checked').value,
      flexible: $('#flexible').checked
    };
    const { totalMin, inc, extra, estCash, credits } = computeTotals();
    return {
      action: 'book',
      arrival: state.arrival,
      pay: state.pay,
      deposit_usd: (state.arrival === 'custom') ? 99 : 49,
      customer: {
        name:  $('#custName').value || '',
        email: $('#custEmail').value || '',
        phone: $('#custPhone').value || '',
        zip:   $('#custZip').value || ''
      },
      tasks: state.selected,
      estimate: { minutes: totalMin, included: inc, extra, total_cash: estCash, credits },
      summary: ($('#summary').textContent || ''),
      schedule
    };
  }

  async function bookDeposit(){
    try {
      const payload = buildPayload();
      if (!API) return toast('Backend not configured.');
      const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const json = await res.json();
      if (!json.ok || !json.checkout_url) {
        console.log('book error >', json);
        toast('Could not start checkout. Please try again or contact us.');
        return;
      }
      location.href = json.checkout_url;
    } catch (e) {
      console.error(e); toast('Network error — please try again.');
    }
  }

  async function findNextAvailable(){
    try {
      if (!API) return;
      const ts = $('input[name=timeslot]:checked').value;
      const url = `${API}?action=nextslot&arrival=${encodeURIComponent(state.arrival)}&timeslot=${encodeURIComponent(ts)}&min_hours=48`;
      const r = await fetch(url); const j = await r.json();
      if (j && j.ok) {
        $('#prefDate').value = (j.preferred_date || '').slice(0,10);
        toast(`Next available: ${j.preferred_date} (${j.timeslot})`);
      } else toast('No slot found — choose Flexible and we’ll follow up.');
    } catch { toast('Couldn’t check availability.'); }
  }

  // ---------- HELPERS ----------
  function readableArrival(a){
    return a==='quickfix'?'Quick Fix': a==='standard'?'Standard Arrival': a==='halfday'?'Half Day': a==='fullday'?'Full Day': a==='custom'?'Custom Quote':'Arrival';
  }
  let toastTimer;
  function toast(msg){
    const el = $('#msg'); el.textContent = msg;
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ el.textContent=''; }, 4500);
  }

  // boot
  init();
})();
