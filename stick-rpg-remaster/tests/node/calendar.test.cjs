// tests/node/calendar.test.cjs — owner: W1-E. SR.rules.calendar (BALANCE B-19; GDD §3.12, §3.13):
// the weather chain's frequencies over 10^5 days (±2 % of its stationary distribution), each row's
// transitions, the forecast's accuracy, storms, P0's constant Clear with no draws, the weekday
// bonuses and the weekly city event.
//   node tests/node/calendar.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('calendar (W1-E)');
const SR = H.boot();
const C = SR.rules.calendar;
const TW = SR.tuning.weather;

T.section('P0: always Clear, no draws');
{
  const s = H.state(SR, { world: { tomorrow: 'rain' } });
  const rng = SR.rng.create(5), before = rng.state();
  T.eq(C.rollWeather(s, rng), { today: 'clear', tomorrow: 'clear', forecast: 'clear', storm: false }, 'with `weather` off every day is Clear');
  T.eq(rng.state(), before, 'and nothing is drawn');
  T.eq(C.rollCityEvent(s, rng), null, 'no city events while `calendar` is off');
  T.eq(C.today(s).bonuses, [], 'no weekday bonuses in P0');
}

T.section('the weather chain (P1 weather)');
{
  const rf = H.features(SR, { weather: true });
  // The stationary distribution of the chain (power iteration).
  const states = TW.states;
  let pi = states.map(() => 1 / states.length);
  for (let k = 0; k < 500; k++) {
    pi = states.map((to) => states.reduce((a, from, i) => a + pi[i] * TW.chain[from][to], 0));
  }
  const s = H.state(SR, {});
  const rng = SR.rng.create(19), N = 100000, count = {}, trans = {}, right = { n: 0, of: 0 };
  states.forEach((a) => { count[a] = 0; trans[a] = {}; states.forEach((b) => { trans[a][b] = 0; }); });
  let rain = 0, storms = 0, lastForecast = null;
  for (let d = 0; d < N; d++) {
    const prev = s.world.weather;
    s.clock.day = d + 2;
    const r = C.rollWeather(s, rng);
    count[r.today]++;
    trans[prev][r.today]++;
    if (d > 0) { right.of++; if (lastForecast === r.today) right.n++; }
    lastForecast = r.forecast;
    if (r.today === 'rain') { rain++; if (r.storm) storms++; }
  }
  states.forEach((k, i) => {
    T.ok(Math.abs(count[k] / N - pi[i]) <= 0.02, k + ': ' + (count[k] / N * 100).toFixed(1) + ' % of days (stationary ' + (pi[i] * 100).toFixed(1) + ' %, ±2 %)');
  });
  states.forEach((a) => {
    const n = states.reduce((x, b) => x + trans[a][b], 0);
    const worst = Math.max.apply(null, states.map((b) => Math.abs(trans[a][b] / n - TW.chain[a][b])));
    T.ok(worst <= 0.02, 'from ' + a + ': every transition within ±2 % of B-19', worst.toFixed(3));
  });
  T.ok(Math.abs(right.n / right.of - 0.8) <= 0.02, 'yesterday\'s forecast was right on ' + (right.n / right.of * 100).toFixed(1) + ' % of days (0.8)');
  T.ok(Math.abs(storms / rain - TW.storm) <= 0.02, 'storms on ' + (storms / rain * 100).toFixed(1) + ' % of rain days (15 %)');
  const t = H.state(SR, { world: { tomorrow: 'fog' } });
  C.rollWeather(t, SR.rng.create(1));
  T.eq(t.world.weather, 'fog', 'today is yesterday\'s "tomorrow"');
  const r0 = SR.rng.create(2), r1 = SR.rng.create(2);
  C.rollWeather(H.state(SR, {}), r0);
  for (let i = 0; i < 3; i++) r1.next();
  T.eq(r0.state(), r1.state(), 'a weather roll draws exactly three numbers');
  rf();
}

T.section('the calendar and city events (P1 calendar)');
{
  const rf = H.features(SR, { calendar: true });
  T.eq([1, 2, 3, 4, 5, 6, 7, 8].map((d) => C.today(H.state(SR, { clock: { day: d } })).key), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'mon'], 'day 1 is a Monday');
  T.eq(C.today(H.state(SR, { clock: { day: 3 } })).bonuses, ['wed'], 'the weekday bonus');
  const week = () => [1, 2, 3, 4, 5, 6, 7].map((d) => C.today(H.state(SR, { clock: { day: d } })).bonuses.join('') || '-');
  T.eq(week(), ['mon', '-', 'wed', 'thu', 'fri', '-', '-'], 'Open Mic, the Ring and the skate contest wait for their own flags (review fix)');
  const rn = H.features(SR, { nightlife: true, arcs: true });
  T.eq(week(), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], '… and are announced with them');
  rn();
  const rng = SR.rng.create(33), seen = {}, days = {};
  for (let i = 0; i < 6000; i++) {
    const s = H.state(SR, { clock: { day: 8 } });   // Monday morning: the week's event
    const e = C.rollCityEvent(s, rng);
    seen[e.id] = (seen[e.id] || 0) + 1;
    (days[e.id] = days[e.id] || {})[e.day - 8] = 1;
  }
  T.eq(Object.keys(seen).sort(), Object.keys(SR.tuning.calendar.events).sort(), 'all six events occur');
  T.ok(Object.keys(seen).every((k) => Math.abs(seen[k] / 6000 - 1 / 6) < 0.02), 'with equal weights');
  T.eq(Object.keys(days.casinoNight), ['4'], 'Casino Night is always the Friday');
  T.eq(Object.keys(days.stockScare).sort(), ['0', '1', '2', '3'], 'Stock scare falls Monday-Thursday');
  T.eq(Object.keys(days.burgerDay).sort(), ['0', '1', '2', '3', '4', '5', '6'], 'the others any day of the week');
  const s = H.state(SR, { clock: { day: 10 }, world: { cityEvent: { id: 'burgerDay', day: 10 } } });
  T.eq([C.cityEvent(s), C.today(s).event], ['burgerDay', 'burgerDay'], 'the event is on its day');
  s.clock.day = 11;
  T.eq(C.cityEvent(s), null, '… and only then');
  // Drawn on Sunday night by the night (step 10); a Heat Wave forces a Clear day.
  const n = H.state(SR, { clock: { day: 7 } });
  SR.rules.night.run(n, H.ctx(SR, 3), {});
  T.ok(n.world.cityEvent && n.world.cityEvent.day >= 8 && n.world.cityEvent.day <= 14, 'the night after Sunday draws the week\'s event');
  const m = H.state(SR, { clock: { day: 6 } });
  SR.rules.night.run(m, H.ctx(SR, 3), {});
  T.eq(m.world.cityEvent, null, '… not on other nights');
  rf();
}

T.done();
