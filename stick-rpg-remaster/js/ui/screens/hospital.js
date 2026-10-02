// js/ui/screens/hospital.js — owner: W2-Transit. The Stick General card (UI §5.12; GDD §4.16, §6.6)
// and the gag's big words: after the FLATLINED stamp, the defibrillator's "BZZT!" and "...JUST
// KIDDING" over the ward, then a Card (UI §2.3) at the card's place: why you were admitted, the bill,
// what was paid and any part written off (Relaxed: no charge), the HP you were patched up to and
// "Discharged at 12:00, outside your front door"; its footer button is the discharge.
//   SR.ui.hospital.card({ down, onDischarge }) → the Card element (el.leave is the discharge button)
//   SR.ui.hospital.gag() → { el, show(word) } the gag's word layer ('bzzt' | 'kidding' | null)
//   SR.ui.hospital.lines(down, state) → [{ id, key, vars }] the card's lines (also read by tests)
//   SR.ui.hospital.flatlined() → the dirge's handle ({ stop() }) or null: the FLATLINED stamp and the
//     dirge stinger, as the hospital gag and the death scene (js/scenes/{hospital,death}.js) open
// DOM is built only when these are called (the scene's ui.mount).
(function () {
  'use strict';
  var SR = window.SR;

  function D() { return SR.ui.dom; }
  function h() { return D().h.apply(null, arguments); }
  function t(k, v) { return D().t(k, v); }

  /**
   * The FLATLINED moment (UI §5.12, ART_AUDIO §13.4): any stamp still showing or queued goes, the
   * FLATLINED stamp lands at once, and the dirge (`stingers.flatlined`) plays alone: the stamp lands
   * without the level-up triad (`sting: false`; js/ui/stamp.js's table also gives this key none,
   * docs/requests/W2-Transit.md 7, W2-Music.md 1), which would celebrate the death over the dirge.
   * @returns {{stop: function()}|null} the dirge (stop it at the BZZT), or null (not registered, audio locked)
   */
  function flatlined() {
    var A = SR.audio;
    SR.ui.stamp.clear();
    SR.ui.stamp({ key: 'stamp.hospital.flatlined', kind: 'hp', sting: false });
    if (!A || typeof A.stinger !== 'function' || !SR.reg.song || !SR.reg.song['stingers.flatlined']) return null;
    try { return A.stinger('flatlined'); } catch (e) { SR.util.warnOnce('hospital.dirge', 'SR.ui.hospital: the dirge failed: ' + e.message); return null; }
  }

  /**
   * The bill card's lines from the Down (ARCHITECTURE §6.7) and the state after the hospital night.
   * @returns {{id: string, key: string, vars: object}[]}
   */
  function lines(down, s) {
    down = down || {};
    var out = [];
    var cause = down.cause && SR.text.has('card.hospital.cause.' + down.cause) ? down.cause : 'other';
    out.push({ id: 'cause', key: 'card.hospital.cause.' + cause, vars: {} });
    var bill = down.bill || 0, off = down.writtenOff || 0;
    if (bill > 0) {
      out.push({ id: 'bill', key: 'card.hospital.bill', vars: { n: bill, money: SR.text.money(bill) } });
      out.push({ id: 'paid', key: 'card.hospital.paid', vars: { n: bill - off, money: SR.text.money(bill - off) } });
      if (off > 0) out.push({ id: 'writtenOff', key: 'card.hospital.writtenOff', vars: { n: off, money: SR.text.money(off) } });
    } else {
      out.push({ id: 'free', key: 'card.hospital.free', vars: {} });
    }
    if (s) {
      out.push({ id: 'hp', key: 'card.hospital.hp', vars: { hp: s.stats.hp, max: s.stats.hpMax } });
      out.push({ id: 'discharge', key: 'card.hospital.discharge', vars: { time: SR.text.time(s.clock.min) } });
    }
    return out;
  }

  /**
   * The Stick General card.
   * @param {{down: object, onDischarge: function()}} o
   * @returns {HTMLElement} the Card; el.leave is the discharge button
   */
  function card(o) {
    o = o || {};
    var el = SR.ui.card({ id: 'hospital-card', title: 'place.hospital', brand: D().paint('int.hospital.trim'),
      greeting: 'card.hospital.gag', greetingVars: { variant: SR.state ? SR.state.clock.day : 0 },
      onLeave: function () { if (o.onDischarge) o.onDischarge(); } });
    var list = h('ul', { 'data-id': 'hospital-lines', style: { listStyle: 'none', margin: '0', padding: 'var(--sp-3) var(--sp-4)',
      display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } });
    lines(o.down, SR.state).forEach(function (l) {
      var money = l.id === 'bill' || l.id === 'paid' || l.id === 'writtenOff';
      list.appendChild(h('li', { 'data-id': 'hospital-' + l.id, class: money ? 't-label' : 't-body',
        style: l.id === 'writtenOff' ? { color: 'var(--money-ink)' } : null }, t(l.key, l.vars)));
    });
    el.body.appendChild(list);
    el.leave.update({ label: 'act.hospital.discharge', variant: 'primary', size: null, icon: 'home', hint: 'confirm' });
    var s = SR.state;
    el.setReadout(s ? t('ui.cardReadout', { money: SR.text.money(s.money.cash), time: SR.text.time(s.clock.min) }) : '');
    return el;
  }

  /**
   * The gag's word layer: one big display word centred over the ward (x 0-760), announced to #aria.
   * @returns {{el: HTMLElement, show: function((string|null))}}
   */
  function gag() {
    var word = h('div', { 'data-id': 'hospital-word', 'aria-hidden': 'true', class: 't-display',
      style: { color: 'var(--paper-0)', textShadow: '0 4px 0 var(--ink-900)', transform: 'rotate(-6deg)', textAlign: 'center' } });
    var el = h('div', { 'data-id': 'hospital-gag', style: { position: 'absolute', left: '0', top: '440px', width: '760px',
      display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 'var(--z-card)' } }, word);
    var cur = null;
    return {
      el: el,
      show: function (w) {
        if (w === cur) return;
        cur = w;
        word.textContent = w ? t('card.hospital.' + w) : '';
        if (w) D().announce(word.textContent);
      },
    };
  }

  SR.ui.hospital = { card: card, gag: gag, lines: lines, flatlined: flatlined };
})();
