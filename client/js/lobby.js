// Lobby screen: character select, cosmetics, ready-up and the host's match settings.
import * as THREE from 'three';
import { COLORS, MAX_PLAYERS } from '/shared/constants.js';
import { CHARACTERS } from '/shared/characters.js';
import { HATS, FACES } from '/shared/cosmetics.js';
import { SETTINGS, settingLabel, settingCount } from '/shared/settings.js';
import { LEVELS } from '/shared/levels.js';
import { Rascal } from './character.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Render a 3D portrait of every character (and color) once, with the real models.
export function renderPortraits(renderer) {
  const size = 192;
  const rt = new THREE.WebGLRenderTarget(size, size);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6f9a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0.9, 1.75, 4.2);
  cam.lookAt(0, 1.15, 0);
  const buf = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const out = {};
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (let c = 0; c < CHARACTERS.length; c++) {
    for (let col = 0; col < COLORS.length; col++) {
      const r = new Rascal(col, false, c);
      r.root.rotation.y = -0.35;
      r.armL.set(-0.34, 0.42, 0.84, 1.05);
      r.armR.set(0.6, 0.8, 0.4, 1.1);
      for (const l of r.limbs) { l.dir.copy(l.target); l.stretch = l.targetStretch; l.update(0); }
      r.setExpression('open', 'grin', 'angry');
      scene.add(r.root);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      scene.remove(r.root);
      r.dispose();
      const img = g.createImageData(size, size);
      // flip vertically + linear->sRGB-ish
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
          img.data[di] = Math.min(255, Math.pow(buf[si] / 255, 1 / 2.2) * 255);
          img.data[di + 1] = Math.min(255, Math.pow(buf[si + 1] / 255, 1 / 2.2) * 255);
          img.data[di + 2] = Math.min(255, Math.pow(buf[si + 2] / 255, 1 / 2.2) * 255);
          img.data[di + 3] = buf[si + 3];
        }
      }
      g.putImageData(img, 0, 0);
      out[c + ':' + col] = canvas.toDataURL();
    }
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return out;
}

