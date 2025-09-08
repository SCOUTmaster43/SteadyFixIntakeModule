/* global localStorage */
(() => {
  const CFG = window.STEADY_CONFIG || {};
  let API = CFG.APPS_SCRIPT_URL || "";

  function readConfig() {
    const cfg = window.STEADY_CONFIG ?? window.CONFIG ?? {};
    const url = cfg.APPS_SCRIPT_URL;
    const ok = typeof url === "string" &&
      /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url);
    if (!ok) throw new Error("Backend not configured — set APPS_SCRIPT_URL in config.js");
    return { APPS_SCRIPT_URL: url, DEBUG: !!cfg.DEBUG, SANDBOX: !!cfg.SANDBOX };
  }

  const CONFIG = readConfig();
  API = CONFIG.APPS_SCRIPT_URL;

  const postPlain = async (url, payload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      credentials: "omit",
    });
    if (!res.ok) throw new Error(`Backend ${res.status}: ${res.statusText}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: true, text }; }
  };

  // ---------- DATA ----------
  // Packages first (inspirational value), then granular tasks.
  // minutes are ballpark; tweak freely. `desc` shows under the title.
  // `includes` (optional) lists related granular IDs so we can warn on double-counting.
  const SEED = [
    // ===== PACKAGES =====
    {
      id:'pkg-fall-winter',
      name:'Seasonal Safety & Weather Prep (Fall/Winter)',
      minutes:120,
      tags:['package','seasonal','safety'],
      desc:'Test smoke/CO, replace furnace filter, weatherstrip doors, install hose-bib covers, dryer-vent check.',
      includes:['gfi','smoke-co','door-sweep','hose-bib-covers','dryer-vent']
    },
    {
      id:'pkg-spring',
      name:'Spring Refresh & Safety Check',
      minutes:120,
      tags:['package','seasonal','safety'],
      desc:'Gutter & downspout check, exterior caulk touch-ups, door/lock tune, smoke/CO test, basic leak scan.',
      includes:['gutter-clean','downspout-ext','exterior-caulk','door-hinge','smoke-co','leak-diagnose']
    },
    {
      id:'pkg-safety-essentials',
      name:'Whole-Home Safety Essentials',
      minutes:90,
      tags:['package','safety'],
      desc:'Smoke/CO install or test, GFCI tests, water shutoff tag/teach, fire extinguisher check.',
      includes:['smoke-co','gfi']
    },
    {
      id:'pkg-baby',
      name:'Baby/Kid-Proofing Starter',
      minutes:120,
      tags:['package','family','safety'],
      desc:'Outlet covers, cabinet latches, furniture/TV anchoring, blind-cord cleats, gates consult.',
      includes:['outlet-covers','cab-latches','tv-mount','furniture-anchor','cord-cleats']
    },
    {
      id:'pkg-entry',
      name:'Entryway & Door Tune-Up',
      minutes:90,
      tags:['package','doors','weather'],
      desc:'Door sweep/threshold, deadbolt alignment, strike plate & hinge adjust, weatherstrip.',
      includes:['door-sweep','door-hinge','weatherstrip']
    },
    {
      id:'pkg-kitchen',
      name:'Kitchen Tune-Up',
      minutes:120,
      tags:['package','kitchen','plumbing','electrical'],
      desc:'Faucet swap, disposal tune/replace check, small leaks, caulk refresh.',
      includes:['faucet-replace','disposal','leak-diagnose','kitchen-caulk']
    },
    {
      id:'pkg-bath',
      name:'Bathroom Refresh',
      minutes:120,
      tags:['package','bath','sealant'],
      desc:'Re-caulk tub/shower, swap showerhead, toilet fix, minor drywall touch.',
      includes:['caulk-tub','showerhead','toilet-fix','drywall-small']
    },
    {
      id:'pkg-tech',
      name:'Tech & Mounting Essentials',
      minutes:120,
      tags:['package','mounting','smart-home'],
      desc:'TV mount, smart lock, video doorbell (no hidden wiring).',
      includes:['tv-mount','lock-smart','video-doorbell']
    },
    {
      id:'pkg-laundry',
      name:'Laundry Safety & Vent Clean',
      minutes:90,
      tags:['package','safety','appliance'],
      desc:'Dryer vent clean, machine leveling, supply/valve check.',
      includes:['dryer-vent','appliance-level','leak-diagnose']
    },
    {
      id:'pkg-rental',
      name:'Rental Turn — Quick List',
      minutes:180,
      tags:['package','turnover'],
      desc:'Patch & paint touch-ups, blind swaps, batteries, small fixes & punchlist.',
      includes:['drywall-small','window-blinds','smoke-co','general-punch']
    },

    // ===== INDIVIDUAL TASKS =====
    { id:'faucet-replace',   name:'Replace faucet (bath/kitchen)', minutes:60, tags:['plumbing'] },
    { id:'kitchen-caulk',    name:'Re-caulk kitchen sink/backsplash', minutes:45, tags:['kitchen','sealant'] },
    { id:'disposal',         name:'Install garbage disposal',      minutes:60, tags:['plumbing','electrical'] },
    { id:'toilet-fix',       name:'Toilet fix (fill/flush/leak)',  minutes:45, tags:['plumbing'] },
    { id:'toilet-replace',   name:'Toilet replace',                 minutes:90, tags:['plumbing'] },
    { id:'outlet',           name:'Replace outlet/switch',          minutes:30, tags:['electrical'] },
    { id:'gfi',              name:'Add/replace GFCI',               minutes:40, tags:['electrical','safety'] },
    { id:'smoke-co',         name:'Install/replace Smoke & CO detectors', minutes:45, tags:['safety'] },
    { id:'outlet-covers',    name:'Install outlet covers (child safety)', minutes:30, tags:['family','safety'] },
    { id:'cab-latches',      name:'Install cabinet latches (child safety)', minutes:45, tags:['family','safety'] },
    { id:'furniture-anchor', name:'Anchor furniture / TV stand',    minutes:45, tags:['family','safety'] },
    { id:'cord-cleats',      name:'Add blind-cord cleats',          minutes:30, tags:['family','safety'] },
    { id:'light-fixture',    name:'Replace light fixture',          minutes:45, tags:['electrical'] },
    { id:'ceiling-fan',      name:'Install ceiling fan',            minutes:90, tags:['electrical'] },
    { id:'tv-mount',         name:'Mount TV (no wire conceal)',     minutes:75, tags:['mounting'] },
    { id:'video-doorbell',   name:'Install video doorbell (battery/wifi)', minutes:45, tags:['smart-home'] },
    { id:'lock-smart',       name:'Install smart lock',             minutes:45, tags:['doors','smart-home'] },
    { id:'door-hinge',       name:'Adjust/repair door & hardware',  minutes:45, tags:['doors','carpentry'] },
    { id:'door-sweep',       name:'Install/replace door sweep',     minutes:30, tags:['doors','weather'] },
    { id:'weatherstrip',     name:'Add/replace weatherstripping',   minutes:45, tags:['doors','weather'] },
    { id:'drywall-small',    name:'Drywall patch (≤ 6")',           minutes:60, tags:['drywall','paint'] },
    { id:'caulk-tub',        name:'Re-caulk tub/shower',            minutes:60, tags:['bath','sealant'] },
    { id:'showerhead',       name:'Replace showerhead',             minutes:20, tags:['bath'] },
    { id:'leak-diagnose',    name:'Leak diagnosis',                 minutes:60, tags:['plumbing','diagnostic'] },
    { id:'garagedoor-seal',  name:'Replace garage door bottom seal',minutes:45, tags:['garage','weather'] },
    { id:'dishwasher',       name:'Install dishwasher',             minutes:120,tags:['plumbing','electrical'] },
    { id:'range-hood',       name:'Replace range hood (recirc)',    minutes:90, tags:['kitchen'] },
    { id:'tile-repair',      name:'Small tile repair (1–4 tiles)',  minutes:90, tags:['tile'] },
    { id:'window-blinds',    name:'Install/replace window blinds',  minutes:45, tags:['install'] },
    { id:'dryer-vent',       name:'Dryer vent clean',               minutes:60, tags:['safety','appliance'] },
    { id:'gutter-clean',     name:'Clean gutters (single story)',   minutes:120,tags:['exterior'] },
    { id:'downspout-ext',    name:'Install downspout extensions',   minutes:30, tags:['exterior','water'] },
    { id:'exterior-caulk',   name:'Exterior caulk touch-ups',       minutes:60, tags:['exterior','sealant'] },
    { id:'hose-bib-covers',  name:'Install hose-bib covers',        minutes:20, tags:['seasonal','weather'] },
    { id:'appliance-level',  name:'Level washer/dryer',             minutes:20, tags:['appliance'] },
    { id:'general-punch',    name:'General punch-list items',       minutes:60, tags:['general'] },
    { id:'misc',             name:'General handyman task',          minutes:60, tags:['general'] }
  ];

  // ---------- STATE ----------
  const state = {
    tasks: SEED.slice(),
    selected: load('selected', []),
    arrival: load('arrival', 'quickfix'),
    pay:     load('pay', 'cash'),
    depositUsd: 49
  };

  
  // ---------- INIT ----------
  function init() {
    console.log('Intake app loaded');

    $$('input[name=arrival]').forEach(r => { r.checked = (r.value === state.arrival); });
    $$('input[name=pay]').forEach(r => { r.checked = (r.value === state.pay); });

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

    on($('#search'), 'input', renderChecklist);
    on($('#btnAddCustom'), 'click', addCustom);

    renderChecklist();
    renderSelected();
    togglePayRows();
    updateEstimate();

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
        ${t.desc ? `<small class="dim">${t.desc}</small>` : ``}
        ${t.tags?.length ? `<small class="dim">${t.tags.join(' • ')}</small>` : ``}
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
      cur.innerHTML = `<div class="dim">Nothing selected yet — pick a package to start or add a custom to-do.</div>`;
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
    state.tasks.unshift(t);
    addSelected(t);
    $('#customText').value = ''; $('#customMinutes').value = '';
    renderChecklist();
  }

  function addSelected(t){
    if (!state.selected.find(s => s.id === t.id)) {
      state.selected.push({ id:t.id, name:t.name, minutes:Number(t.minutes||0), includes:t.includes||null });
      save('selected', state.selected);
      // warn if package overlaps existing granular picks
      if (t.includes && t.includes.some(id => state.selected.some(s => s.id === id))) {
        toast('Heads up: package overlaps individual items — estimate may double count. We’ll refine on-site.');
      }
    }
    renderSelected();
  }
  function removeSelected(id){
    state.selected = state.selected.filter(s => s.id !== id);
    save('selected', state.selected);
    renderSelected();
    const cb = $(`input[type=checkbox][data-id="${id}"]`); if (cb) cb.checked = false;
  }

  // ---------- ESTIMATE ----------
  function includedMinutes(arrival){
    if (arrival === 'quickfix') return 60;
    if (arrival === 'standard') return 90;
    if (arrival === 'halfday')  return 240;
    if (arrival === 'fullday')  return 480;
    return 0;
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
      estCash = 499; credits = Math.ceil(totalMin / 30);
    } else if (state.arrival === 'fullday'){
      estCash = 899; credits = Math.ceil(totalMin / 30);
    } else { // custom
      estCash = 99; credits = Math.ceil(totalMin / 30);
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
async function bookDeposit() {
  try {
    const payload = buildPayload();
    if (!API) return toast('Backend not configured.');
    const json = await postPlain(API, payload);  // use helper (text/plain)
    if (!json.ok || !json.checkout_url) {
      console.log('book error >', json);
      toast('Could not start checkout. Please try again or contact us.');
      return;
    }
    location.href = json.checkout_url;
  } catch (e) {
    console.error(e);
    toast('Network error — please try again.');
  }
}


// Generate intake summary
async function onGenerateSummary() {
  try {
    const result = await callBackend("summary", collectFormState());
    // ...render result
  } catch (err) {
    console.error(err);
    if (typeof showToast === "function") showToast(err.message);
  }
}

// Book & pay
async function onBookAndPay() {
  try {
    const result = await callBackend("book", collectBookingPayload());
    // expect: { checkoutUrl } or similar
    if (result.checkoutUrl) window.location.href = result.checkoutUrl;
  } catch (err) {
    console.error(err);
    showToast && showToast("Booking failed: " + err.message);
  }
}
  
  // ---------- AVAILABILITY ----------
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
