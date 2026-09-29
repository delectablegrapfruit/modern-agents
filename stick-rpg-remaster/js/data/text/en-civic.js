// js/data/text/en-civic.js — owner: W2-Civic. Text of the University of Stick (rows, Dean Quill's
// greetings, the transcript sub-screen), City Hall (rows, Clerk Plume's greetings, the Election
// Office sub-screen `cityhall.campaign`), the debate skin (mg.debate.*) and the voicemails the
// election rules raise (vm.board.*, vm.doodle.*, vm.crayon.*; js/rules/election.js, W1-C 10), the
// rivals' side of election night (the edition's front page is W2-Home's news.election.*, the inbox's
// sender names its sub.home.messages.from.*). Length limits by prefix: CONTRACT §7 (act ≤ 28,
// greet ≤ 140, vm ≤ 280, card ≤ 400).
// Numbers never appear in the prose; the vars carry them.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.text({
    // ---------------------------------------------------------------------------------------------
    // University of Stick: rows (GDD §6.1; BALANCE B-03)
    'act.uofs.study': 'Study in the library',
    'act.uofs.classBiz': 'Take a business class',
    'act.uofs.gym': 'Work out at the gym',
    'act.uofs.classKin': 'Take a kinesiology class',
    'act.uofs.classThr': 'Take a theatre class',
    'act.uofs.seminarBiz': 'Attend a business seminar',
    'act.uofs.seminarKin': 'Attend a kinesiology seminar',
    'act.uofs.seminarThr': 'Attend a theatre seminar',
    'act.uofs.transcript': 'Read your transcript',
    'act.uofs.graduateBiz': 'Graduate in Business',
    'act.uofs.graduateKin': 'Graduate in Kinesiology',
    'act.uofs.graduateThr': 'Graduate in Theatre',

    // Dean Quill (greet.uofs; the named fn greet.uofs picks by time, stats, karma and degrees)
    'greet.uofs.default': [
      'Welcome to the University of Stick. The library is free. Wisdom is extra.',
      'Mind the chalk dust. It has tenure.',
      'Our motto is "Think Harder". The Latin version is still in peer review.',
    ],
    'greet.uofs.morning': [
      'An early riser! The library is empty and the pendulum is in a good mood.',
      'Morning lectures are the best lectures. Nobody is awake enough to argue.',
    ],
    'greet.uofs.late': [
      'Burning the midnight graphite, are we? The gym lights stay on for the keen and the lost.',
      'We never close. Knowledge does not keep office hours, and neither, sadly, do I.',
    ],
    'greet.uofs.scholar': 'Our finest mind returns. I have started citing you in my own lectures.',
    'greet.uofs.hurt': 'You look like a crumpled first draft. The gym can wait; the library chairs are soft.',
    'greet.uofs.good': 'The student council voted you Most Likely to Hold a Door. It was unanimous.',
    'greet.uofs.bad': 'Welcome back. I have counted the chalk. I will count it again when you leave.',
    'greet.uofs.graduate': 'A graduate returns! Your diploma is still on the good cardstock, I trust.',

    // Interior signs (js/art/interiors/uofs.js)
    'card.uofs.poster': 'THINK!',
    'card.uofs.poster2': 'QUIET',

    // The transcript (uofs.transcript, P1 `degrees`)
    'sub.uofs.transcript': 'Transcript',
    'sub.uofs.transcript.intro': '{need} classes in one track earn a degree: +{bonus} to its stat once, then +{per} on every later gain of that stat.',
    'sub.uofs.transcript.track': '{name} · {stat}',
    'sub.uofs.transcript.classes': 'Classes',
    'sub.uofs.transcript.degree': 'Degree earned: +{per} {stat} on every gain',
    'sub.uofs.transcript.more': '{n} more classes to a degree',
    'sub.uofs.transcript.ready': 'Ready to graduate: a ceremony of {dur}',
    'sub.uofs.transcript.graduate': 'Graduate',
    'sub.uofs.transcript.seminarOpen': 'Seminars open: {left} left today',
    'sub.uofs.transcript.seminarNone': 'Seminars open: none left today',
    'sub.uofs.transcript.seminarLocked': 'Seminars need {stat} {min} and {need} classes here (you: {have} and {classes})',

    // ---------------------------------------------------------------------------------------------
    // City Hall: rows (GDD §6.1, §4.17; BALANCE B-17)
    'act.cityhall.office': 'Election Office',
    'act.cityhall.accept': 'Accept the nomination',
    'act.cityhall.rally': 'Hold a rally',
    'act.cityhall.tvAd': 'Run a TV ad blitz',
    'act.cityhall.doorKnock': 'Knock on doors',
    'act.cityhall.kissBabies': 'Kiss babies',
    'act.cityhall.intimidate': 'Intimidate the rivals',
    'act.cityhall.bribe': 'Bribe the officials',
    'act.cityhall.debate': 'Take the debate stage',

    'card.cityhall.confirm.accept': 'Pay {money} into the war chest and start the campaign today? Cash goes first, then the bank.',
    'card.cityhall.confirm.intimidate': 'Send some large friends to lean on the rival campaign? It costs karma and draws Heat.',
    'card.cityhall.confirm.bribe': 'Slip an envelope to the officials? It costs karma and Heat, and envelopes have been known to leak.',

    // Clerk Plume (greet.cityhall; the named fn greet.cityhall picks by the election and the hour)
    'greet.cityhall.default': [
      'City Hall. How may I stamp you today?',
      'Forms to the left, more forms to the right. The exit is also a form.',
      'Take a number, please. We ran out of numbers, so take a letter.',
    ],
    'greet.cityhall.late': 'We never close. Democracy has no business hours, only overtime.',
    'greet.cityhall.nominated': 'The Electoral Board phoned about you. Your nomination sits on my desk until the end of day {day}.',
    'greet.cityhall.campaign': [
      'Day {day} of the campaign. The polls say {poll} %. The polls also say they are tired.',
      'Campaign day {day}. Your posters are up. Some of them are even the right way round.',
    ],
    'greet.cityhall.president': 'Good day, President. Your portrait is up. We straightened it twice.',
    'greet.cityhall.dictator': 'Your Excellency. I polished the balcony, just in case you feel like waving.',
    'greet.cityhall.lost': 'Sorry about the election. We recycled your posters into ballots, so you still count.',
    'greet.cityhall.removed': 'Your old office is being repainted. We kept the nameplate, in case history repeats itself.',

    // Interior signs (js/art/interiors/cityhall.js)
    'card.cityhall.poster': 'VOTE!',

    // The Election Office (cityhall.campaign)
    'sub.cityhall.campaign': 'Election Office',
    'sub.cityhall.campaign.president': 'President of Sticks',
    'sub.cityhall.campaign.dictator': 'Dictator of Sticks',
    'sub.cityhall.campaign.noneTitle': 'No candidate on file',
    'sub.cityhall.campaign.intro': 'The Electoral Board calls new candidates every morning, and whenever you step out into the city.',
    'sub.cityhall.campaign.reqTitle': 'To run for {office}',
    'sub.cityhall.campaign.reqHome': 'Live in the castle',
    'sub.cityhall.campaign.reqMoney': 'Hold {money} in cash and bank (you: {have})',
    'sub.cityhall.campaign.reqStats': 'Every stat at {min} or more (your lowest: {have})',
    'sub.cityhall.campaign.reqKarmaGood': 'Karma +{min} or more (you: {have})',
    'sub.cityhall.campaign.reqKarmaBad': 'Karma {max} or less (you: {have})',
    'sub.cityhall.campaign.reqMet': 'Met',
    'sub.cityhall.campaign.reqMissing': 'Missing',
    'sub.cityhall.campaign.path': 'Karma picks the race: +{good} and up runs for President, {bad} and down for Dictator.',
    'sub.cityhall.campaign.retry': 'The Board will consider you again from day {day}.',
    'sub.cityhall.campaign.lostLine': 'Last election: lost on {poll} %.',
    'sub.cityhall.campaign.removedLine': 'Your last term ended early. The chair is still warm.',
    'sub.cityhall.campaign.nominatedTitle': 'Nominated for {office}',
    'sub.cityhall.campaign.nominatedLine': 'The Electoral Board called on day {day}. Accept by the end of day {last}, or the offer lapses.',
    'sub.cityhall.campaign.stillMissing': 'The Board will not sign until this is fixed:',
    'sub.cityhall.campaign.chestTitle': 'Pick a war chest',
    'sub.cityhall.campaign.chestHint': 'Paid in full from cash, then the bank. The poll starts at {base} %, moved by your lowest stat, your karma and the chest.',
    'sub.cityhall.campaign.chest': 'War chest of {money}',
    'sub.cityhall.campaign.pollChip': '{n} poll',
    'sub.cityhall.campaign.pollOr': '{a} or {b} poll',
    'sub.cityhall.campaign.startChip': 'Start at {poll} %',
    'sub.cityhall.campaign.campaignTitle': 'Campaign for {office}',
    'sub.cityhall.campaign.day': 'Day {day} of {days}',
    'sub.cityhall.campaign.night': 'Election night follows day {days}: the poll plus a swing of up to {jitter} points must reach {need} %.',
    'sub.cityhall.campaign.tonight': 'Election night is tonight. Sleep anywhere; the city counts.',
    'sub.cityhall.campaign.chestPaid': 'War chest paid: {money}',
    'sub.cityhall.campaign.rival': '{rival} campaigns every night: poll -{min} to -{max}.',
    'sub.cityhall.campaign.debateSoon': 'The debate is on day {day}.',
    'sub.cityhall.campaign.debateToday': 'The debate is today. Skip it and lose {n} points tonight.',
    'sub.cityhall.campaign.debateDone': 'Debate done.',
    'sub.cityhall.campaign.debateMissed': 'The debate is over. Your podium stood empty.',
    'sub.cityhall.campaign.actions': 'Campaign actions',
    'sub.cityhall.campaign.used': 'Used {n} of {cap} today',
    'sub.cityhall.campaign.usedHalf': 'Used {n} of {cap} today · half effect',
    'sub.cityhall.campaign.diary': 'Campaign diary',
    'sub.cityhall.campaign.diaryEmpty': 'Nothing yet. Go shake some hands.',
    'sub.cityhall.campaign.diaryLine': 'Day {day} · {text}',
    'sub.cityhall.campaign.officeTitle': 'In office: {office}',
    'sub.cityhall.campaign.salary': 'Salary: {money} every night, wherever you sleep.',
    'sub.cityhall.campaign.flipPresident': 'Karma below 0 on {of} mornings in a row ends the term. Bad mornings so far: {n}.',
    'sub.cityhall.campaign.flipDictator': 'Karma above 0 on {of} mornings in a row ends the term. Bad mornings so far: {n}.',

    // ---------------------------------------------------------------------------------------------
    // The debate (Duel skin `debate`, stance mode; B-30). Options are B-30's ids.
    'mg.debate.title': 'The Debate',
    'mg.debate.vs.doodle': 'versus Mayor Doodle',
    'mg.debate.vs.crayon': 'versus General Crayon',
    'mg.debate.doodle': 'Mayor Doodle',
    'mg.debate.crayon': 'General Crayon',
    'mg.debate.facts': 'Quote the facts',
    'mg.debate.charm': 'Flash the smile',
    'mg.debate.pressure': 'Talk over them',
    'mg.debate.banner': 'LIVE FROM CITY HALL',
    'mg.debate.q.1': 'Question {n} of {total}: what will you do about the potholes in the sky?',
    'mg.debate.q.2': 'Question {n} of {total}: the city is one sheet of paper. How will you stop it from blowing away?',
    'mg.debate.q.3': 'Question {n} of {total}: your rival says you once jaywalked across the Bus Hole. Respond.',
    'mg.debate.q.4': 'Question {n} of {total}: explain your tax plan using only nouns.',
    'mg.debate.q.5': 'Question {n} of {total}: should fries count as a vegetable in school lunches?',
    'mg.debate.q.6': 'Question {n} of {total}: a pigeon is sitting on the statue again. What is your plan?',
    'mg.debate.q.7': 'Question {n} of {total}: what does the 2nd Dimension need a third of?',
    'mg.debate.q.8': 'Question {n} of {total}: the moderator would like to know if you have ever folded under pressure.',
    'mg.debate.q.9': 'Question {n} of {total}: closing statements. Please keep yours under one crease.',

    // ---------------------------------------------------------------------------------------------
    // Voicemails raised by js/rules/election.js (vars: path, days, day, poll).
    'vm.board.nominated': 'Good morning, this is the Electoral Board of the 2nd Dimension. We have reviewed your castle, your savings and your frankly alarming stats, and you are nominated. Accept at the City Hall Election Office within {days} days, by the end of day {day}.',
    'vm.board.impeached': 'The Electoral Board here. Your karma stayed below zero one morning too many, and the city noticed. You are impeached, effective at once. Keep the money; we kept the chair. We will take your call again from day {day}.',
    'vm.board.coup': 'Electoral Board, calling about the tanks. A dictator with a conscience makes the generals nervous, and yours kept showing. They have the palace now. Your file reopens on day {day}.',
    'vm.doodle.concede': 'Mayor Doodle here. {poll} percent. I have looked at it from every angle, and it is still {poll} percent. Congratulations, President. The office chair squeaks on the left side. Nobody told me either.',
    'vm.doodle.gloat': 'Hi, Mayor Doodle calling! The recount came back exactly like the count: {poll} percent for you. Better luck next cycle. I saved you a seat at my inauguration. It is behind a pillar.',
    'vm.crayon.concede': 'General Crayon. The troops report {poll} percent in your favour, so I have ordered them to salute you instead. Do not lose the palace keys. There was only ever one set.',
    'vm.crayon.gloat': 'This is General Crayon. {poll} percent. Your campaign had no discipline, no parade and no working pen. The palace remains mine. Dismissed.',
  });
})();
