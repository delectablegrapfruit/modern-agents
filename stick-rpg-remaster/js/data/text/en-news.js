// js/data/text/en-news.js — owner: W2-Home. Text of The Daily Fold (UI §5.11) and the TV news
// (CONTRACT §7 news.*): the masthead, editions, section titles and buttons of the report scene; the
// headline templates news.head.<kind> for every BALANCE B-29 log kind plus news.head.absurd (the
// city absurdities, 20); news.tv.<kind>, the TV news leading with the same entry; news.story, the
// 30 stories of a quiet evening; the election-night front page. SR.rules.news picks the key and a
// stable variant; js/ui/screens/report.js adds display vars ({player}, {money}, {city},
// {pathName}, {causeText}, {howText}, {decreeName}, {move}) to the log entry's own. ≤ 220 each.
(function () {
  'use strict';
  window.SR.def.text({
    // ---- the page -------------------------------------------------------------------------------------
    'news.masthead': 'The Daily Fold',
    'news.masthead.hospital': 'Stick General Bulletin',
    'news.edition.sleep': 'Morning Edition · {weekday} · Day {day}',
    'news.edition.hospital': 'Discharge Edition · {weekday} · Day {day}',
    'news.edition.jail': 'Cell Block Edition · {weekday} · Day {day}',
    'news.edition.election': 'Election Night Extra · {weekday} · Day {day}',
    'news.section.overnight': 'Overnight',
    'news.section.money': 'Your money',
    'news.section.markets': 'Markets',
    'news.section.weather': 'Weather',
    'news.section.today': 'Today in the city',
    'news.section.jail': 'Jail',
    'news.section.hospital': 'Stick General',
    'news.section.election': 'The campaign',
    'news.continue': 'Good morning ▸',
    'news.continue.final': 'Read the Final Edition ▸',
    'news.continue.page': 'Turn the page ▸',
    'news.continue.hospital': 'Walk out into the noon ▸',
    'news.photo': 'Photo: {player}',
    'news.ended': 'Your {length} days are up. The presses are warming up for the Final Edition.',
    'news.deceased': 'The collection agents called overnight. There is no easy way to put this.',
    'news.quiet': 'A quiet night. The presses had nothing to say about you.',

    // ---- the election-night front page ----------------------------------------------------------------
    'news.election.wonHead': 'Election night: {player} wins!',
    'news.election.lostHead': 'Election night: {player} concedes',
    'news.election.poll': 'Final poll {poll} %',
    'news.election.roll': 'Election-night swing {roll}',
    'news.election.result': 'On the night: {final} %',
    'news.election.line': '{n} % to win',
    'news.election.stamp.president': 'PRESIDENT OF STICKS',
    'news.election.stamp.dictator': 'DICTATOR OF STICKS',
    'news.election.stamp.concede': 'CONCEDES',
    'news.path.president': 'President',
    'news.path.dictator': 'Dictator',
    'news.how.impeached': 'Impeached',
    'news.how.coup': 'Toppled In A Coup',
    'news.cause.fall': 'A Fall',
    'news.cause.carHit': 'A Car Hit',
    'news.cause.carCrash': 'A Car Crash',
    'news.cause.fight': 'A Brawl',
    'news.cause.mugger': 'A Mugging',
    'news.cause.goons': 'A Visit From Two Goons',
    'news.cause.other': 'A Bad Day',

    // ---- headlines by B-29 kind ---------------------------------------------------------------------
    'news.head.electionWon': [
      '{player} Sworn In As {pathName} Of Sticks; City Unsure What That Involves',
      'Landslide! {player} Takes Office, Promises To Read The Instructions',
    ],
    'news.head.removed': [
      '{pathName} {player} {howText}; Office Chair Still Warm',
      'Out By Breakfast: {pathName} {player} {howText}',
    ],
    'news.head.electionLost': [
      '{player} Concedes; Rival Thanks "Everyone Who Owns A Pencil"',
      'Voters Say No To {player}, Politely',
    ],
    'news.head.nominated': [
      'Electoral Board Calls {player}: "Would You Like To Run Things?"',
      'Castle Resident {player} Nominated; Moat Quietly Thrilled',
    ],
    'news.head.jailed': [
      '{player} Behind Bars For {days} Days; Cell Described As "Snug"',
      'Arrest On Main Street: {player} Taken In, Asks For Pillow',
    ],
    'news.head.bankRobbery': [
      'Bank Of The 2nd Dimension Robbed; Teller Calls It "Frankly Rude"',
      'Vault Emptied In Broad Daylight; Penny Wise Demands A Better Vault',
    ],
    'news.head.hospital': [
      'Stick General Patches Up {player} After {causeText}',
      '"It Looked Worse Than It Was," Say Doctors Of {player}',
    ],
    'news.head.castleBought': [
      '{player} Buys The Castle; Moat Delighted, Drawbridge Nervous',
      'New Owner For The Castle: Local Stick {player}',
    ],
    'news.head.promotedCeo': [
      'New Lines Names {player} Chief Executive; Share Price Blinks',
      'Corner Office Goes To {player}; Previous Occupant "Taking Time Off"',
    ],
    'news.head.kidDied': [
      'Corner Kid Gone; A Skateboard And Flowers Lean On The Lamp Post',
    ],
    'news.head.promoted': [
      '{player} Promoted To {title}; Office Plant Unmoved',
      'Career Ladder Climbed: {player} Is Now {title}',
    ],
    'news.head.champion': [
      "Sticky's Crowns A New Champion; The Stools Fear For Their Future",
    ],
    'news.head.degree': [
      '{player} Graduates In {name}; Mortarboard Lost To The Sky',
      'University Of Stick Hands {player} A Degree In {name}',
    ],
    'news.head.haroldRepaid': [
      'Harold Repays His Loan In Full; Economists Baffled',
    ],
    'news.head.kidGood': [
      'Skate Contest Won By Former Corner Kid; Crowd Chants His Name',
    ],
    'news.head.storeRobbery': [
      'Funkytown Five-O Held Up; Slushee Machine Sole Witness',
      'Five-O Clerk Describes Robber As "Brief"',
    ],
    'news.head.busted': [
      'Customs In {city} Nab A Traveller From The Paper City',
    ],
    'news.head.redTurnedIn': [
      'Dealer Alley Goes Quiet After A Tip-Off; Detective Takes A Bow',
    ],
    'news.head.homeBought': [
      '{player} Buys The {name}; Neighbours Bring A Cake',
      'Keys Change Hands: {player} Moves Up In The World',
    ],
    'news.head.jackpot': [
      'Slot Machine Pays Out {money}; Casino Checks Its Own Pockets',
    ],
    'news.head.casinoBig': [
      'Silver Lining Loses {money} To One Lucky Stick',
    ],
    'news.head.ringWin': [
      'Underground Ring Upset: {player} Takes Bout {k}',
    ],
    'news.head.fallMilestone': [
      'Local Stick Falls Off City For {count}th Time; "I\'m Fine," Says Stick',
      'Fold Rescue Logs Its {count}th Pick-Up Of {player}; Pilot Ori Asks For A Raise',
    ],
    'news.head.decree': [
      '{pathName} {player} Signs "{decreeName}" Into Law',
    ],
    'news.head.tour': [
      '{player} Lectures In {city}; Audience Stays Awake Throughout',
    ],
    'news.head.smuggleDeal': [
      'Mystery Traveller Seen At The {city} Docks At Dawn',
    ],
    'news.head.fightWin': [
      "Brawl At Sticky's: {player} Beats {name}",
    ],
    'news.head.carHit': [
      'Car Hits Pedestrian; Pedestrian Tells Car To "Watch It"',
    ],
    'news.head.stockMove': [
      '{ticker} Moves {move} Overnight; Traders Clutch Their Pearls',
    ],
    'news.head.fall': [
      'Stick Falls Off The Edge, Is Politely Returned By Paper Plane',
    ],
    'news.head.storm': [
      'Thunder Over The City; Umbrella Sales Go Through The Roof',
    ],
    'news.head.absurd': [
      'Pigeon Elected To Nothing In Particular',
      'City Council Debates Whether Tuesday Is Too Long',
      'Man Finds Pencil; Owner Still Unknown',
      'Weather Continues, Experts Say',
      'Local Bench Celebrates A Century Of Being Sat On',
      'Fountain Runs Backwards For Six Minutes; Nobody Notices',
      'Bus Driver Takes Wrong Turn, Discovers New Cloud',
      'Survey: Nine Out Of Ten Sticks Prefer Standing',
      'Lost Hat Found On Statue; Statue Declines To Comment',
      'City Hall Reminds Residents The Edge Is Still There',
      'McSticks Fryer Marks Its Millionth Fry; Fry Declines Interview',
      'Duck Pond Declared "Mostly Ducks"',
      'Queue At The Bank Reaches Record Length Of Four',
      'Paperweight Found Holding Down Entire Neighbourhood',
      'Cloud Shaped Like A Cloud Spotted Over Main Street',
      'Library Book Returned Forty Years Late; Fine Paid In Buttons',
      'Scientists Confirm The Sky Is Still "Above Us"',
      'Traffic Light Stuck On Amber; Drivers Report Mixed Feelings',
      'Two Sticks Wave At Each Other; Both Pretend It Was For Someone Else',
      'Wind Moves Leaf; Leaf Moves On',
    ],

    // ---- the TV news, leading with yesterday's heaviest entry --------------------------------------
    'news.tv.electionWon': 'Leading tonight: {player} is the new {pathName} of Sticks. The inauguration buffet ran out of sandwiches by noon.',
    'news.tv.removed': 'Breaking: {pathName} {player} is out of office. The nameplate has already been unscrewed.',
    'news.tv.electionLost': 'Leading tonight: {player} lost the election and gave a gracious speech to three reporters and a pigeon.',
    'news.tv.nominated': 'Leading tonight: the Electoral Board has phoned {player}. The castle drawbridge was seen trembling.',
    'news.tv.jailed': 'Leading tonight: {player} begins {days} days behind bars. Neighbours say "they seemed so normal".',
    'news.tv.bankRobbery': 'Leading tonight: the Bank of the 2nd Dimension was robbed. Penny Wise says the vault "felt violated".',
    'news.tv.hospital': 'Leading tonight: Stick General treated {player} after {causeText}. Doctors used the good plasters.',
    'news.tv.castleBought': 'Leading tonight: {player} now owns the Castle. The moat is said to be very excited.',
    'news.tv.promotedCeo': 'Leading tonight: New Lines has a new chief executive, {player}. The stock price did a little hop.',
    'news.tv.kidDied': 'A sad one tonight: the corner kid is gone. Someone has leaned his skateboard against the lamp post.',
    'news.tv.promoted': 'Leading tonight: {player} was promoted to {title}. Colleagues were seen pretending to be happy.',
    'news.tv.champion': "Leading tonight: Sticky's has a new bar champion. The regulars are drinking to it, carefully.",
    'news.tv.degree': 'Leading tonight: {player} graduated from the University of Stick in {name}. The mortarboard is still airborne.',
    'news.tv.haroldRepaid': 'Leading tonight: Harold has paid back every dollar. Bankers are calling it "unprecedented".',
    'news.tv.kidGood': 'Leading tonight: a former corner kid won the Sunday skate contest. The crowd carried him round the bowl.',
    'news.tv.storeRobbery': 'Leading tonight: a hold-up at Funkytown Five-O. The only witness was a slushee machine, which is still spinning.',
    'news.tv.busted': 'Leading tonight: customs officers in {city} caught a traveller from our fair city. Embarrassing for everyone.',
    'news.tv.redTurnedIn': 'Leading tonight: Dealer Alley is quiet after an anonymous tip. Detective McHolland is taking the credit.',
    'news.tv.homeBought': 'Leading tonight: {player} bought the {name}. The neighbours have already started baking.',
    'news.tv.jackpot': 'Leading tonight: a slot machine at Silver Lining paid {money}. Lucky Lou was seen checking it with a stethoscope.',
    'news.tv.casinoBig': 'Leading tonight: one lucky stick walked out of Silver Lining {money} richer. The casino is "reviewing the carpets".',
    'news.tv.ringWin': 'Leading tonight: an upset in the Underground Ring. {player} took bout {k} and did not want to talk about it.',
    'news.tv.fallMilestone': 'Leading tonight: {player} has fallen off the city {count} times. Pilot Ori says the plane knows the way by now.',
    'news.tv.decree': 'Leading tonight: {pathName} {player} signed "{decreeName}". Civil servants are reading the small print.',
    'news.tv.tour': 'Leading tonight: {player} spoke to a packed hall in {city}. Nobody fell asleep, a local record.',
    'news.tv.smuggleDeal': 'Leading tonight: dock workers in {city} report a stranger with heavy luggage and light pockets.',
    'news.tv.fightWin': "Leading tonight: a scuffle at Sticky's. {player} beat {name}, then helped pick the stools up.",
    'news.tv.carHit': 'Leading tonight: a car hit a pedestrian on Main Street. Both parties blame the other one\'s shoes.',
    'news.tv.stockMove': 'Leading tonight: {ticker} moved {move} overnight. The trading floor needed a sit-down.',
    'news.tv.fall': 'Leading tonight: another stick went over the edge. The Fold Rescue plane returned them with a stern look.',
    'news.tv.storm': 'Leading tonight: thunderstorms rolled over the city. Umbrellas are sold out in every shop.',
    'news.story': [
      'The city council met today to discuss the edge. The edge was not available for comment.',
      'A duck at Stickwood Park has been voted "most likely to succeed". It has no plans.',
      'McSticks announced a new sauce. It is the old sauce in a new bottle, a spokesman confirmed.',
      'The Sky Bus ran four minutes late today. Passengers describe the view as "worth it".',
      'A pigeon has been sitting on the statue plinth for nine days. Experts say it is thinking.',
      'The Bank of the 2nd Dimension reminds everyone that money is safest where you left it.',
      'Scientists at the University of Stick have proved that Mondays are longer. The paper is 400 pages.',
      'Traffic on Main Street was light today, apart from the cars.',
      'A lost umbrella has been returned to its owner after twelve years. The owner has moved on.',
      'New Lines Inc. launched a new motivational poster. Staff say they feel roughly as motivated.',
      'The fountain in Origin Plaza was cleaned today and found to contain one hundred and six coins and a shoe.',
      'Skywatch Weather apologises for yesterday. It says today will be different, in some way.',
      'The Five-O slushee machine has been declared a local landmark. It keeps spinning regardless.',
      'A new bench on Park Path was sat on for the first time today. The bench is said to be coping.',
      'Pilot Ori of the Fold Rescue reminds viewers that the plane is for emergencies, not sightseeing.',
      'A local stick counted every lamp post in the city. There are exactly enough, he reports.',
      'The Electoral Board met, drank tea and agreed to meet again. Democracy continues.',
      'Rumours of a second moon over the city turned out to be a very round balloon.',
      'Silver Lining Casino opened a new wing. It looks exactly like the old wing, but with more carpet.',
      'A study finds that most sticks walk on the sidewalk. The rest are in cars, or falling.',
      'The Paper Mills of the 2nd Dimension report record production. Nobody knows where the paper goes.',
      "Sticky's has banned singing after 23:00. Humming remains legal but frowned upon.",
      'A tourist from Crayonburg asked for directions to the edge. Everyone pointed the same way.',
      'Glue & Sons celebrated their anniversary. Nobody could leave the party for some time.',
      'The pawn shop has taken in a stuffed fish that talks. Vinnie says it only talks to him.',
      'A cloud got stuck on the NLI tower for most of the afternoon. Engineers used a very long stick.',
      'The city library now lends umbrellas. Nobody has returned one, which the librarian calls "hopeful".',
      'Fine Line Furnishings unveiled a bed so comfortable that the salesperson has not been seen since.',
      'Weather today was weather. Tomorrow is expected to follow suit.',
      'And finally: a stick on the NLI roof has been fishing into the clouds for a week. Still no bites.',
    ],
  });
})();
