// One WebSocket to the server. Reconnects by itself.
export function connect(role) {
  const api = { onState: null, onMsg: null, onBinary: null, open: false, send, sendBin };
  let ws, lastN = 0;
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function sendBin(buf) { if (ws && ws.readyState === 1) ws.send(buf); }
  function open() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { lastN = 0; api.open = true; send({ t: 'hello', role }); };
    ws.onclose = () => { api.open = false; setTimeout(open, 1000); };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { api.onBinary?.(e.data); return; }
      const m = JSON.parse(e.data);
      if (m.t !== 'state') { api.onMsg?.(m); return; }
      if (m.n < lastN) return; // delayed copies can arrive after newer ones; drop them
      lastN = m.n;
      api.onState?.(m);
    };
  }
  open();
  return api;
}
