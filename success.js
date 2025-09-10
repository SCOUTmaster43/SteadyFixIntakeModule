// success.js — call confirm exactly once per session_id
(() => {
  try {
    const EXEC_URL =
      (window.STEADY_CONFIG && window.STEADY_CONFIG.APPS_SCRIPT_URL) || ""; // keep in config
    const params = new URLSearchParams(location.search);
    const sid = params.get("session_id");
    if (!EXEC_URL || !sid) return;

    const key = `confirmed:${sid}`;
    if (localStorage.getItem(key)) return; // already confirmed in this browser

    fetch(`${EXEC_URL}?action=confirm&session_id=${encodeURIComponent(sid)}`, {
      method: "GET",
      keepalive: true,
      cache: "no-store",
      credentials: "omit",
    }).finally(() => {
      localStorage.setItem(key, "1"); // guard against reloads

      // Remove only the session_id (keep other params/hash intact)
      const url = new URL(location.href);
      url.searchParams.delete("session_id");
      history.replaceState(null, "", url.pathname + (url.search ? "?" + url.searchParams.toString() : "") + url.hash);
    });
  } catch (_) {
    /* no-op */
  }
})();
