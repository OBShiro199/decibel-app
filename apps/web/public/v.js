/* Decibel website visitor identification. Add to the <head> of every page:
 *   <script defer src="https://www.usedecibel.com/v.js" data-site="YOUR_SITE_KEY"></script>
 * Sends the page path and referrer on each page view (including single-page-app navigation). No cookies, no
 * storage, nothing about the person: the visit is matched to a company from its business network only.
 * Visitors with Do Not Track or Global Privacy Control switched on are not sent at all. */
(function () {
  var s = document.currentScript;
  var key = s && s.getAttribute('data-site');
  if (!key || navigator.webdriver) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  var endpoint = (s.getAttribute('data-endpoint') || 'https://fkjwglvztyyerewldnty.supabase.co/functions/v1/visitor-track');
  var last = '';
  function send() {
    var path = location.pathname + location.search;
    if (path === last) return;
    last = path;
    var body = JSON.stringify({ k: key, p: path.slice(0, 300), r: document.referrer ? document.referrer.slice(0, 300) : null });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try {
      fetch(endpoint, { method: 'POST', body: body, headers: { 'content-type': 'text/plain' }, keepalive: true, mode: 'cors' });
    } catch (e) {}
  }
  // single-page apps: count each route change as a page view
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(send, 0);
      return r;
    };
  });
  window.addEventListener('popstate', send);
  if (document.readyState === 'complete' || document.readyState === 'interactive') send();
  else document.addEventListener('DOMContentLoaded', send);
})();
