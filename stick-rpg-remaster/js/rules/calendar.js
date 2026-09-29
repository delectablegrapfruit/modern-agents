// js/rules/calendar.js — owner: W1-E. SR.rules.calendar: the weekday and its bonuses (P1
// `calendar`), the nightly weather roll on the Markov chain with the forecast (P1 `weather`; P0 is
// always Clear), storms, and the weekly city event drawn on Sunday night (P1 `calendar`)
// (BALANCE B-19; GDD §3.12, §3.13, §6.8). Pure; randomness only from the rng passed in, and none
// at all while the flags are off, so P0 runs draw exactly the same numbers with or without P1 code.
// Numbers: SR.tuning.weather, SR.tuning.calendar (B-19).
(function () {
  'use strict';
  var SR = window.SR;

  function TW() { return SR.tuning.weather; }
  function TC() { return SR.tuning.calendar; }

  /** @returns {string[]} the weekday names, Monday first (B-01; day 1 is a Monday). */
  function weekdays() { return SR.tuning.time.weekdays; }
  /** @returns {string[]} the weather states (B-19). */
  function states() { return TW().states; }
  /** @returns {number} the weekday (0 = Monday) of a day number. */
  function weekdayOf(day) { return SR.rules.time.weekdayOf(day); }
  // The weekday bonuses whose content belongs to another flag (BUILD_PLAN Appendix B): Open Mic,
  // the Ring and the VIP points are `nightlife`, the skate contest is the kid's arc (`arcs`). The
  // report does not announce them while that flag is off.
  var BONUS_FEATURE = { tue: 'nightlife', sat: 'nightlife', sun: 'arcs' };

  /** @returns {number[]} the weekdays a city event may fall on (B-19: 'any', 'fri', ['mon', ...]). */
  function eventDays(ev) {
    if (!ev.day || ev.day === 'any') return [0, 1, 2, 3, 4, 5, 6];
    return (Array.isArray(ev.day) ? ev.day : [ev.day]).map(function (d) { return SR.rules.time.dayIndex(d); });
  }

  var calendar = {
    weekdayOf: weekdayOf,
    eventDays: eventDays,

    /**
     * Today on the calendar: the weekday, its bonus key (P1 `calendar`: 'mon' Motivation Monday,
     * 'tue' Open Mic, 'wed' half-price classes, 'thu' Triple Thursday, 'fri' happy hour and the
     * weekly bonus, 'sat' the Ring and VIP points, 'sun' the skate contest) and the city event.
     * @returns {{weekday: number, key: string, bonuses: string[], event: (string|null)}}
     */
    today: function (s) {
      var wd = weekdayOf(s.clock.day), key = weekdays()[wd], need = BONUS_FEATURE[key];
      var on = SR.features.calendar && TC()[key] && (!need || SR.features[need]);
      return { weekday: wd, key: key, bonuses: on ? [key] : [], event: calendar.cityEvent(s) };
    },

    /** @returns {string|null} the city event on today (P1 `calendar`), or null. */
    cityEvent: function (s) {
      var e = s.world && s.world.cityEvent;
      if (!SR.features.calendar || !e || e.day !== s.clock.day) return null;
      return e.id;
    },

    /**
     * Whether today's rain is a storm (15 % of rain days, B-19). Decided by a hash of the seed and
     * the day, so it needs no state and draws nothing from the rules stream.
     * @returns {boolean}
     */
    storm: function (s) {
      if (!SR.features.weather || s.world.weather !== 'rain') return false;
      return SR.util.hash(s.seed, 'storm', s.clock.day) / 4294967296 < TW().storm;
    },

    /**
     * The weather of the new day (night step 8, after the day advanced): today = yesterday's
     * "tomorrow" (Clear on a Heat Wave day), tomorrow is rolled on the chain and its forecast drawn
     * (right with 0.8, otherwise another state at random). With `weather` off everything is Clear
     * and no number is drawn.
     * @returns {{today: string, tomorrow: string, forecast: string, storm: boolean}}
     */
    rollWeather: function (s, rng) {
      var w = s.world;
      if (!SR.features.weather) {
        w.weather = 'clear'; w.tomorrow = 'clear'; w.forecast = 'clear';
        return { today: 'clear', tomorrow: 'clear', forecast: 'clear', storm: false };
      }
      rng = rng || SR.rng.rules;
      var today = states().indexOf(w.tomorrow) >= 0 ? w.tomorrow : TW().day1;
      if (calendar.cityEvent(s) === 'heatWave') today = TC().events.heatWave.weather;
      w.weather = today;
      w.tomorrow = calendar.next(today, rng);
      var others = states().filter(function (x) { return x !== w.tomorrow; });
      var right = rng.chance(TW().forecastAccuracy);
      var other = rng.pick(others);
      w.forecast = right ? w.tomorrow : other;
      return { today: today, tomorrow: w.tomorrow, forecast: w.forecast, storm: calendar.storm(s) };
    },

    /** @returns {string} the next state on the Markov chain from `from` (one draw). */
    next: function (from, rng) {
      var row = TW().chain[from] || TW().chain[TW().day1];
      return rng.weighted(states().map(function (k) { return [k, row[k] || 0]; })) || TW().day1;
    },

    /**
     * Draws the coming week's city event on Sunday night (night step 10, P1 `calendar`): one of
     * the six with equal weights; Casino Night is always the Friday, Stock scare Monday-Thursday,
     * the others any day of the week (B-19). The new day is the Monday.
     * @returns {{id: string, day: number}|null} state.world.cityEvent
     */
    rollCityEvent: function (s, rng) {
      if (!SR.features.calendar) return null;
      rng = rng || SR.rng.rules;
      var events = TC().events, ids = Object.keys(events);
      var id = rng.pick(ids);
      var days = eventDays(events[id]);
      var monday = s.clock.day - weekdayOf(s.clock.day);
      var day = monday + days[rng.int(0, days.length - 1)];
      s.world.cityEvent = { id: id, day: day };
      return s.world.cityEvent;
    },
  };

  SR.rules.calendar = calendar;
})();
