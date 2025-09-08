/* Intake v3.6 — CORS-safe booking + friendly errors
   - Uses text/plain POST to avoid preflight to Apps Script
   - Friendly messages + diagnostics
   - Works with: quickfix | standard | halfday | fullday | custom
   - Next-available finder (>=48h), summary, checklist, estimator
*/

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- Config ----------
  const CONFIG = (window.CONFIG || {});
  const APPS_URL = CONFIG.APPS_SCRIPT_URL || "";
  const MIN_HOURS = 48; // rule: no bookings inside 48h

  // ---------- Elements ----------
  const el = {
    list:        $("#list"),
    search:      $("#search"),
    prefDate:    $("#prefDate"),
    btnFind:     $("#btnFind"),
    flexible:    $("#flexible"),

    // Estimate boxes
    estTasks:    $("#estTasks"),
    estMinutes:  $("#estMinutes"),
    estIncluded: $("#estIncluded"),
    estExtra:    $("#estExtra"),
    estTotal:    $("#estTotal"),
    estStatus:   $("#estStatus"),

    // Customer fields (under estimator)
    name:        $("#custName"),
    email:       $("#custEmail"),
    phone:       $("#custPhone"),
    zip:         $("#custZip"),
    details:     $("#projectDetails"),

    // Actions
    btnSummary:  $("#btnSummary"),
    btnCopy:     $("#btnCopy"),
    btnBook:     $("#btnBook"),

    // Output
    summary:     $("#summary"),
    msg:         $("#msg"),
    diag:        $("#diag"),
  };

  // ---------- Checklist presets ----------
  const PRESETS = [
    { id: "door-squeak",  title:"Adjust squeaky / rubbing door",  minutes:20, tag:"Seasonal" },
    { id: "smoke-battery",title:"Replace smoke/CO alarm batteries", minutes:15, tag:"Safety" },
    { id: "gfci-test",    title:"Test GFCI outlets",               minutes:10, tag:"Safety" },
    { id: "baby-gate",    title:"Install baby gate",               minutes:30, tag:"Baby" },
    // add more later…
  ];

  // State
  const state = {
    tasks: [], // {id,title,minutes,tag}
    arrival: "quickfix",  // radio group: [name=arrival]
    timeslot: "morning",  // radio group: [name=timeslot]
  };

  // ---------- Utilities ----------
  const fmtMoney = (n) => `$${Number(n).toFixed(0)}`;

  const readRadios = () => {
    const a = $$('input[name="arrival"]:checked')[0];
    const t = $$('input[name="timeslot"]:checked')[0];
    state.arrival  = a ? a.value : "quickfix";
    state.timeslot = t ? t.value : "morning";
  };

  const calcIncludedMinutes = (arrival) => {
    if (arrival === "quickfix")  return 60;
    if (arrival === "standard")  return 120; // <- updated copy
    if (arrival === "halfday")   return 240;
    if (arrival === "fullday")   return 480;
    if (arrival === "custom")    return 0;   // flat $99 deposit; minutes advisory only
    return 60;
  };

  const calcDeposit = (arrival) => arrival === "custom" ? 99 : 49;

  const calcCashTotal = (arrival, minutes) => {
    // Customer-facing total reference (not charged here; Stripe takes deposit only)
    if (arrival === "quickfix")  return 129; // 1 task / 60 min flat
    if (arrival === "standard") {
      const included = 120;
      const extra = Math.max(0, minutes - included);
      const blocks15 = Math.ceil(extra / 15);
      return 229 + blocks15 * 25;
    }
    if (arrival === "halfday")   return 499;
    if (arrival === "fullday")   return 899;
    if (arrival === "custom")    return 99; // just show the deposit for clarity
    return 129;
  };

  const summarize = () => {
    readRadios();
    const minutes = state.tasks.reduce((sum, t) => sum + (t.minutes || 0), 0);
    const included = calcIncludedMinutes(state.arrival);
    const extra = Math.max(0, minutes - included);
    const total = calcCashTotal(state.arrival, minutes);

    el.estTasks.textContent = String(state.tasks.length);
    el.estMinutes.textContent = String(minutes);
    el.estIncluded.textContent = String(included);
    el.estExtra.textContent = String(extra);
    el.estTotal.textContent = fmtMoney(total);
    el.estStatus.textContent = "Ready";

    const date = el.prefDate && el.prefDate.value ? el.prefDate.value : "(none)";
    const when = state.timeslot === "morning" ? "morning" :
                 state.timeslot === "afternoon" ? "afternoon" : state.timeslot;

    const lines = [];
    lines.push(`Arrival: ${readableArrival(state.arrival)} — ${fmtMoney(calcDeposit(state.arrival))} deposit`);
    lines.push(`Preferred: ${date} ${when}`);
    if (el.flexible && el.flexible.checked) lines.push("Flexibility: yes");
    if (state.tasks.length) {
      lines.push("");
      lines.push("Checklist:");
      state.tasks.forEach((t,i) => lines.push(`  ${i+1}. ${t.title} (${t.minutes} min)`));
    }
    lines.push("");
    lines.push(`Estimate minutes: ${minutes} (included ${included}, extra ${extra})`);
    lines.push(`Reference total (cash): ${fmtMoney(total)}`);
    el.summary.textContent = lines.join("\n");
  };

  const readableArrival = (a) =>
    a === "quickfix" ? "Quick Fix" :
    a === "standard" ? "Standard Arrival (multiple tasks / 120 min)" :
    a === "halfday"  ? "Half Day" :
    a === "fullday"  ? "Full Day" :
    a === "custom"   ? "Custom Quote" : "Arrival";

  const setMsg = (text, kind = "ok") => {
    if (!el.msg) return;
    el.msg.textContent = text || "";
    el.msg.style.color = (kind === "error" ? "#f87171" : (kind === "warn" ? "#f59e0b" : "#34d399"));
  };

  const setDiag = (obj) => { if (el.diag) el.diag.textContent = obj ? JSON.stringify(obj, null, 2) : ""; };

  const lockBtn = (button, on, labelWhenOn = "Processing…") => {
    if (!button) return;
    if (on) {
      button.dataset._orig = button.textContent;
      button.textContent = labelWhenOn;
      button.disabled = true;
      button.style.opacity = 0.7;
    } else {
      button.textContent = button.dataset._orig || button.textContent;
      button.disabled = false;
      button.style.opacity = 1;
    }
  };

  // ---------- Checklist UI ----------
  const renderChecklist = () => {
    if (!el.list) return;
    el.list.innerHTML = "";
    PRESETS.forEach(item => {
      const card = document.createElement("div");
      card.className = "task";
      card.innerHTML = `
        <h4>${item.title}</h4>
        <small>${item.tag} · ${item.minutes} min</small>
        <div class="row" style="margin-top:8px">
          <div class="grow"></div>
          <button class="btn secondary" data-id="${item.id}">Add</button>
        </div>
      `;
      card.querySelector("button").addEventListener("click", () => {
        if (!state.tasks.find(t => t.id === item.id)) {
          state.tasks.push({ ...item });
          summarize();
        }
      });
      el.list.appendChild(card);
    });
  };

  // ---------- Next Available (>=48h) ----------
  async function findNext() {
    if (!APPS_URL) { setMsg("Booking backend is not configured (missing APPS_SCRIPT_URL).", "error"); return; }
    try {
      readRadios();
      lockBtn(el.btnFind, true, "Finding…");
      setMsg("Looking up the next available slot…");
      setDiag(null);

      const url = new URL(APPS_URL);
      url.searchParams.set("action", "nextslot");
      url.searchParams.set("arrival", state.arrival);
      url.searchParams.set("timeslot", state.timeslot);
      url.searchParams.set("min_hours", String(MIN_HOURS));

      const res = await fetch(url.toString(), { method: "GET" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data || !data.ok) {
        setMsg("Couldn’t find a slot right now. Try a different option or uncheck ‘Flexible’.", "warn");
        setDiag({ status: res.status, data });
        return;
      }

      // Fill UI
      if (el.prefDate) el.prefDate.value = data.preferred_date || "";
      if (data.timeslot && data.timeslot !== state.timeslot) {
        const r = $(`input[name="timeslot"][value="${data.timeslot}"]`);
        if (r) r.checked = true;
      }
      setMsg(`Next available: ${data.preferred_date} (${data.timeslot})`);
    } catch (err) {
      setMsg("Network error finding the next slot — please try again.", "error");
      setDiag({ error: String(err) });
    } finally {
      lockBtn(el.btnFind, false);
    }
  }

  // ---------- Booking (CORS-safe) ----------
  async function onBook() {
    if (!APPS_URL) { setMsg("Booking backend is not configured (missing APPS_SCRIPT_URL).", "error"); return; }

    readRadios();
    summarize(); // ensure summary is current

    // Tiny validation
    if (!el.email || !el.email.value) { setMsg("Please enter your email so we can send your receipt and confirmation.", "warn"); return; }

    const minutes = state.tasks.reduce((s, t) => s + (t.minutes || 0), 0);
    const included = calcIncludedMinutes(state.arrival);
    const extra = Math.max(0, minutes - included);
    const depositUsd = calcDeposit(state.arrival);

    const payload = {
      action: "book",
      arrival: state.arrival,
      pay: "cash",               // credits removed from UX
      deposit_usd: depositUsd,   // dynamic deposit ($49 or $99 for custom)
      customer: {
        name:  el.name  ? el.name.value  : "",
        email: el.email ? el.email.value : "",
        phone: el.phone ? el.phone.value : "",
        zip:   el.zip   ? el.zip.value   : "",
      },
      summary: el.summary ? el.summary.textContent : "",
      schedule: {
        preferred_date: el.prefDate ? (el.prefDate.value || "") : "",
        timeslot: state.timeslot,
        flexible: el.flexible ? !!el.flexible.checked : false,
        find_next: false
      },
      estimate: { minutes, extra },
      source: "steady-intake-v3.6"
    };

    try {
      lockBtn(el.btnBook, true);
      setMsg("Opening secure checkout…");
      setDiag(null);

      // CORS-safe POST—no preflight (text/plain)
      const res = await fetch(APPS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(async () => {
        // If Apps Script returns HTML on error, capture raw text
        const txt = await res.text();
        return { ok:false, raw:txt };
      });

      if (!res.ok || !data || !data.ok || !data.checkout_url) {
        const friendly = (!res.ok && res.status === 429)
          ? "Too many attempts in a short time — please wait a minute and try again."
          : "Booking error — please try again. If this keeps happening, contact us.";
        setMsg(friendly, "error");
        setDiag({ status: res.status, data });
        return;
      }

      // Redirect to Stripe Checkout
      location.assign(data.checkout_url);
    } catch (err) {
      // Typical CORS / network error path
      const m = String(err || "");
      const friendly = m.includes("Failed to fetch") || m.includes("NetworkError")
        ? "Network/CORS error reaching the booking server. Please refresh and try again."
        : "Unexpected error. Please try again.";
      setMsg(friendly, "error");
      setDiag({ error: m });
    } finally {
      lockBtn(el.btnBook, false);
    }
  }

  // ---------- Summary + Copy ----------
  function makeSummary() { summarize(); setMsg("Summary generated."); }
  async function copySummary() {
    try {
      summarize();
      await navigator.clipboard.writeText(el.summary.textContent || "");
      setMsg("Copied to clipboard.");
    } catch {
      setMsg("Couldn’t copy — select the text and copy manually.", "warn");
    }
  }

  // ---------- Ping backend on load ----------
  async function ping() {
    if (!APPS_URL) { setMsg("Backend URL missing — set APPS_SCRIPT_URL in config.js", "error"); return; }
    try {
      const url = new URL(APPS_URL);
      url.searchParams.set("action", "ping");
      const res = await fetch(url.toString());
      const j = await res.json().catch(() => ({}));
      // eslint-disable-next-line no-console
      console.log("ping →", j);
    } catch {}
  }

  // ---------- Wire up ----------
  function initRadios() {
    $$('input[name="arrival"]').forEach(r =>
      r.addEventListener("change", () => { readRadios(); summarize(); })
    );
    $$('input[name="timeslot"]').forEach(r =>
      r.addEventListener("change", () => { readRadios(); summarize(); })
    );
  }

  function initSearch() {
    if (!el.search) return;
    el.search.addEventListener("input", () => {
      const q = el.search.value.trim().toLowerCase();
      $$("#list .task").forEach(card => {
        const t = (card.querySelector("h4")?.textContent || "").toLowerCase();
        card.style.display = t.includes(q) ? "" : "none";
      });
    });
  }

  function init() {
    try {
      renderChecklist();
      initRadios();
      initSearch();

      if (el.btnFind)    el.btnFind.addEventListener("click", findNext);
      if (el.btnBook)    el.btnBook.addEventListener("click", onBook);
      if (el.btnSummary) el.btnSummary.addEventListener("click", makeSummary);
      if (el.btnCopy)    el.btnCopy.addEventListener("click", copySummary);

      readRadios();
      summarize();
      ping();
      console.log("Intake app loaded");
    } catch (e) {
      setMsg("UI failed to initialize.", "error");
      setDiag({ error: String(e) });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
