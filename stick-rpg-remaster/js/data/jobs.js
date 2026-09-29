// js/data/jobs.js — owner: W1-E. SR.def.job: the job ladder of BALANCE B-05 (GDD §4.6).
// A def carries the job's identity (track, employer, icon, text key, priority); the ladder order,
// every number (INT and CHA gates, shifts at rank, wage, credit limit, rating) and the hustle skins
// live in SR.tuning.jobs and are read by SR.rules.jobs at call time, so the balance wave tunes only
// tuning.js. A prio-20 boot hook copies the numbers onto each def (`int`, `cha`, `shifts`, `wage`,
// `credit`, `salary`) for display, as CONTRACT §3.1 describes job defs as "B-05 rows".
// Titles: job.<id>; in office the title follows the path (job.president / job.dictator).
// Pure data (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.job('cook', { name: 'job.cook', track: 'mcsticks', employer: 'mcsticks', icon: 'burger', p: 0 });
  SR.def.job('manager', { name: 'job.manager', track: 'mcsticks', employer: 'mcsticks', icon: 'promotion', p: 1, feature: 'hustles' });
  SR.def.job('janitor', { name: 'job.janitor', track: 'nli', employer: 'nli', icon: 'janitor', p: 0 });
  SR.def.job('mail', { name: 'job.mail', track: 'nli', employer: 'nli', icon: 'mailroom', p: 0 });
  SR.def.job('sales', { name: 'job.sales', track: 'nli', employer: 'nli', icon: 'sales', p: 0 });
  SR.def.job('exec', { name: 'job.exec', track: 'nli', employer: 'nli', icon: 'executive', p: 0 });
  SR.def.job('vp', { name: 'job.vp', track: 'nli', employer: 'nli', icon: 'vp', p: 0 });
  SR.def.job('ceo', { name: 'job.ceo', track: 'nli', employer: 'nli', icon: 'ceo', p: 0 });
  // The office (B-05 `office`): won at the election, never applied for.
  SR.def.job('office', { name: 'job.office', track: 'city', employer: 'cityhall', icon: 'election', p: 0 });

  // Copies the B-05 numbers onto the defs for display (the rules read SR.tuning directly).
  SR.onBoot(20, function () {
    var t = SR.tuning.jobs;
    if (!t) return;
    Object.keys(SR.reg.job).forEach(function (id) {
      var row = t[id], def = SR.reg.job[id];
      if (!row) return;
      ['int', 'cha', 'shifts', 'wage', 'credit', 'salary', 'rating'].forEach(function (k) {
        if (row[k] !== undefined) def[k] = row[k];
      });
    });
  }, { headless: true });
})();
