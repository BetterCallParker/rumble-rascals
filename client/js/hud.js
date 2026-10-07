// DOM-based comic HUD: player cards, POW! bursts, announcer, name tags, lobby & help panels.
import * as THREE from 'three';
import { COLORS, ST, PHASE, ROUND_WINS_TO_MATCH, MAX_PLAYERS } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const _v = new THREE.Vector3();

const BURST_COLORS = [
  ['#ffd21f', '#ef2f2a'],
  ['#ffffff', '#ef2f2a'],
  ['#2fd4ff', '#ffd21f'],
  ['#ff6fb5', '#ffffff'],
  ['#ffd21f', '#2f6cf0'],
  ['#ef2f2a', '#ffd21f'],
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function burstPoints(n = 14) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 ? 58 : 100) * (0.85 + Math.random() * 0.3);
    const a = (i / (n * 2)) * Math.PI * 2;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.75).toFixed(1)}`);
  }
  return pts.join(' ');
}

export class Hud {
  constructor() {
    this.fx = $('fx');
    this.labels = $('labels');
    this.cards = $('cards');
    this.announceEl = $('announce');
    this.phaseEl = $('phase');
    this.lobbyEl = $('lobby');
    this.joinbar = $('joinbar');
    this.netEl = $('net');
    this.roomEl = $('roomtag');
    this.helpEl = $('help');
    this.flashEl = $('flash');
    this.words = [];
    this.cardEls = new Map();
    this.tagEls = new Map();
    this.lastDamage = new Map();
    this.flashV = 0;
    this.buildHelp();
  }

  show() {
    $('hud').classList.remove('hidden');
  }

  setRoom(code) {
    this.roomEl.replaceChildren(el('span', '', 'ROOM '), el('b', '', code));
    this.roomEl.title = 'Share this link so friends can join';
  }

  // ---------------------------------------------------------------- POW! words
  word(text, world, opts = {}) {
    if (!text) return;
    const size = opts.size || 46;
    const [fill, bg] = opts.colors || BURST_COLORS[(Math.random() * BURST_COLORS.length) | 0];
    const w = el('div', 'pow' + (opts.plain ? ' plain' : ''));
    const inner = el('div', 'inner');
    inner.style.setProperty('--s', size + 'px');
    inner.style.setProperty('--r', (opts.rot ?? (Math.random() * 30 - 15)) + 'deg');
    inner.style.setProperty('--c', fill);
    inner.style.setProperty('--dur', (opts.dur || 0.9) + 's');
    if (!opts.plain) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '-110 -85 220 170');
      svg.setAttribute('preserveAspectRatio', 'none');
      const shadow = document.createElementNS(svgNS, 'polygon');
      const pts = burstPoints(opts.spikes || 12);
      shadow.setAttribute('points', pts);
      shadow.setAttribute('fill', '#15101e');
      shadow.setAttribute('transform', 'translate(8 8)');
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', bg);
      poly.setAttribute('stroke', '#15101e');
      poly.setAttribute('stroke-width', '7');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.append(shadow, poly);
      inner.appendChild(svg);
    }
    inner.appendChild(el('span', '', text));
    w.appendChild(inner);
    this.fx.appendChild(w);
    const item = {
      el: w,
      world: world ? world.clone() : null,
      sx: opts.sx, sy: opts.sy,
      ox: (Math.random() - 0.5) * 40 + (opts.ox || 0),
      oy: -30 - Math.random() * 30 + (opts.oy || 0),
      t: 0,
      max: (opts.dur || 0.9) + 0.05,
    };
    this.words.push(item);
    if (this.words.length > 26) this.removeWord(0);
  }

  removeWord(i) {
    const w = this.words[i];
    w.el.remove();
    this.words.splice(i, 1);
  }

  // ---------------------------------------------------------------- announcer
  announce(text, sub, style) {
    this.announceEl.querySelectorAll('.ann').forEach((n) => {
      n.classList.add('out');
      setTimeout(() => n.remove(), 400);
    });
    const a = el('div', 'ann ' + (style || 'big'), text);
    if (sub) a.appendChild(el('span', 'sub', sub));
    this.announceEl.appendChild(a);
    const life = style === 'count' ? 800 : style === 'small' ? 2600 : style === 'champ' ? 5200 : 2000;
    setTimeout(() => {
      a.classList.add('out');
      setTimeout(() => a.remove(), 400);
    }, life);
  }

  flash(v) {
    this.flashV = Math.max(this.flashV, v);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt, camera, width, height, ctx) {
    // words
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      if (w.t > w.max) {
        this.removeWord(i);
        continue;
      }
      let x = w.sx, y = w.sy;
      if (w.world) {
        _v.copy(w.world).project(camera);
        x = (_v.x * 0.5 + 0.5) * width;
        y = (-_v.y * 0.5 + 0.5) * height;
      }
      x = Math.min(width - 60, Math.max(60, x + w.ox));
      y = Math.min(height - 60, Math.max(60, y + w.oy));
      w.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    // white flash
    if (this.flashV > 0) {
      this.flashV = Math.max(0, this.flashV - dt * 6);
      this.flashEl.style.opacity = this.flashV.toFixed(3);
    }
    this.updateTags(camera, width, height, ctx);
  }

  updateTags(camera, width, height, ctx) {
    const seen = new Set();
    for (const [id, view] of ctx.views) {
      const s = ctx.states.get(id);
      const r = ctx.roster.get(id);
      if (!s || !r || s.s === ST.DEAD) continue;
      seen.add(id);
      let tag = this.tagEls.get(id);
      if (!tag) {
        tag = el('div', 'nametag');
        tag._name = el('span', 'nm');
        tag._pn = el('span', 'pn');
        tag._zz = el('span', 'zz', 'Zzz');
        tag._bar = el('span', 'kobar');
        tag._barFill = el('i');
        tag._bar.appendChild(tag._barFill);
        tag._arrow = el('span', 'arrow');
        tag.append(tag._zz, tag._bar, tag._pn, tag._name, tag._arrow);
        this.labels.appendChild(tag);
        this.tagEls.set(id, tag);
      }
      const local = ctx.localSlots.get(id);
      const pc = r.dummy ? '#9c7442' : hex(COLORS[r.color % COLORS.length].body);
      tag.style.setProperty('--pc', pc);
      const nameText = r.dummy ? 'TEST DUMMY' : r.name;
      if (tag._name.textContent !== nameText) tag._name.textContent = nameText;
      tag._name.className = r.dummy ? 'nm dum' : 'nm';
      const pnText = local ? local.label : '';
      if (tag._pn.textContent !== pnText) tag._pn.textContent = pnText;
      tag._pn.style.display = local ? '' : 'none';
      tag._arrow.style.display = local ? '' : 'none';
      const ko = s.ko > 0;
      tag._zz.style.display = ko ? '' : 'none';
      tag._bar.style.display = ko ? '' : 'none';
      if (ko) tag._barFill.style.width = Math.max(0, Math.min(100, (s.ko / 360) * 100)).toFixed(0) + '%';
      view.headWorld(_v);
      _v.y += 0.85;
      _v.project(camera);
      const x = (_v.x * 0.5 + 0.5) * width, y = (-_v.y * 0.5 + 0.5) * height;
      tag.style.display = _v.z < 1 ? '' : 'none';
      tag.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    for (const [id, tag] of this.tagEls) {
      if (!seen.has(id)) {
        tag.style.display = 'none';
        if (!ctx.roster.has(id)) {
          tag.remove();
          this.tagEls.delete(id);
        }
      }
    }
  }

  // ---------------------------------------------------------------- player cards
  updateCards(roster, states, localSlots, phase) {
    const humans = [...roster.values()].filter((r) => !r.dummy);
    const seen = new Set();
    humans.forEach((r, i) => {
      seen.add(r.id);
      let c = this.cardEls.get(r.id);
      if (!c) {
        c = el('div', 'card');
        c._face = el('div', 'face');
        c._name = el('div', 'name');
        c._dmg = el('div', 'dmg');
        c._daze = el('div', 'daze');
        c._dazeFill = el('i');
        c._daze.appendChild(c._dazeFill);
        c._meta = el('div', 'meta');
        c._stars = el('span', 'stars');
        c._kos = el('span', 'kos');
        c._meta.append(c._stars, c._kos);
        c._ready = el('div', 'ready', 'READY!');
        c._zz = el('div', 'kozz', 'K.O. Zzz');
        c.append(c._face, c._name, c._dmg, c._daze, c._meta, c._ready, c._zz);
        c.style.setProperty('--rot', (i % 2 ? 1.5 : -1.5) + 'deg');
        this.cards.appendChild(c);
        this.cardEls.set(r.id, c);
      }
      const col = COLORS[r.color % COLORS.length];
      c.style.setProperty('--pc', hex(col.body));
      const local = localSlots.get(r.id);
      c.classList.toggle('local', !!local);
      const nameKey = (local ? local.label + '|' : '') + r.name;
      if (c._nameKey !== nameKey) {
        c._nameKey = nameKey;
        c._name.replaceChildren();
        if (local) c._name.appendChild(el('span', 'tag', local.label));
        c._name.appendChild(document.createTextNode(r.name));
      }
      const s = states.get(r.id);
      const dmg = s ? s.d : 0;
      const dead = !s || s.s === ST.DEAD;
      c.classList.toggle('dead', dead && phase !== PHASE.LOBBY);
      c.classList.toggle('ko', !!(s && s.ko > 0));
      const dtxt = String(dmg);
      if (c._dmgKey !== dtxt) {
        c._dmgKey = dtxt;
        c._dmg.replaceChildren(document.createTextNode(dtxt), el('small', '', '%'));
        const prev = this.lastDamage.get(r.id) || 0;
        if (dmg > prev) {
          c._dmg.classList.remove('hit');
          void c._dmg.offsetWidth;
          c._dmg.classList.add('hit');
        }
        this.lastDamage.set(r.id, dmg);
        const heat = Math.min(1, dmg / 150);
        const cc = heat < 0.33 ? '#ffffff' : heat < 0.66 ? '#ffd21f' : heat < 0.9 ? '#ff8a00' : '#ef2f2a';
        c._dmg.style.setProperty('--dc', cc);
      }
      const dz = s ? s.dz : 0;
      c._dazeFill.style.width = (s && s.ko > 0 ? 100 : dz) + '%';
      c._daze.classList.toggle('full', dz > 80 || (s && s.ko > 0));
      const stars = '★'.repeat(Math.min(r.wins, ROUND_WINS_TO_MATCH)) + '☆'.repeat(Math.max(0, ROUND_WINS_TO_MATCH - r.wins));
      if (c._stars.textContent !== stars) c._stars.textContent = stars;
      const kos = `KOs ${r.kos}`;
      if (c._kos.textContent !== kos) c._kos.textContent = kos;
      c._ready.style.display = phase === PHASE.LOBBY && r.ready ? '' : 'none';
      c._zz.style.display = s && s.ko > 0 ? '' : 'none';
    });
    for (const [id, c] of this.cardEls) {
      if (!seen.has(id)) {
        c.remove();
        this.cardEls.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- top bar / lobby / join prompts
  updatePhase(snap, roster) {
    if (!snap) return;
    const humans = [...roster.values()].filter((r) => !r.dummy);
    let main = '', sub = '';
    this.phaseEl.classList.toggle('sudden', !!snap.sd && snap.ph === PHASE.FIGHT);
    switch (snap.ph) {
      case PHASE.LOBBY: {
        const ready = humans.filter((r) => r.ready).length;
        main = 'PRACTICE BRAWL';
        sub = humans.length < 2 ? 'Waiting for rascals - pound the test dummy!' : `${ready}/${humans.length} ready - press START / ENTER`;
        break;
      }
      case PHASE.COUNTDOWN:
        main = `ROUND ${snap.rd}`;
        sub = 'Get ready...';
        break;
      case PHASE.FIGHT: {
        const secs = Math.floor(snap.pt / 60);
        const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
        main = snap.sd ? 'SUDDEN DEATH!' : `ROUND ${snap.rd}`;
        sub = `${mm}:${ss}  -  last rascal standing wins`;
        break;
      }
      case PHASE.ROUND_END:
        main = 'ROUND OVER!';
        sub = `First to ${ROUND_WINS_TO_MATCH} wins the match`;
        break;
      case PHASE.MATCH_END:
        main = 'MATCH OVER!';
        sub = 'Back to the lobby soon';
        break;
    }
    const key = main + '|' + sub;
    if (this._phaseKey !== key) {
      this._phaseKey = key;
      this.phaseEl.replaceChildren(document.createTextNode(main), el('span', 'sub', sub));
    }
    // lobby roster panel
    const inLobby = snap.ph === PHASE.LOBBY;
    this.lobbyEl.classList.toggle('hidden', !inLobby);
    if (inLobby) {
      const lk = humans.map((r) => r.id + r.name + r.ready).join(',');
      if (this._lobbyKey !== lk) {
        this._lobbyKey = lk;
        const kids = [el('h2', '', 'THE LOBBY')];
        for (const r of humans) {
          const row = el('div', 'row');
          const left = el('span');
          const dot = el('span', 'dot');
          dot.style.background = hex(COLORS[r.color % COLORS.length].body);
          left.append(dot, document.createTextNode(r.name));
          row.append(left, el('span', r.ready ? 'ok' : 'wait', r.ready ? 'READY!' : 'not ready'));
          kids.push(row);
        }
        kids.push(el('p', '', `${humans.length}/${MAX_PLAYERS} rascals. Need 2+ to start a match. Everyone presses START (Menu) / ENTER to ready up. Press H or VIEW for controls.`));
        this.lobbyEl.replaceChildren(...kids);
      }
    }
  }

  updateJoin(prompts) {
    const key = prompts.join('|');
    if (this._joinKey === key) return;
    this._joinKey = key;
    this.joinbar.replaceChildren(
      ...prompts.map((p) => {
        const d = el('div', 'joinprompt');
        const [a, b, c] = p.split('*');
        d.append(document.createTextNode(a), el('b', '', b || ''), document.createTextNode(c || ''));
        return d;
      }),
    );
  }

  updateNet(rtt, connected) {
    const txt = connected ? `PING ${Math.round(rtt)}ms` : 'OFFLINE!';
    if (this._netKey !== txt) {
      this._netKey = txt;
      this.netEl.textContent = txt;
    }
  }

  toggleHelp(force) {
    const hide = force === undefined ? !this.helpEl.classList.contains('hidden') : !force;
    this.helpEl.classList.toggle('hidden', hide);
  }

  buildHelp() {
    const rows = (list) => {
      const t = el('table');
      for (const [k, v] of list) {
        const tr = el('tr');
        tr.append(el('td', '', k), el('td', '', v));
        t.appendChild(tr);
      }
      return t;
    };
    const pad = [
      ['Left Stick', 'Move'],
      ['A', 'Jump'],
      ['X', 'Punch / swing weapon (hold = charge!)'],
      ['Y', 'Kick (in the air = DROPKICK)'],
      ['LT', 'Left hand grab (hold)'],
      ['RT', 'Right hand grab (hold)'],
      ['LT + RT', 'Lift a rascal over your head'],
      ['X while holding', 'Pummel / throw / fling'],
      ['B', 'Dodge roll'],
      ['RB', 'Block (tap right before a hit = PARRY)'],
      ['LB', 'Taunt'],
      ['Menu', 'Ready up'],
      ['View', 'Show this help'],
    ];
    const kb = [
      ['WASD / Arrows', 'Move'],
      ['Space', 'Jump'],
      ['J', 'Punch / swing (hold = charge)'],
      ['K', 'Kick / dropkick'],
      ['Q / Left Mouse', 'Left hand grab'],
      ['E / Right Mouse', 'Right hand grab'],
      ['L', 'Block / parry'],
      ['Shift', 'Dodge roll'],
      ['T', 'Taunt'],
      ['Enter', 'Join / ready up'],
      ['H', 'Show this help'],
    ];
    const c1 = el('div');
    c1.append(el('h3', '', 'XBOX CONTROLLER'), rows(pad));
    const c2 = el('div');
    c2.append(el('h3', '', 'KEYBOARD'), rows(kb));
    const cols = el('div', 'cols');
    cols.append(c1, c2);
    const tip = el('div', 'tip', 'HOW TO WIN: Punch rascals until they get DIZZY and KNOCKED OUT (watch the daze bar). Grab a knocked-out rascal with one trigger to DRAG them, squeeze both triggers to LIFT them overhead, then press X to chuck them off the roof! Smash barrels for big booms and dodge the wrecking ball.');
    this.helpEl.replaceChildren(el('h2', '', 'HOW TO RUMBLE'), cols, tip);
  }
}
