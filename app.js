/* Steady Intake — app.js (v3.7.1) */
btnFind?.addEventListener("click", async () => {
const findMsg = $("#findMsg");
findMsg.textContent = "Finding next slot…";
try {
const url = `${window.APPS_SCRIPT_URL}?action=nextslot`;
const res = await fetch(url, { method: "GET", mode: "cors" });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();
if (json?.date) $("#prefDate").value = json.date;
if (json?.slot) {
const r = document.querySelector(`input[name="timeslot"][value="${json.slot}"]`);
if (r) r.checked = true;
}
findMsg.textContent = json?.note ? `Next: ${json.date} (${json.slot}). ${json.note}` : `Next: ${json.date} (${json.slot}).`;
} catch (e) {
findMsg.textContent = "Couldn’t look up next slot.";
}
});

// Book & Pay (POST → Apps Script → Stripe Checkout)
btnBook?.addEventListener("click", async () => {
msgEl.textContent = "Creating booking…";
const intake = readIntake();
const est = readEstimatorFromUI();

if (!intake.arrival) { msgEl.textContent = "Choose an arrival option."; return; }
if (!intake.name || !intake.email || !intake.phone || !intake.zip) {
msgEl.textContent = "Please complete your contact info (name, email, phone, ZIP).";
return;
}

const payload = {
action: "book",
arrival: intake.arrival,
date: intake.date || null,
slot: intake.slot || null,
flexible: !!intake.flexible,
customer: {
name: intake.name,
email: intake.email,
phone: intake.phone,
zip: intake.zip
},
details: intake.details || "",
estimate: est,
source: "gh-pages",
page: location.href
};

try {
const res = await fetch(window.APPS_SCRIPT_URL, {
method: "POST",
mode: "cors",
headers: { "Content-Type": "text/plain" },
body: JSON.stringify(payload)
});

if (!res.ok) {
const txt = await res.text().catch(()=>"");
throw new Error(`HTTP ${res.status} ${txt}`);
}

const json = await res.json();
if (json?.checkout_url) {
msgEl.textContent = "Redirecting to secure checkout…";
diagEl.textContent = json?.eventId ? `Event: ${json.eventId}` : "";
location.href = json.checkout_url;
} else {
msgEl.textContent = json?.message || "Couldn’t start checkout (missing URL).";
diagEl.textContent = JSON.stringify(json || {}, null, 2);
}
} catch (err) {
msgEl.textContent = "Booking failed.";
diagEl.textContent = String(err);
}
});
