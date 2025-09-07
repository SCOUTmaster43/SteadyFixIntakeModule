(async () => {
  try {
    const p = new URLSearchParams(location.search);
    const sess = p.get('session_id');
    if (sess && window.STEADY_CONFIG && STEADY_CONFIG.APPS_SCRIPT_URL) {
      await fetch(STEADY_CONFIG.APPS_SCRIPT_URL + '?action=confirm&session_id=' + encodeURIComponent(sess));
    }
  } catch (e) {}
})();
