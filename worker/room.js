// The one game room, as a Cloudflare Durable Object. Every WebSocket in the deployment lands
// here (the worker always asks for the object named "main"), so there is exactly one mission,
// the same as one laptop running server.js. The rules and the delay are in server/hub.js.
import { Hub } from '../server/hub.js';
import { CFG } from '../client/shared/config.js';

export class GameRoom {
  constructor(state, env) {
    this.hub = new Hub(undefined, { adminKey: env?.ADMIN_KEY }); // set ADMIN_KEY as a Worker variable or secret to lock /admin
    this.timer = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      const path = new URL(request.url).pathname;
      if (path === '/players' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return Response.json(this.hub.choosePlayers(body?.players), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (path === '/seats') return Response.json(this.hub.seats(), { headers: { 'Cache-Control': 'no-store' } });
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    const c = { send: data => { try { server.send(data); } catch {} }, close: () => { try { server.close(4000, 'kicked'); } catch {} } };
    this.hub.add(c);
    server.addEventListener('message', e => this.hub.message(c, e.data, typeof e.data !== 'string'));
    const bye = () => {
      this.hub.remove(c);
      if (!this.hub.clients.size) { clearInterval(this.timer); this.timer = null; } // let the object sleep
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);

    // The simulation runs while anyone is connected. (Do not switch this object to the WebSocket
    // hibernation API: hibernation drops timers, and the tick is a timer.)
    if (!this.timer) { this.hub.last = Date.now(); this.timer = setInterval(() => this.hub.tick(), CFG.tickMs); }
    return new Response(null, { status: 101, webSocket: client });
  }
}