export class Lobby {
  constructor(handlers) {
    this.h = handlers; // { send(msg), sfx(name) }
    this.root = $('lobbyScreen');
    this.portraits = {};
    this.local = new Map(); // playerId -> { cursor, mode, setRow }
    this.key = '';
    this.visible = false;
    this.root.addEventListener('click', (e) => this.onClick(e, 1));
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onClick(e, -1);
    });
  }

  setPortraits(p) {
    this.portraits = p;
    this.key = '';
  }

  state(id) {
    if (!this.local.has(id)) this.local.set(id, { cursor: -1, mode: 'pick', setRow: 0 });
    return this.local.get(id);
  }

  // Any local player still on the select screen?
  wantsOverlay(localIds) {
    for (const id of localIds) if (this.state(id).mode !== 'practice') return true;
    return localIds.length === 0;
  }

  isPracticing(id) {
    return this.state(id).mode === 'practice';
  }

  // m: Input.menu(slot) edges
  handle(id, m, ctx) {
    const st = this.state(id);
    const r = ctx.roster.get(id);
    if (!r) return;
    if (st.cursor < 0) st.cursor = r.char || 0;
    const isHost = ctx.isHost;
    if (st.mode === 'practice') {
      if (m.view || m.start) {
        st.mode = 'pick';
        this.h.sfx('select');
      }
      return;
    }
    if (st.mode === 'settings') {
      if (m.up) st.setRow = (st.setRow + SETTINGS.length - 1) % SETTINGS.length;
      if (m.down) st.setRow = (st.setRow + 1) % SETTINGS.length;
      if (m.left || m.right || m.confirm) {
        const d = SETTINGS[st.setRow];
        const n = settingCount(d.key);
        const cur = ctx.settings[d.key] ?? d.def;
        const v = (cur + (m.left ? -1 : 1) + n) % n;
        this.h.send({ t: 'set', key: d.key, val: v });
        this.h.sfx('select');
      }
      if (m.back || m.view) st.mode = 'pick';
      if (m.up || m.down) this.h.sfx('select');
      return;
    }
    // character picking
    const cols = 4;
    let c = st.cursor;
    if (!r.ready) {
      if (m.left) c = (c + CHARACTERS.length - 1) % CHARACTERS.length;
      if (m.right) c = (c + 1) % CHARACTERS.length;
      if (m.up || m.down) c = (c + cols) % CHARACTERS.length;
      if (c !== st.cursor) {
        st.cursor = c;
        this.h.send({ t: 'char', id, c });
        this.h.sfx('select');
      }
    }
    if (m.confirm || m.start) {
      this.h.send({ t: 'ready', id });
      this.h.sfx('ready');
    }
    if (m.hatPrev) this.cycleHat(id, r, -1);
    if (m.hatNext) this.cycleHat(id, r, 1);
    if (m.face) this.h.send({ t: 'cos', id, hat: r.hat, face: (r.face + 1) % FACES.length });
    if (m.color) this.h.send({ t: 'color', id });
    if (m.practice) {
      st.mode = 'practice';
      this.h.sfx('select');
    }
    if (m.back && r.ready) this.h.send({ t: 'ready', id });
    if (m.view && isHost) {
      st.mode = 'settings';
      this.h.sfx('select');
    }
  }

  cycleHat(id, r, dir) {
    this.h.send({ t: 'cos', id, hat: (r.hat + dir + HATS.length) % HATS.length, face: r.face });
  }

  onClick(e, dir) {
    const t = e.target.closest('[data-act]');
    if (!t || !this.ctx) return;
    const act = t.dataset.act;
    const myId = this.ctx.primaryId;
    if (act === 'set' && this.ctx.isHost) {
      const d = SETTINGS.find((x) => x.key === t.dataset.key);
      const n = settingCount(d.key);
      const cur = this.ctx.settings[d.key] ?? d.def;
      this.h.send({ t: 'set', key: d.key, val: (cur + dir + n) % n });
      this.h.sfx('select');
    } else if (act === 'char' && myId) {
      const c = Number(t.dataset.c);
      this.state(myId).cursor = c;
      this.h.send({ t: 'char', id: myId, c });
      this.h.sfx('select');
    } else if (act === 'ready' && myId) {
      this.h.send({ t: 'ready', id: myId });
      this.h.sfx('ready');
    } else if (act === 'practice' && myId) {
      this.state(myId).mode = 'practice';
    } else if (act === 'hat' && myId) {
      const r = this.ctx.roster.get(myId);
      if (r) this.cycleHat(myId, r, dir);
    } else if (act === 'face' && myId) {
      const r = this.ctx.roster.get(myId);
      if (r) this.h.send({ t: 'cos', id: myId, hat: r.hat, face: (r.face + dir + FACES.length) % FACES.length });
    } else if (act === 'color' && myId) {
      this.h.send({ t: 'color', id: myId });
    }
  }

  show(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
  }

  // ctx: { roster, settings, isHost, hostName, localSlots, primaryId, level, room }
  render(ctx) {
    this.ctx = ctx;
    const humans = [...ctx.roster.values()].filter((r) => !r.dummy);
    const cursors = [...ctx.localSlots.entries()].map(([id, L]) => [id, L.label, this.state(id).cursor, this.state(id).mode, this.state(id).setRow]);
    const key = JSON.stringify([humans, ctx.settings, ctx.isHost, cursors, ctx.level, Object.keys(this.portraits).length, ctx.hostName]);
    if (key === this.key) return;
    this.key = key;

    const top = el('div', 'lb-top');
    const title = el('h1', 'lb-title', 'THE LOBBY');
    const lv = LEVELS[ctx.level] || LEVELS[0];
    const stage = el('div', 'lb-stage');
    stage.append(el('b', '', lv.name), el('span', '', lv.tagline));
    const room = el('div', 'lb-room');
    room.append(document.createTextNode('ROOM '), el('b', '', ctx.room));
    top.append(title, stage, room);

    // character grid
    const grid = el('div', 'lb-grid');
    CHARACTERS.forEach((ch, i) => {
      const card = el('div', 'lb-char');
      card.dataset.act = 'char';
      card.dataset.c = i;
      const img = el('img');
      img.src = this.portraits[i + ':' + (i % COLORS.length)] || '';
      img.alt = ch.name;
      card.appendChild(img);
      card.appendChild(el('div', 'lb-cname', ch.name));
      card.appendChild(el('div', 'lb-cdesc', ch.desc));
      const stats = el('div', 'lb-stats');
      for (const [lab, v] of [['SPD', ch.speed], ['POW', ch.power], ['WGT', ch.weight], ['GRIT', ch.grit]]) {
        const row = el('div', 'lb-stat');
        const bar = el('i');
        bar.style.width = Math.round(((v - 0.75) / 0.6) * 100) + '%';
        const b = el('span', 'lb-bar');
        b.appendChild(bar);
        row.append(el('span', 'lb-slab', lab), b);
        stats.appendChild(row);
      }
      card.appendChild(stats);
      // cursors of local players hovering this card
      const tags = el('div', 'lb-cursors');
      for (const [id, label, cur, mode] of cursors) {
        if (cur !== i || mode === 'practice') continue;
        const r = ctx.roster.get(id);
        const t = el('span', 'lb-cursor', label);
        if (r) t.style.background = hex(COLORS[r.color % COLORS.length].body);
        tags.appendChild(t);
        card.classList.add('hover');
      }
      card.appendChild(tags);
      grid.appendChild(card);
    });

    // player slots
    const slots = el('div', 'lb-slots');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const r = humans[i];
      const slot = el('div', 'lb-slot' + (r ? '' : ' empty') + (r && r.ready ? ' ready' : ''));
      if (r) {
        const col = COLORS[r.color % COLORS.length];
        slot.style.setProperty('--pc', hex(col.body));
        const img = el('img');
        img.src = this.portraits[(r.char || 0) + ':' + (r.color % COLORS.length)] || '';
        slot.appendChild(img);
        const L = ctx.localSlots.get(r.id);
        const nm = el('div', 'lb-pname');
        if (L) nm.appendChild(el('span', 'lb-ptag', L.label));
        nm.appendChild(document.createTextNode(r.name));
        slot.appendChild(nm);
        slot.appendChild(el('div', 'lb-pchar', CHARACTERS[r.char || 0].name));
        const cos = el('div', 'lb-pcos');
        const hatB = el('span', 'lb-chip', HATS[r.hat || 0]);
        const faceB = el('span', 'lb-chip', FACES[r.face || 0]);
        if (L) {
          hatB.dataset.act = 'hat';
          faceB.dataset.act = 'face';
          const colB = el('span', 'lb-chip lb-colchip', 'COLOR');
          colB.dataset.act = 'color';
          cos.append(hatB, faceB, colB);
        } else cos.append(hatB, faceB);
        slot.appendChild(cos);
        const st = L ? this.state(r.id) : null;
        const badge = el('div', 'lb-badge', r.ready ? 'READY!' : st && st.mode === 'practice' ? 'PRACTICING' : 'PICKING...');
        if (L && !r.ready) badge.dataset.act = 'ready';
        slot.appendChild(badge);
        if (r.client === ctx.hostClient) slot.appendChild(el('div', 'lb-host', 'HOST'));
      } else {
        slot.appendChild(el('div', 'lb-join', 'PRESS A / ENTER TO JOIN'));
      }
      slots.appendChild(slot);
    }

    // settings panel
    const panel = el('div', 'lb-settings');
    panel.appendChild(el('h2', '', 'MATCH SETTINGS'));
    panel.appendChild(el('div', 'lb-hostline', ctx.isHost ? 'You are the host - click or press VIEW / N to edit' : `Host: ${ctx.hostName || '...'}`));
    const hostCursor = cursors.find((c) => c[3] === 'settings');
    SETTINGS.forEach((d, i) => {
      const row = el('div', 'lb-set' + (hostCursor && hostCursor[4] === i ? ' focus' : ''));
      row.appendChild(el('span', 'lb-setlab', d.label));
      const val = el('span', 'lb-setval', settingLabel(ctx.settings, d.key));
      if (d.bool) val.classList.add((ctx.settings[d.key] ?? d.def) ? 'on' : 'off');
      if (ctx.isHost) {
        val.dataset.act = 'set';
        val.dataset.key = d.key;
        val.classList.add('editable');
      }
      row.appendChild(val);
      panel.appendChild(row);
    });

    const readyCount = humans.filter((r) => r.ready).length;
    const status = el('div', 'lb-status',
      humans.length < 2
        ? 'Waiting for at least 2 rascals...  (press Y / P to practice on the stage)'
        : readyCount === humans.length ? 'EVERYONE READY - HERE WE GO!' : `${readyCount}/${humans.length} READY`);
    const hints = el('div', 'lb-hints');
    hints.innerHTML = '';
    for (const [k, v] of [
      ['STICK / WASD', 'pick character'], ['A / ENTER', 'ready up'], ['LB RB / Z X', 'hat'], ['L-STICK CLICK / C', 'face gear'],
      ['R-STICK CLICK / V', 'color'], ['Y / P', 'practice'], ['VIEW / N', 'host settings'],
    ]) {
      const h = el('span');
      h.append(el('b', '', k), document.createTextNode(' ' + v));
      hints.appendChild(h);
    }

    const main = el('div', 'lb-main');
    const left = el('div', 'lb-left');
    left.append(grid, slots);
    main.append(left, panel);
    this.root.replaceChildren(top, main, status, hints);
  }
}
