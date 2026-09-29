// js/data/text/en-news.js — owner: W2-Home. text: Daily Fold headlines, TV news stories.
// wave-1 slice placeholder, owner W2-Home (BUILD_PLAN §3.12; the lead at the wave-1 integration):
// only the masthead, edition lines, section titles and button of the placeholder report in
// js/scenes/report.js. The owner replaces the whole file.
(function () {
  'use strict';
  /* stub, owner: W2-Home */
  window.SR.def.text({
    'news.masthead': 'The Daily Fold',
    'news.edition.sleep': 'Morning Edition · {weekday} · Day {day}',
    'news.edition.hospital': 'Stick General Bulletin · {weekday} · Day {day}',
    'news.edition.jail': 'Jail Edition · {weekday} · Day {day}',
    'news.section.overnight': 'Overnight',
    'news.section.money': 'Your money',
    'news.section.markets': 'Markets',
    'news.section.weather': 'Weather',
    'news.section.today': 'Today in the city',
    'news.section.jail': 'Jail',
    'news.section.hospital': 'Stick General',
    'news.section.election': 'Election night',
    'news.continue': 'Good morning ▸',
  });
})();
