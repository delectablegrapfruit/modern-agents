// Progress kept in this browser: XP, streak, stars, achievements, settings, and the in-progress attempt (so a reload
// resumes after the last committed decision instead of letting it be taken back).
(function (root) {
  const TT = (root.TT = root.TT || {});
  const KEY = 'tokentrainer.v1';
  const DAILY_GOAL = 50;

  const blank = () => ({
    xp: 0, streak: 0, lastDay: null, daily: { day: null, xp: 0 },
    lessons: {}, practice: { rounds: 0, best: null }, grades: {}, achievements: {},
    active: null, settings: { sound: true, blind: false, theme: 'auto' },
  });

  let data = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = Object.assign(blank(), JSON.parse(raw));
  } catch (e) { /* storage unavailable: progress lasts for this visit only */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };

  function streakNow() {
    return data.lastDay === dayKey() || data.lastDay === yesterday() ? data.streak : 0;
  }
  function dailyXp() {
    return data.daily.day === dayKey() ? data.daily.xp : 0;
  }

  function addXp(n) {
    data.xp += n;
    if (data.daily.day !== dayKey()) data.daily = { day: dayKey(), xp: 0 };
    data.daily.xp += n;
  }

  function touchStreak() {
    const today = dayKey();
    if (data.lastDay === today) return false;
    data.streak = data.lastDay === yesterday() ? data.streak + 1 : 1;
    data.lastDay = today;
    return true;
  }

  const ACHIEVEMENTS = [
    { id: 'first', title: 'First Trade', desc: 'Finish your first lesson.', test: (d) => Object.values(d.lessons).some((l) => l.completions) },
    { id: 'perfect', title: 'Three Stars', desc: 'Earn 3 stars on a lesson.', test: (d) => Object.values(d.lessons).some((l) => l.stars === 3) },
    { id: 'flawless', title: 'Flawless', desc: 'Finish a lesson with all 5 hearts.', test: (d, ctx) => ctx && ctx.done && ctx.hearts === 5 },
    { id: 'survivor', title: 'Survivor', desc: 'Finish "The Stablecoin Wobble" down less than 5%.', test: (d) => (d.lessons.luna || {}).bestRet > -0.05 },
    { id: 'beat', title: 'Beat the Market', desc: 'Finish a lesson ahead of buy-and-hold.', test: (d, ctx) => ctx && ctx.done && ctx.ret > ctx.hodl },
    { id: 'streak3', title: 'On Fire', desc: 'Reach a 3-day streak.', test: (d) => d.streak >= 3 },
    { id: 'xp500', title: 'Seasoned', desc: 'Earn 500 XP.', test: (d) => d.xp >= 500 },
    { id: 'practice10', title: 'Chart Reader', desc: 'Play 10 practice rounds.', test: (d) => d.practice.rounds >= 10 },
    { id: 'graduate', title: 'Graduate', desc: 'Complete every lesson.', test: (d) => TT.SCENARIOS.every((s) => (d.lessons[s.id] || {}).completions) },
  ];

  function checkAchievements(ctx) {
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (data.achievements[a.id]) continue;
      if (a.test(data, ctx)) { data.achievements[a.id] = dayKey(); fresh.push(a); }
    }
    return fresh;
  }

  // Records a finished (or failed) attempt. Returns {streakUp, achievements}.
  function finish(key, sum, st) {
    addXp(sum.xp);
    for (const r of st.results) if (r.grade) data.grades[r.grade] = (data.grades[r.grade] || 0) + 1;
    let streakUp = false;
    if (st.done) streakUp = touchStreak();
    if (key === 'practice') {
      data.practice.rounds++;
      if (st.done && (data.practice.best == null || sum.avg > data.practice.best)) data.practice.best = sum.avg;
    } else {
      const l = data.lessons[key] || { stars: 0, completions: 0, attempts: 0, best: null, bestRet: null };
      l.attempts++;
      if (st.done) {
        l.completions++;
        l.stars = Math.max(l.stars, sum.stars);
        l.best = Math.max(l.best || 0, sum.avg);
        l.bestRet = l.bestRet == null ? sum.ret : Math.max(l.bestRet, sum.ret);
      }
      data.lessons[key] = l;
    }
    data.active = null;
    const achievements = checkAchievements({ done: st.done, hearts: st.hearts, ret: sum.ret, hodl: sum.hodl });
    save();
    return { streakUp, achievements };
  }

  function unlocked(id) {
    const i = TT.SCENARIOS.findIndex((s) => s.id === id);
    return i === 0 || !!(data.lessons[TT.SCENARIOS[i - 1].id] || {}).completions;
  }

  TT.store = {
    DAILY_GOAL, ACHIEVEMENTS,
    get: () => data, save, streakNow, dailyXp, finish, unlocked,
    setActive(a) { data.active = a; save(); },
    setting(k, v) { if (v === undefined) return data.settings[k]; data.settings[k] = v; save(); },
    reset() { data = blank(); save(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
