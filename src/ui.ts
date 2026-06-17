/**
 * A minimal single-page UI served at `/`. It drives the existing JSON endpoints
 * (same-origin, cookie-authenticated) so a user can connect, export and import in
 * the browser without curl. Kept dependency-free: inline CSS + vanilla JS.
 *
 * Note: the embedded client script deliberately avoids template literals so the
 * whole page can live inside this template literal without escaping headaches.
 */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ultimate Playlist</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0;
    background: #0f1115; color: #e6e6e6; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { margin: 0 0 4px; font-size: 1.7rem; }
  h2 { margin: 0 0 12px; font-size: 1.1rem; }
  .sub { color: #9aa0aa; margin: 0 0 24px; }
  section { background: #171a21; border: 1px solid #232733; border-radius: 12px;
    padding: 20px; margin-bottom: 20px; }
  label { display: block; font-size: .85rem; color: #b6bcc6; margin-bottom: 6px; }
  input, textarea { width: 100%; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #2c313d; background: #0f1115; color: #e6e6e6; font-size: .95rem;
    font-family: inherit; }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .btn { display: inline-block; margin-top: 12px; padding: 10px 16px; border: 0;
    border-radius: 8px; background: #1db954; color: #04130a; font-weight: 600;
    font-size: .95rem; cursor: pointer; text-decoration: none; }
  .btn:hover { background: #1ed760; }
  .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .msg { margin: 12px 0 0; font-size: .9rem; color: #9aa0aa; min-height: 1.2em; }
  .msg a { color: #1ed760; }
  #authStatus { font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Ultimate Playlist</h1>
  <p class="sub">Export a Spotify playlist to portable JSON, and import it back into Spotify.</p>

  <section>
    <div class="row">
      <span id="authStatus">Checking&hellip;</span>
      <a id="connectBtn" class="btn" href="/auth/login" style="display:none">Connect Spotify</a>
    </div>
  </section>

  <section>
    <h2>1. Export a playlist</h2>
    <label for="playlistInput">Spotify playlist URL or ID</label>
    <input id="playlistInput" placeholder="https://open.spotify.com/playlist/37i9dQZF1DX..." />
    <button id="exportBtn" class="btn">Export</button>
    <p id="exportMsg" class="msg"></p>
  </section>

  <section>
    <h2>2. Import to Spotify</h2>
    <label for="jsonArea">Playlist JSON (auto-filled by Export, or paste your own)</label>
    <textarea id="jsonArea" rows="12" placeholder='{ "name": "My Playlist", "tracks": [] }'></textarea>
    <button id="importBtn" class="btn">Import to Spotify</button>
    <p id="importMsg" class="msg"></p>
  </section>
</main>
<script>
  var byId = function (id) { return document.getElementById(id); };

  function setMsg(el, text) { el.textContent = text; }

  function refreshAuth() {
    fetch('/auth/status').then(function (r) { return r.json(); }).then(function (s) {
      var connected = s && s.authenticated;
      byId('authStatus').textContent = connected ? '\\u2713 Connected to Spotify' : 'Not connected';
      byId('connectBtn').style.display = connected ? 'none' : '';
    }).catch(function () { byId('authStatus').textContent = 'Status unavailable'; });
  }

  function parsePlaylistId(value) {
    var v = (value || '').trim();
    var m = v.match(/playlist[\\/:]([A-Za-z0-9]+)/);
    return m ? m[1] : v;
  }

  byId('exportBtn').onclick = function () {
    var id = parsePlaylistId(byId('playlistInput').value);
    if (!id) { setMsg(byId('exportMsg'), 'Enter a playlist URL or ID.'); return; }
    setMsg(byId('exportMsg'), 'Exporting\\u2026');
    fetch('/api/playlists/' + encodeURIComponent(id) + '/export').then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function (res) {
      if (res.status === 401) { setMsg(byId('exportMsg'), 'Connect Spotify first.'); return; }
      if (!res.ok) { setMsg(byId('exportMsg'), 'Error: ' + (res.data.error || res.status)); return; }
      byId('jsonArea').value = JSON.stringify(res.data, null, 2);
      setMsg(byId('exportMsg'), 'Exported "' + res.data.name + '" \\u2014 ' + res.data.tracks.length + ' tracks.');
    }).catch(function (e) { setMsg(byId('exportMsg'), 'Error: ' + e.message); });
  };

  byId('importBtn').onclick = function () {
    var body;
    try { body = JSON.parse(byId('jsonArea').value); }
    catch (e) { setMsg(byId('importMsg'), 'JSON is not valid.'); return; }
    setMsg(byId('importMsg'), 'Importing\\u2026');
    fetch('/api/playlists/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    }).then(function (res) {
      if (res.status === 401) { setMsg(byId('importMsg'), 'Connect Spotify first.'); return; }
      if (!res.ok) { setMsg(byId('importMsg'), 'Error: ' + (res.data.error || res.status)); return; }
      var msg = byId('importMsg');
      msg.textContent = 'Imported ' + res.data.added + ' tracks' +
        (res.data.unmatched.length ? ', ' + res.data.unmatched.length + ' unmatched' : '') + '. ';
      var a = document.createElement('a');
      a.href = res.data.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Open new playlist';
      msg.appendChild(a);
    }).catch(function (e) { setMsg(byId('importMsg'), 'Error: ' + e.message); });
  };

  if (location.search.indexOf('connected=1') !== -1) { history.replaceState({}, '', '/'); }
  refreshAuth();
</script>
</body>
</html>`;
