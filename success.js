(async () => {
  try {
    const p = new URLSearchParams(location.search);
    const sess = p.get('session_id');
    if (sess && window.STEADY_CONFIG && STEADY_CONFIG.APPS_SCRIPT_URL) {
      await fetch(STEADY_CONFIG.APPS_SCRIPT_URL + '?action=confirm&session_id=' + encodeURIComponent(sess));
    }
  } catch (e) {}

  <script>
const EXEC_URL = "<YOUR NEW /exec URL>"; // keep this in one place in config
const params = new URLSearchParams(location.search);
const sid = params.get("session_id");

async function confirmOnce() {
  if (!sid) return;
  const key = `confirmed:${sid}`;
  if (localStorage.getItem(key)) return;       // already confirmed in this browser

  try {
    await fetch(`${EXEC_URL}?action=confirm&session_id=${encodeURIComponent(sid)}`, { method: "GET" });
  } finally {
    localStorage.setItem(key, "1");            // guard against reloads
    history.replaceState(null, "", location.pathname); // drop ?session_id from URL
  }
}
confirmOnce();
</script>

})();
