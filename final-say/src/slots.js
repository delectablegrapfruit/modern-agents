// The dialogue options at the bottom of the screen: three rotating lines that expire and are replaced, plus one
// fixed line (such as "Just start") that stays up. Any of them can be said at any time.

export class Slots {
  constructor(world) {
    this.w = world;
    this.active = false;
    this.slots = [null, null, null];
    this.refill = [0, 0, 0];
    this.fixed = null;
    this.recent = [];
    this.dirty = true;
  }

  // provider() → candidate options [{ id, text, tone, weight }]; fixed() → one option or null; onChoose(option).
  open(provider, fixed, onChoose) {
    this.provider = provider;
    this.fixedProvider = fixed;
    this.onChoose = onChoose;
    this.active = true;
    this.slots = [null, null, null];
    this.refill = [0.2, 0.55, 0.9];
    this.recent = [];
    this.fixed = null;
    this.dirty = true;
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.slots = [null, null, null];
    this.fixed = null;
    this.w.hud.renderOptions([null, null, null, null]);
  }

  life(o) {
    const mode = this.w.settings.optionTimer || 'normal';
    const base = 6.5 + Math.min(4, o.text.length * 0.05);
    return mode === 'relaxed' ? base * 1.7 : base;
  }

  pick() {
    const shown = new Set(this.slots.filter(Boolean).map((o) => o.id));
    const candidates = this.provider().filter((o) => !shown.has(o.id));
    if (!candidates.length) return null;
    const recent = new Set(this.recent.slice(-4));
    let total = 0;
    const weights = candidates.map((o) => {
      const wgt = Math.max(0.01, (o.weight ?? 1) * (recent.has(o.id) ? 0.25 : 1));
      total += wgt;
      return wgt;
    });
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  update(dt) {
    if (!this.active) return;
    const noTimer = this.w.settings.optionTimer === 'off';
    for (let i = 0; i < 3; i++) {
      const o = this.slots[i];
      if (o) {
        if (!noTimer) o.left -= dt;
        if (o.left <= 0) {
          this.recent.push(o.id);
          this.slots[i] = null;
          this.refill[i] = 0.35;
          this.dirty = true;
        }
      } else {
        this.refill[i] -= dt;
        if (this.refill[i] <= 0) {
          const n = this.pick();
          if (n) {
            n.life = this.life(n);
            n.left = n.life;
            n.fresh = true;
            this.slots[i] = n;
            this.dirty = true;
          } else this.refill[i] = 0.5;
        }
      }
    }
    const f = this.fixedProvider ? this.fixedProvider() : null;
    if ((f && f.id) !== (this.fixed && this.fixed.id)) {
      this.fixed = f;
      this.dirty = true;
    }
    if (this.dirty) {
      this.w.hud.renderOptions([...this.slots, this.fixed]);
      for (const o of this.slots) if (o) o.fresh = false;
      this.dirty = false;
    }
    this.w.hud.optionTimers(this.slots.map((o) => (o ? (noTimer ? 1 : Math.max(0, o.left / o.life)) : 0)));
  }

  // i: 0–2 for the rotating lines, 3 for the fixed one.
  choose(i) {
    if (!this.active) return;
    const o = i === 3 ? this.fixed : this.slots[i];
    if (!o) return;
    if (i < 3) {
      this.slots[i] = null;
      this.refill[i] = 0.7;
    }
    this.recent.push(o.id);
    this.dirty = true;
    this.w.audio.sfx('click');
    this.w.hud.flashOption(i);
    this.onChoose(o);
  }
}
