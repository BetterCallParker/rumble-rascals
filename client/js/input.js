// Keyboard + Xbox (standard-mapping) gamepad input. Each physical device is a "slot".
import { BTN, quantizeAxis } from '/shared/constants.js';

const DEADZONE = 0.18;
const TRIGGER = 0.3;

// Standard gamepad mapping (Xbox layout)
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const KEY_BINDS = {
  Space: BTN.JUMP,
  KeyJ: BTN.ATTACK,
  KeyK: BTN.KICK,
  KeyQ: BTN.GRAB_L,
  KeyE: BTN.GRAB_R,
  KeyL: BTN.BLOCK,
  KeyI: BTN.BLOCK,
  ShiftLeft: BTN.DODGE,
  ShiftRight: BTN.DODGE,
  KeyT: BTN.TAUNT,
  Enter: BTN.START,
};
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = 0;
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      this.emitActivity();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = 0; });
    const canvas = document.getElementById('game');
    canvas.addEventListener('mousedown', (e) => {
      this.mouse |= e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
      this.emitActivity();
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(e.button === 0 ? 1 : e.button === 2 ? 2 : 0); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.prevPadButtons = new Map(); // pad index -> previous raw button bitmask
    this.padPressed = new Map(); // pad index -> pressed this frame (raw bits)
  }

  onActivity(fn) { this.listeners.push(fn); }
  emitActivity() { for (const fn of this.listeners) fn(); }

  // Call once per animation frame before reading
  poll() {
    this.padPressed.clear();
    for (const gp of this.pads()) {
      let raw = 0;
      gp.buttons.forEach((b, i) => {
        if (b && (b.pressed || b.value > TRIGGER)) raw |= 1 << i;
      });
      const prev = this.prevPadButtons.get(gp.index) || 0;
      const pressed = raw & ~prev;
      this.padPressed.set(gp.index, pressed);
      this.prevPadButtons.set(gp.index, raw);
      if (pressed) this.emitActivity();
    }
  }

  endFrame() {
    this.pressedKeys.clear();
  }

  pads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = [];
    for (const gp of list) if (gp && gp.connected) out.push(gp);
    return out;
  }

  padJustPressed(index, button) {
    return ((this.padPressed.get(index) || 0) & (1 << button)) !== 0;
  }

  keyJustPressed(code) {
    return this.pressedKeys.has(code);
  }

  // Read a slot ('kb' or 'gp:N') -> { mx, mz, b }
  read(slot) {
    if (slot === 'kb') return this.readKeyboard();
    const idx = Number(slot.slice(3));
    const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[idx];
    if (!gp) return { mx: 0, mz: 0, b: 0 };
    return this.readPad(gp);
  }

  readPad(gp) {
    let mx = gp.axes[0] || 0;
    let mz = gp.axes[1] || 0;
    const l = Math.hypot(mx, mz);
    if (l < DEADZONE) {
      mx = 0;
      mz = 0;
    } else {
      // radial deadzone with rescale for smooth analog control
      const s = Math.min(1, (l - DEADZONE) / (1 - DEADZONE)) / l;
      mx *= s;
      mz *= s;
    }
    const btn = (i) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > TRIGGER);
    if (btn(PAD.UP)) mz = -1;
    if (btn(PAD.DOWN)) mz = 1;
    if (btn(PAD.LEFT)) mx = -1;
    if (btn(PAD.RIGHT)) mx = 1;
    let b = 0;
    if (btn(PAD.A)) b |= BTN.JUMP;
    if (btn(PAD.X)) b |= BTN.ATTACK;
    if (btn(PAD.Y)) b |= BTN.KICK;
    if (btn(PAD.B)) b |= BTN.DODGE;
    if (btn(PAD.RB)) b |= BTN.BLOCK;
    if (btn(PAD.LB)) b |= BTN.TAUNT;
    if (btn(PAD.LT)) b |= BTN.GRAB_L;
    if (btn(PAD.RT)) b |= BTN.GRAB_R;
    if (btn(PAD.MENU)) b |= BTN.START;
    return { mx: quantizeAxis(mx), mz: quantizeAxis(mz), b };
  }

  readKeyboard() {
    const k = (c) => this.keys.has(c);
    let mx = 0, mz = 0;
    if (k('KeyA') || k('ArrowLeft')) mx -= 1;
    if (k('KeyD') || k('ArrowRight')) mx += 1;
    if (k('KeyW') || k('ArrowUp')) mz -= 1;
    if (k('KeyS') || k('ArrowDown')) mz += 1;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let b = 0;
    for (const code in KEY_BINDS) if (this.keys.has(code)) b |= KEY_BINDS[code];
    if (this.mouse & 1) b |= BTN.GRAB_L;
    if (this.mouse & 2) b |= BTN.GRAB_R;
    return { mx: quantizeAxis(mx), mz: quantizeAxis(mz), b };
  }

  rumble(slot, strong, weak, ms) {
    if (!slot || slot === 'kb') return;
    const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[Number(slot.slice(3))];
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', {
      startDelay: 0,
      duration: ms,
      strongMagnitude: Math.min(1, strong),
      weakMagnitude: Math.min(1, weak),
    }).catch(() => {});
  }
}

export { PAD };
