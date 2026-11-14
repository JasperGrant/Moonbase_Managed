// Cloudflare Worker entry. Static files come from the assets binding (the dist/ folder that
// `npm run build:cf` assembles), the clean seat URLs map onto the two HTML pages, and every
// WebSocket goes to the single GameRoom Durable Object.
import { PAGES } from '../server/hub.js';
export { GameRoom } from './room.js';

export default {
  fetch(request, env) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return env.GAME.get(env.GAME.idFromName('main')).fetch(request);
    }
    const url = new URL(request.url);
    const page = url.pathname === '/' ? '/index.html' : PAGES[url.pathname];
    if (page) { url.pathname = page; return env.ASSETS.fetch(new Request(url, request)); }
    return env.ASSETS.fetch(request);
  },
};
