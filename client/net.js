// One WebSocket to the server. Reconnects by itself.
export function connect(role, hello = {}) {
  const api = { onState: null, onMsg: null, onBinary: null, onTaken: null, onKicked: null, onDenied: null, open: false, send, sendBin };
  let ws, lastN = 0, stopped = false; // stopped: told to go away (seat taken, kicked, wrong key); no reconnect
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function sendBin(buf) { if (ws && ws.readyState === 1) ws.send(buf); }
  function open() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { lastN = 0; api.open = true; send({ t: 'hello', role, ...hello }); };
    ws.onclose = () => { api.open = false; if (!stopped) setTimeout(open, 1000); };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { api.onBinary?.(e.data); return; }
      const m = JSON.parse(e.data);
      if (m.t === 'taken') { stopped = true; ws.close(); api.onTaken?.(m.role); return; } // someone already has this seat
      if (m.t === 'kicked') { stopped = true; ws.close(); api.onKicked?.(); return; }      // the admin removed us
      if (m.t === 'denied') { stopped = true; ws.close(); api.onDenied?.(); return; }      // admin console: wrong key
      if (m.t !== 'state') { api.onMsg?.(m); return; }
      if (m.n < lastN) return; // delayed copies can arrive after newer ones; drop them
      lastN = m.n;
      api.onState?.(m);
    };
  }
  open();
  return api;
}
