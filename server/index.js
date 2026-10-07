// Rumble Rascals server: serves the web client and runs authoritative game rooms over WebSockets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { DT, SNAPSHOT_EVERY, TICK_RATE, MAX_PLAYERS } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const STATIC = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/shared/', path.join(ROOT, 'shared/')],
  ['/', path.join(ROOT, 'client/')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    const file = path.normalize(path.join(dir, url.slice(prefix.length)));
    if (!file.startsWith(dir)) break; // path traversal guard
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ------------------------------------------------------------------ rooms
const rooms = new Map(); // code -> { game, clients:Set<Client>, emptySince }
let nextClientId = 1;

function cleanCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c || 'MAIN';
}

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { game: new Game(code), clients: new Set(), emptySince: 0 };
    rooms.set(code, room);
    console.log(`[room ${code}] created`);
  }
  return room;
}

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  const client = { id: nextClientId++, ws, room: null, players: new Set() };
  try { ws._socket.setNoDelay(true); } catch { /* not fatal */ }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const room = client.room;
    switch (msg.t) {
      case 'hello': {
        if (client.room) return;
        const code = cleanCode(msg.room);
        const r = getRoom(code);
        client.room = r;
        r.clients.add(client);
        updateHost(r);
        send(ws, { t: 'welcome', cid: client.id, room: code, tickRate: TICK_RATE, maxPlayers: MAX_PLAYERS });
        send(ws, r.game.roster());
        break;
      }
      case 'join': {
        if (!room) return;
        const p = room.game.addPlayer(client.id, msg.name);
        if (!p) { send(ws, { t: 'full', slot: msg.slot }); return; }
        client.players.add(p.id);
        send(ws, { t: 'joined', slot: msg.slot, id: p.id });
        break;
      }
      case 'leave': {
        if (!room || !client.players.has(msg.id)) return;
        client.players.delete(msg.id);
        room.game.removePlayer(msg.id);
        break;
      }
      case 'in': {
        if (!room || !Array.isArray(msg.d)) return;
        for (const row of msg.d) {
          if (!Array.isArray(row) || !client.players.has(row[0])) continue;
          room.game.pushInput(row[0], row[1], row[2], row[3], row[4], row[5]);
        }
        break;
      }
      case 'ready':
        if (room) room.game.readyMsg(client.id, msg.id);
        break;
      case 'char':
        if (room) room.game.setCharacter(client.id, msg.id, msg.c);
        break;
      case 'set':
        if (room) room.game.setSetting(client.id, String(msg.key), msg.val);
        break;
      case 'cos':
        if (room) room.game.setCosmetics(client.id, msg.id, msg.hat, msg.face);
        break;
      case 'color':
        if (room) room.game.cycleColor(client.id, msg.id);
        break;
      case 'level':
        if (room) room.game.requestLevel(client.id, msg.dir);
        break;
      case 'ping':
        send(ws, { t: 'pong', c: msg.c, tick: room ? room.game.tick : 0 });
        break;
    }
  });

  ws.on('close', () => {
    if (client.room) {
      client.room.game.removeClient(client.id);
      client.room.clients.delete(client);
      updateHost(client.room);
    }
  });
  ws.on('error', () => {});
});

// The first player in the room is the host and controls the match settings.
function updateHost(room) {
  const first = room.clients.values().next().value;
  const host = first ? first.id : null;
  if (room.game.hostClient !== host) {
    room.game.hostClient = host;
    room.game.rosterDirty = true;
  }
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ------------------------------------------------------------------ fixed-step loop
let last = performance.now();
let acc = 0;
const STEP_MS = DT * 1000;

function loop() {
  const now = performance.now();
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // don't spiral after a hiccup
  while (acc >= STEP_MS) {
    acc -= STEP_MS;
    for (const [code, room] of rooms) {
      if (room.clients.size === 0) {
        if (!room.emptySince) room.emptySince = now;
        else if (now - room.emptySince > 60000) {
          rooms.delete(code);
          console.log(`[room ${code}] closed`);
        }
        continue;
      }
      room.emptySince = 0;
      const g = room.game;
      g.step();
      if (g.tick % SNAPSHOT_EVERY === 0) {
        const snap = JSON.stringify(g.snapshot());
        let roster = null;
        if (g.rosterDirty) {
          g.rosterDirty = false;
          roster = JSON.stringify(g.roster());
        }
        for (const c of room.clients) {
          if (c.ws.readyState !== 1) continue;
          if (roster) c.ws.send(roster);
          c.ws.send(snap);
        }
      }
    }
  }
}
setInterval(loop, 4);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  RUMBLE RASCALS server running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log(`  Network: http://${ni.address}:${PORT}`);
    }
  }
  console.log(`\n  Plug in Xbox controllers and press A to join (up to ${MAX_PLAYERS} rascals).\n`);
});
