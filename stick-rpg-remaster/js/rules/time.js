// js/rules/time.js — owner: W2-RulesE (W1-R in wave 1). SR.rules.time: the clock, the one wall (an action may start only
// if now + cost ≤ 24:00), Buzz wearing off as time passes, weekdays and weeks (GDD §4.1, §4.2;
// ARCHITECTURE §6.5; BALANCE B-01).
// Pure: no DOM, browser API or unseeded randomness (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  function T() { return SR.tuning.time; }

  /**
   * The wall (GDD §4.1): an action costing `min` minutes may start only if now + min ≤ dayEnd.
   * @returns {boolean}
   */
  function canStart(s, min) {
    return s.clock.min + (Number(min) || 0) <= T().dayEnd;
  }

  /**
   * Buzz wears off as the clock runs (GDD §4.2: -1 per 2 game hours; sleep resets it). It is
   * counted on the clock's 2-hour grid (each time the clock passes 02:00, 04:00, ..., 24:00), so no
   * state field is needed and the same day always sobers up the same way.
   * @param {object} s state @param {number} from clock minute before @param {number} to after
   */
  function soberUp(s, from, to) {
    var every = T().buzzDecayMin;
    if (!(every > 0) || !s.stats || !(s.stats.buzz > 0) || !(to > from)) return;
    var n = Math.floor(to / every) - Math.floor(from / every);
    if (n > 0) SR.rules.stats.buzz(s, -n);
  }

  /**
   * Spends time on the clock (never past the wall; the night is the only place the day advances).
   * @returns {number} the new clock minute
   */
  function spend(s, min) {
    var from = s.clock.min;
    s.clock.min = SR.util.clamp(from + (Number(min) || 0), 0, T().dayEnd);
    soberUp(s, from, s.clock.min);
    return s.clock.min;
  }

  /** Sets the clock to a minute of the current day (robberies and trips set 24:00). @returns {number} */
  function setTo(s, min) {
    var from = s.clock.min;
    s.clock.min = SR.util.clamp(Math.round(Number(min) || 0), 0, T().dayEnd);
    soberUp(s, from, s.clock.min);
    return s.clock.min;
  }

  /** @returns {number} the weekday 0..6 (0 = Monday) of a day number (day 1 is Monday). */
  function weekdayOf(day) {
    return (((day - 1 + T().weekStart) % 7) + 7) % 7;
  }

  /** @returns {number} today's weekday 0..6 (0 = Monday). */
  function weekday(s) { return weekdayOf(s.clock.day); }

  /** @returns {number} the week index floor((day - 1) / 7); every weekly limit compares against it. */
  function week(s) { return Math.floor((s.clock.day - 1) / 7); }

  /**
   * Whether the night that ends `day` ticks the market (B-01 marketNights: the nights after Mon-Fri).
   * @param {number} day the ended day
   * @returns {boolean}
   */
  function isMarketDay(day) { return T().marketNights.indexOf(weekdayOf(day)) >= 0; }

  /** @returns {number} a weekday index from 0..6 or a name 'mon'..'sun' (-1 if unknown). */
  function dayIndex(d) {
    if (typeof d === 'number') return d >= 0 && d <= 6 ? Math.floor(d) : -1;
    return T().weekdays.indexOf(String(d).toLowerCase().slice(0, 3));
  }

  /** @returns {number} minutes left before the wall. */
  function left(s) { return Math.max(0, T().dayEnd - s.clock.min); }

  /** @returns {string} a clock time for display: '14:30' or '2:30 PM' (SR.text.time). */
  function fmt(min, h12) { return SR.text.time(min, h12); }

  SR.rules.time = {
    canStart: canStart,
    spend: spend,
    setTo: setTo,
    weekday: weekday,
    weekdayOf: weekdayOf,
    week: week,
    isMarketDay: isMarketDay,
    dayIndex: dayIndex,
    left: left,
    fmt: fmt,
  };
})();
