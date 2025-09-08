Steady Intake — Project Notes
Live app: https://intake.thesteadyfix.com
Backend (Apps Script /exec): https://script.google.com/macros/s/AKfycbzHGyElT1QreW_i-iaJF1BF_o_wZVvDLdYVN4FFOuxuopoOjsDHgyAAX89WzKhLQXP5LQ/exec
Overview
Customer-facing intake + booking flow for The Steady Fix Co.
Frontend: Static site on GitHub Pages (this repo). Dark UI, Anton/Epilogue typography, brand orange.
Backend: Google Apps Script handles:
Create pending calendar event
Create Stripe Checkout deposit session
Email customer + owner
Confirm endpoint marks event Pending-Paid and sends next-steps email
Next-slot finder ≥ 48h out
Current UX (locked)
Arrival options
Quick Fix — $129 / 60 min
Standard Arrival — $229 / 120 min (then $25 / 15 min over)
Half Day — $499 / 4 h
Full Day — $899 / 8 h
Custom Quote — $99 deposit
Deposits: $49 (custom = $99)
Schedule: Morning (8–12) / Afternoon (1–5) + “Flexible” + Find Next Available (≥48h)
Calendar: Creates Pending – …; confirm flips to Pending-Paid – …
Credits: removed from UX
Repo Layout
/ (GitHub Pages root)
├─ index.html           # Intake UI (loads config.js then app.js)
├─ app.js               # Frontend logic (v3.6 – CORS-safe POST; friendly errors)
├─ config.js            # window.CONFIG.APPS_SCRIPT_URL = ".../exec"
├─ success.html         # Stripe success landing (optional confirm call, see appendix)
└─ assets/...           # (optional) fonts/images
Configuration
Frontend (config.js)
window.CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzHGyElT1QreW_i-iaJF1BF_o_wZVvDLdYVN4FFOuxuopoOjsDHgyAAX89WzKhLQXP5LQ/exec"
};
Load order in index.html:
<script defer src="config.js"></script>
<script defer src="app.js"></script>
Backend (Apps Script → Script Properties)
STRIPE_SECRET_KEY = sk_test_... (then live later)
SUCCESS_URL = https://thesteadyfix.com/online-estimator (we append ?status=success&session_id=...)
CANCEL_URL = https://thesteadyfix.com/online-estimator?status=cancel
CALENDAR_ID = ...@group.calendar.google.com (or owner’s calendar)
SHEET_ID = (optional) Google Sheet for logging
STRIPE_PRICE_ID = (optional) price_... (not required; we send dynamic deposits)
Deployment access: set to Anyone (anonymous) for public booking.
Endpoints
Health
GET /exec?action=ping
→ { ok: true, message: "ok" }
Find next slot (≥48h)
GET /exec?action=nextslot&arrival=standard&timeslot=morning&min_hours=48
→ { ok: true, preferred_date:"YYYY-MM-DD", timeslot:"morning|afternoon|fullday", start_iso, end_iso }
Book (Stripe Checkout + pending Calendar event)
Frontend sends simple POST (CORS-safe) with Content-Type: text/plain.
POST /exec
Body: JSON
{
  "action": "book",
  "arrival": "standard",              // quickfix|standard|halfday|fullday|custom
  "pay": "cash",
  "deposit_usd": 49,                  // custom => 99 (server also enforces)
  "customer": { "name":"...", "email":"...", "phone":"...", "zip":"..." },
  "schedule": {
    "preferred_date":"YYYY-MM-DD",
    "timeslot":"morning|afternoon|fullday",
    "flexible": true|false,
    "find_next": false
  },
  "estimate": { "minutes": 150, "extra": 30 },
  "summary": "text",
  "source": "steady-intake-v3.6"
}
Response
{ "ok": true, "checkout_url": "https://checkout.stripe.com/...", "session_id":"cs_test_...", "event_id":"..." }
Confirm (rename event to Pending-Paid + next-steps email)
GET /exec?action=confirm&session_id=cs_test_123
→ { ok:true, event_updated:true, payment_status:"paid", event_id:"..." }
Note: We confirm by polling this endpoint from the success page (see Appendix) or by emailing manual link. A Stripe webhook could replace polling if desired.
Frontend Details
CORS: Booking POST uses Content-Type: text/plain with JSON.stringify(payload) (no preflight → Apps Script friendly).
Buttons: disable while in flight with “Processing…” label; friendly error messages in #msg, raw response in #diag.
Next-slot: simple GET; fills date input and radiogroup.
Estimator: Standard includes 120 min; overage $25/15 min (display only; not charged here).
Styling
Fonts: Anton (headings), Epilogue (body) via Google Fonts
Colors: brand orange #ff5a1f, dark gray cards, soft borders, rounded buttons
Quick Start (dev handoff)
Update config.js with the current /exec URL.
Verify Script Properties in Apps Script (keys above).
Deploy web app (New deployment → Web app → “Anyone”).
Test:
Open /config.js in the browser → expect the URL line.
Load intake page → DevTools shows “ping → { ok:true }”.
Click Find Next Available → shows date (≥48h).
Book with test email → Stripe Checkout opens.
Troubleshooting
APPS_SCRIPT_URL is not defined
config.js missing or not loaded before app.js. Check load order & cache (hard refresh / Incognito).
CORS / Preflight blocked
Ensure booking fetch uses Content-Type: text/plain and not application/json.
Stripe error, no checkout URL
Wrong / missing STRIPE_SECRET_KEY
Using live key in test mode (or vice versa)
Check Apps Script logs for stripe_error row
No calendar event created
CALENDAR_ID wrong or not accessible by the script’s account
Check for permission prompts or exceptions in log (calendar_error)
Next slot returns none
48h rule + fully booked; try timeslot=afternoon or later dates
Changelog (high level)
v3.6 Frontend: CORS-safe booking (text/plain), friendly errors, checklist/estimator, next-slot lookup.
v3.1 Backend: endpoints book, confirm, nextslot; Pending → Pending-Paid event title; $99 custom deposit; 48h rule.
Roadmap / Backlog
 Preload full packages (Seasonal, Safety, Baby, Entryway, Kitchen, Bath, Tech, Laundry, Rental Turn) with overlap warnings.
 Success page auto-confirm (see Appendix) + clear next steps.
 Stripe live key switch; small live test.
 Add structured logging to Sheet (Requests tab) with request/response snapshot.
 Optional: Stripe webhook to auto-confirm instead of polling.
 Minor UI polish (card spacing, microcopy, focus states).
Appendix — success.html auto-confirm snippet
Add this to success.html so returning customers are auto-confirmed:
<script>
(async () => {
  const u = new URL(location.href);
  const sid = u.searchParams.get('session_id');
  if (!sid) return;

  // APPS_SCRIPT_URL from config.js if you already load it on this page; otherwise paste URL here.
  const url = new URL(window.CONFIG?.APPS_SCRIPT_URL || '<<PASTE_EXEC_URL_IF_NEEDED>>');
  url.searchParams.set('action', 'confirm');
  url.searchParams.set('session_id', sid);

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const j = await res.json();
    console.log('confirm →', j);
    // Optionally show a success banner to the user here.
  } catch (e) {
    console.warn('confirm failed', e);
  }
})();
</script>
Contact
Owner inbox for customer comms: hello@thesteadyfix.com
For internal questions on this module, open an issue in this repo.
Why we post with text/plain
Sending application/json triggers a CORS preflight (an OPTIONS request). Apps Script web apps don’t return proper CORS headers on preflight, so the browser blocks. A simple POST using text/plain skips preflight and works reliably.
End file
