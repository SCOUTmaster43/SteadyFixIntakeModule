# Steady Intake — GitHub Scaffold

This repo hosts the Intake Module v3.5 for The Steady Fix Co.

## Files
- `index.html` — Intake UI (Quick Fix, Standard, Half Day, Full Day, Custom $99; next-slot finder; booking)
- `success.html` — Landing page after Stripe checkout; calls the `confirm` endpoint
- `config.js` — Set your Google Apps Script Web App `/exec` URL here
- `README.md` — This file

## Setup
1. Open `config.js` and set `APPS_SCRIPT_URL` to your `/exec` URL from Apps Script.
2. Commit & push to GitHub.

### GitHub Pages (optional)
- Settings → Pages → Deploy from branch → branch `main` (or `master`), folder `/root`.
- After it publishes, you’ll have a URL like `https://<user>.github.io/<repo>/`.
- Use `index.html` as the estimator, and `success.html` as the success page redirect in Stripe.

### Squarespace
- You can embed `index.html` via an `<iframe>` or link out to the GH Pages URL.
- Add the confirm script to your success page if you don’t use `success.html` here.

### Stripe Test Cards
- `4242 4242 4242 4242`, any future expiry, CVC 123, any ZIP.

### Notes
- The backend enforces a 48h lead time (auto-finds next slot if requested).
- Custom Quote always charges a $99 deposit; others $49.

Auto-deploy test
