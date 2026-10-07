// WebSocket connection, snapshot buffer, server clock estimation and interpolation.

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.snaps = [];
    this.offset = null; // serverTime - localTime (seconds), tracks the fastest packets
    this.jitter = 0.01;
    this.delay = 0.085;
    this.rtt = 0;
    this.connected = false;
    this.cid = 0;
  }

  connect(room, name) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'hello', room, name });
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 1000);
    };
    this.ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.handle(m);
    };
    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.h.onClose && this.h.onClose();
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  handle(m) {
    switch (m.t) {
      case 'snap':
        this.onSnap(m);
        break;
      case 'pong':
        this.rtt = this.rtt ? this.rtt * 0.7 + (performance.now() - m.c) * 0.3 : performance.now() - m.c;
        break;
      case 'welcome':
        this.cid = m.cid;
        this.h.onWelcome && this.h.onWelcome(m);
        break;
      case 'roster':
        this.h.onRoster && this.h.onRoster(m);
        break;
      case 'joined':
        this.h.onJoined && this.h.onJoined(m);
        break;
      case 'full':
        this.h.onFull && this.h.onFull(m);
        break;
    }
  }

  onSnap(s) {
    const now = performance.now() / 1000;
    const sample = s.time - now;
    if (this.offset === null) this.offset = sample;
    else {
      const diff = sample - this.offset;
      // packets that arrive "early" pull the estimate up fast, late ones drift it down slowly
      this.offset += diff > 0 ? diff * 0.25 : diff * 0.01;
      this.jitter = this.jitter * 0.95 + Math.abs(diff) * 0.05;
    }
    this.delay = Math.min(0.2, Math.max(0.07, 0.05 + this.jitter * 2.5));
    s.recv = now;
    this.snaps.push(s);
    if (this.snaps.length > 90) this.snaps.shift();
    this.h.onSnapshot && this.h.onSnapshot(s);
  }

  latest() {
    return this.snaps[this.snaps.length - 1] || null;
  }

  renderTime() {
    if (this.offset === null) return 0;
    return performance.now() / 1000 + this.offset - this.delay;
  }

  // Returns [older, newer, alpha] bracketing time t
  bracket(t) {
    const s = this.snaps;
    if (!s.length) return null;
    if (t <= s[0].time) return [s[0], s[0], 0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].time <= t) {
        const a = s[i];
        const b = s[i + 1];
        if (!b) return [a, a, 0, t - a.time];
        return [a, b, (t - a.time) / Math.max(1e-6, b.time - a.time), 0];
      }
    }
    return [s[0], s[0], 0, 0];
  }
}
