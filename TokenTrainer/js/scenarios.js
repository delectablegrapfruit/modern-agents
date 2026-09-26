// Course content. Every scenario replays real Binance candles (see scripts/fetch_data.py for the data keys).
// news: headlines that were public at that time — shown once the chart reaches their date.
// coach: an experienced trader's read at decision k (0-based), judged only on what was knowable then.
(function (root) {
  const TT = (root.TT = root.TT || {});

  TT.UNITS = [
    {
      id: 'u1', title: 'Read the Trend', color: 'green',
      blurb: 'Spot direction, ride it, and notice when it ends.',
      guide: [
        ['The trend is your friend', 'An uptrend makes higher highs and higher lows; price holds above rising moving averages. Most money in crypto is made by staying in these moves, not by timing every wiggle.'],
        ['Moving averages', 'The orange line is the 20-bar average, the blue line the 50-bar. Price above a rising 20 above a rising 50 = uptrend. Price below falling averages = downtrend.'],
        ['Buy pullbacks, not spikes', 'Entering after a big green candle (RSI > 70, price far above the 20) means buying from people taking profit. Pullbacks toward a rising average are cheaper entries.'],
        ['Trends end with lower highs', 'A failed new high, then a close below the 50-bar average, is the classic sign a trend is over. Reduce risk before the crowd agrees.'],
      ],
    },
    {
      id: 'u2', title: 'Trade the News', color: 'blue',
      blurb: 'Catalysts, hype cycles and "sell the news".',
      guide: [
        ['Buy the rumor, sell the news', 'Known future events (upgrades, ETF deadlines, celebrity appearances) get priced in before they happen. When the day arrives, early buyers sell to late ones.'],
        ['Attention peaks are price peaks', 'When a coin is on TV, trending everywhere and your friends ask about it, most buyers are already in. Scale out into that strength.'],
        ['Listings are liquidity events', 'A big-exchange listing of an already-pumped token hands early holders a deep market to sell into. The listing candle is often the top.'],
        ['Scale out', 'You never have to choose between all-in and all-out. Trimming half into strength locks gains and keeps you in if it keeps running.'],
      ],
    },
    {
      id: 'u3', title: 'Survive Volatility', color: 'purple',
      blurb: 'Stops, sizing, and not panicking in crashes.',
      guide: [
        ['Risk 1–2% per idea', 'Position size × stop distance = what you can lose. Keep it near 1–2% of the account and no single trade can hurt you badly.'],
        ['ATR: normal noise', 'Average true range is how much a candle usually moves. A stop closer than ~1× ATR gets hit by noise; set stops beyond it and shrink the position instead.'],
        ['Stops slip in crashes', 'In a liquidation cascade the price gaps through your stop and you fill lower. Size — not the stop alone — is your real protection.'],
        ['Capitulation', 'Huge volume, RSI under 25 and a long wick after a violent drop often mark forced selling ending. Selling there locks in the worst price.'],
      ],
    },
    {
      id: 'u4', title: 'Black Swans', color: 'red',
      blurb: 'When the thesis breaks, price can go to zero.',
      guide: [
        ['Thesis first', 'Know why you own something. If the reason breaks (a peg fails, an exchange halts withdrawals), sell — the price is not "cheap".'],
        ['Never average down on broken things', 'Buying more of a collapsing asset turns a loss into a wipe-out. −90% then −90% again is −99%.'],
        ['Counterparty & contagion', 'When a big holder is forced to sell, everything it owns falls together. Ask who is holding the bag, and whether they can be forced out.'],
        ['Cash is a position', 'In a bear market rallies get sold. Sitting in cash and waiting for the trend to turn is a trade — often the best one.'],
      ],
    },
  ];

  TT.SCENARIOS = [
    // ---------------- Unit 1 ----------------
    {
      id: 'btc_etf', unit: 'u1', data: 'btc_etf', title: 'Riding the Wave', lookback: 60, decisions: 8,
      skill: 'Stay in a strong trend', brief: 'Bitcoin has been chopping sideways for months. A court just forced the SEC to reconsider spot bitcoin ETFs. Can you catch — and keep — the move?',
      news: [
        ['2023-08-29', 'Court rules the SEC was wrong to reject Grayscale\'s spot bitcoin ETF application; BTC jumps ~6%.'],
        ['2023-10-16', 'A false report that the SEC approved BlackRock\'s spot ETF sends BTC spiking, then retracing within the hour.'],
        ['2023-10-24', 'BlackRock\'s iShares Bitcoin Trust appears on the DTCC list; BTC tops $35k.'],
        ['2023-11-21', 'Binance agrees to pay $4.3B to settle with US authorities; CZ steps down. The market shrugs.'],
        ['2023-12-04', 'BTC breaks above $40k for the first time since April 2022.'],
        ['2024-01-10', 'The SEC approves 11 spot bitcoin ETFs; trading starts the next day.'],
        ['2024-01-22', 'Heavy GBTC outflows as holders exit; BTC dips below $40k.'],
        ['2024-02-12', 'ETF inflows accelerate; BTC reclaims $50k for the first time since Dec 2021.'],
        ['2024-02-28', 'BTC surges past $60k on record ETF volumes.'],
      ],
      coach: [
        { k: 0, prefer: ['buy25', 'buy50'], why: 'A pending catalyst, price basing above $25k and the court win: a starter position with a stop is a sound bet.' },
        { k: 2, prefer: ['hold', 'buy25'], avoid: ['exit'], why: 'Higher highs, higher lows, price above rising averages. The trend is doing the work — let it.', whyNot: 'Nothing in the trend has broken; selling here is fear of heights.' },
      ],
      reveal: 'Bitcoin, Oct 2023 → Mar 2024. BTC went from ~$27k to a record $73.8k on Mar 14, 2024 as spot ETFs were anticipated, approved and then flooded with inflows. The −20% "sell the news" dip right after approval shook out many holders before the next leg up.',
      lesson: 'In a strong trend the edge is staying in. Buy pullbacks toward rising averages; don\'t try to top-tick a market making higher highs.',
    },
    {
      id: 'sol_revival', unit: 'u1', data: 'sol_revival', title: 'The Comeback', lookback: 45, decisions: 7,
      skill: 'Relative strength', brief: 'This token lost 95% in the last bear market and a bankrupt exchange\'s estate is about to sell its holdings. Most traders have written it off.',
      news: [
        ['2023-08-17', 'Crypto flash-crashes after reports SpaceX wrote down its bitcoin; BTC falls below $26k.'],
        ['2023-09-13', 'Court lets the FTX estate sell its crypto, including over $1B of SOL, in weekly tranches.'],
        ['2023-10-23', 'BTC surges past $33k on ETF optimism; large-cap altcoins follow.'],
        ['2023-10-30', 'Solana Breakpoint conference opens in Amsterdam.'],
        ['2023-12-07', 'Jito (JTO) airdrops tokens to Solana users; on-chain activity jumps.'],
        ['2023-12-14', 'Solana memecoin BONK surges as major exchanges list it.'],
      ],
      coach: [
        { k: 0, prefer: ['wait', 'hold', 'buy25'], avoid: ['allin'], why: 'A known seller (FTX estate) and a downtrend: at most a small, stopped position until it proves strength.', whyNot: 'Going all-in against a known supply overhang with no trend is gambling.' },
        { k: 2, prefer: ['buy25', 'buy50', 'hold'], why: 'Price rallying despite a known seller is relative strength — the market is absorbing the supply.' },
      ],
      reveal: 'Solana, Sep → Dec 2023. SOL rose from a $17 low to $126 — more than 7× — even while the FTX estate was selling. Absorbing a known seller was the tell. Airdrops and memecoins then pulled users back on-chain.',
      lesson: 'When a coin keeps rising despite obvious bad news, the market is telling you something. Relative strength beats narratives.',
    },
    {
      id: 'btc_top', unit: 'u1', data: 'btc_top', title: 'The Top', lookback: 60, decisions: 8,
      skill: 'Recognize a trend ending', brief: 'Bitcoin is recovering from a 50% crash earlier this year. New highs are being called for. Ride it — and know when to leave.',
      news: [
        ['2021-09-07', 'El Salvador makes bitcoin legal tender; BTC drops over 10% intraday.'],
        ['2021-09-24', 'China\'s central bank declares all crypto transactions illegal.'],
        ['2021-10-19', 'The first US bitcoin futures ETF (BITO) starts trading.'],
        ['2021-10-20', 'BTC sets a new all-time high near $67k.'],
        ['2021-11-10', 'US CPI prints 6.2%; BTC tags $69k then reverses the same day.'],
        ['2021-11-26', 'Omicron variant fears hit global markets.'],
        ['2021-11-30', 'Powell says it\'s time to retire the word "transitory" and signals a faster taper.'],
        ['2021-12-04', 'Weekend flash crash: BTC drops ~20% in hours to ~$42k on liquidations.'],
        ['2021-12-15', 'The Fed doubles its taper pace and signals three rate hikes in 2022.'],
        ['2022-01-05', 'Fed minutes point to faster tightening and balance-sheet runoff; risk assets fall.'],
      ],
      coach: [
        { k: 3, prefer: ['hold', 'trim', 'wait'], avoid: ['allin', 'buy50'], why: 'New highs, but it\'s the second top of the year on a futures-ETF headline. Hold with a stop or trim — don\'t press.', whyNot: 'Adding size at a fresh all-time high on an ETF headline is chasing.' },
        { k: 5, prefer: ['exit', 'trim', 'wait'], avoid: ['buy50', 'allin'], why: 'Lower high, price under falling averages, a hawkish Fed: the trend has turned. Cut or stay in cash.', whyNot: 'Buying a downtrend because it "used to be $69k" is anchoring.' },
      ],
      reveal: 'Bitcoin, Sep 2021 → Jan 2022. BTC topped at $69k on Nov 10, 2021 — a lower-momentum double top after April\'s $65k — then fell to $33k by late January and to $15.5k by November 2022 as the Fed tightened.',
      lesson: 'Trends end with failed highs and lost averages. When price loses the 50-bar average and it rolls over, reduce — before the headlines confirm it.',
    },
    // ---------------- Unit 2 ----------------
    {
      id: 'eth_merge', unit: 'u2', data: 'eth_merge', title: 'Sell the News', lookback: 45,
      checkpoints: ['2022-06-29', '2022-07-15', '2022-07-27', '2022-08-08', '2022-08-16', '2022-08-27', '2022-09-08', '2022-09-14', '2022-09-24'],
      skill: 'Known catalysts get priced in', brief: 'Ether has crashed 60% in a brutal bear market. Its biggest upgrade ever — switching to proof-of-stake — is finally getting a date.',
      news: [
        ['2022-06-13', 'Crypto lender Celsius freezes withdrawals; ETH drops 15%.'],
        ['2022-06-18', 'ETH falls below $900 for the first time since early 2021.'],
        ['2022-07-14', 'Ethereum developers propose Sep 19 as a tentative Merge date; ETH rallies.'],
        ['2022-07-27', 'Fed hikes 75bp but hints at slowing; risk assets rally.'],
        ['2022-08-11', 'The Goerli testnet merges successfully — the final rehearsal.'],
        ['2022-08-26', 'Powell at Jackson Hole warns of "some pain" ahead; stocks and crypto drop.'],
        ['2022-09-06', 'Bellatrix upgrade activates; the Merge is expected around Sep 15.'],
        ['2022-09-13', 'US CPI 8.3%, hotter than expected; stocks have their worst day since 2020.'],
        ['2022-09-15', 'The Merge completes: Ethereum now runs on proof-of-stake.'],
        ['2022-09-21', 'The Fed hikes 75bp again and projects higher rates.'],
      ],
      coach: [
        { k: 1, prefer: ['buy25', 'buy50'], why: 'A dated catalyst weeks away and price reclaiming its averages: this is where "buy the rumor" works.' },
        { k: 7, prefer: ['trim', 'exit', 'wait'], avoid: ['buy50', 'allin'], why: 'The event is days away, everyone knows the date, and the macro backdrop is hostile. Take profits into the rumor.', whyNot: 'Buying right before a universally known event is buying from people who got in on the rumor.' },
      ],
      reveal: 'Ethereum, Jul → Oct 2022. ETH rallied ~125% from its June low to ~$2,000 in mid-August on Merge anticipation, then fell over 35% as the day arrived — the Merge itself was flawless. Rising rates did the rest.',
      lesson: 'Buy the rumor, sell the news. A catalyst everyone can see on the calendar is usually priced in before it happens.',
    },
    {
      id: 'doge_snl', unit: 'u2', data: 'doge_snl', title: 'Much Wow', lookback: 45,
      checkpoints: ['2021-03-18', '2021-04-01', '2021-04-13', '2021-04-17', '2021-04-24', '2021-05-01', '2021-05-07', '2021-05-12', '2021-05-19'],
      skill: 'Hype cycles', brief: 'A joke coin with a celebrity fan base. The internet is getting loud about it again.',
      news: [
        ['2021-02-04', 'Elon Musk tweets "Dogecoin is the people\'s crypto"; DOGE doubles in days.'],
        ['2021-02-08', 'Tesla discloses a $1.5B bitcoin purchase.'],
        ['2021-04-14', 'Coinbase lists on Nasdaq; crypto euphoria peaks across headlines.'],
        ['2021-04-16', 'DOGE more than doubles in 24 hours; Robinhood\'s app strains under crypto traffic.'],
        ['2021-04-20', '"Doge Day" 4/20 hype fails to push price higher; DOGE slides.'],
        ['2021-04-25', 'NBC announces Elon Musk will host Saturday Night Live on May 8.'],
        ['2021-05-08', 'Musk hosts SNL and jokingly calls DOGE "a hustle"; price drops sharply.'],
        ['2021-05-12', 'Tesla suspends bitcoin payments over climate concerns.'],
        ['2021-05-19', 'China reiterates its crypto ban; crypto crashes, BTC briefly −30% intraday.'],
      ],
      coach: [
        { k: 3, prefer: ['trim', 'hold'], avoid: ['allin', 'buy50'], why: 'Doubling in a day with the app store crashing is peak attention. Bank some gains.', whyNot: 'Buying after a 100% day is buying the late crowd\'s exit liquidity.' },
        { k: 6, prefer: ['exit', 'trim', 'wait'], avoid: ['buy25', 'buy50', 'allin'], why: 'Up 10× in weeks, the headline event is tomorrow, and every retail trader knows the date. Classic sell-the-news setup.', whyNot: 'Buying the night before the most-hyped event in the coin\'s history is buying the top.' },
      ],
      reveal: 'Dogecoin, Mar → May 2021. DOGE ran from $0.05 to $0.74 on May 8 — about 13× — as Musk\'s SNL appearance approached, then lost over half its value in two weeks after the show.',
      lesson: 'Celebrity and attention-driven moves peak when attention peaks. Scale out into the event; never add on the day everyone is watching.',
    },
    {
      id: 'pepe', unit: 'u2', data: 'pepe', title: 'Frog Season', lookback: 3, decisions: 7,
      skill: 'Listings and memecoin tops', brief: 'A three-week-old memecoin with no utility is already worth over $1 billion. The world\'s largest exchange is listing it today.',
      news: [
        ['2023-05-05', 'Binance lists PEPE, three weeks after launch; its market cap has already passed $1B.'],
        ['2023-05-07', 'Bitcoin network fees spike amid a BRC-20 memecoin frenzy.'],
        ['2023-05-08', 'Binance briefly pauses BTC withdrawals due to network congestion.'],
        ['2023-06-05', 'The SEC sues Binance; the next day it sues Coinbase.'],
        ['2023-06-10', 'Altcoins sell off hard after Robinhood says it will drop several tokens the SEC called securities.'],
      ],
      coach: [
        { k: 0, prefer: ['wait'], avoid: ['allin', 'buy50'], why: 'Up thousands of percent before listing, no history, no averages: the listing hands early holders an exit. Watching is the pro move.', whyNot: 'Buying big on a memecoin\'s listing day is providing exit liquidity.' },
      ],
      reveal: 'PEPE, May → Jun 2023. The Binance listing on May 5 marked the top: PEPE fell ~80% over the next five weeks as early holders sold into the new liquidity and memecoin mania cooled.',
      lesson: 'A big-exchange listing of an already-parabolic token is usually a liquidity event for early holders — not a starting gun.',
    },
    // ---------------- Unit 3 ----------------
    {
      id: 'covid', unit: 'u3', data: 'covid', title: 'Black Thursday', lookback: 60,
      checkpoints: ['2020-01-30', '2020-02-13', '2020-02-25', '2020-03-08', '2020-03-12', '2020-03-16', '2020-03-26', '2020-04-15', '2020-04-29'],
      skill: 'Size for the worst day', brief: 'Bitcoin is having a strong start to the year. A virus outbreak in China is in the news but markets look calm.',
      news: [
        ['2020-01-03', 'A US strike kills Iranian general Soleimani; BTC rallies as a "safe haven".'],
        ['2020-01-30', 'WHO declares the new coronavirus a global health emergency.'],
        ['2020-02-13', 'BTC tops $10,400, its highest since last September.'],
        ['2020-02-24', 'Italy locks down towns; global stocks tumble on virus spread.'],
        ['2020-03-09', 'Oil price war: crude −25%; a circuit breaker halts US stock trading.'],
        ['2020-03-11', 'WHO declares a pandemic.'],
        ['2020-03-12', '"Black Thursday": US stocks\' worst day since 1987; BTC falls ~40% in a day as leveraged longs are liquidated.'],
        ['2020-03-15', 'The Fed cuts rates to zero and launches $700B of QE.'],
        ['2020-03-23', 'The Fed announces unlimited QE.'],
        ['2020-04-20', 'US oil futures trade below zero for the first time ever.'],
        ['2020-05-11', 'Bitcoin\'s third halving.'],
      ],
      coach: [
        { k: 3, prefer: ['trim', 'exit', 'wait'], avoid: ['allin', 'buy50'], why: 'Global stocks are sliding on the virus and BTC just lost its averages on a big red candle. Cut size or tighten risk before it gets worse.', whyNot: 'Adding size while global markets sell off ignores that everything correlates in a liquidity crisis.' },
        { k: 4, prefer: ['hold', 'buy25'], avoid: ['exit', 'trim'], why: 'After a −40% day with record volume, forced sellers are mostly done. Panic-selling here locks in the low; a small, stopped buy is the brave pro move.', whyNot: 'Selling after a −40% candle sells to the people buying the capitulation.' },
      ],
      reveal: 'Bitcoin, Feb → May 2020. BTC fell 64% from $10.5k to $3.8k in a month as COVID triggered a global liquidity crisis — then, with rates at zero and unlimited QE, recovered all of it by May.',
      lesson: 'Size so a −40% day can\'t end you. Liquidity crashes hit everything at once; forced selling is what creates the bottom.',
    },
    {
      id: 'yen', unit: 'u3', data: 'yen', title: 'The Yen Unwind', lookback: 48,
      checkpoints: ['2024-08-01T00', '2024-08-02T00', '2024-08-02T16', '2024-08-03T16', '2024-08-04T18', '2024-08-05T02', '2024-08-05T07', '2024-08-05T20', '2024-08-06T20', '2024-08-07T20'],
      skill: 'Macro shocks on hourly candles', brief: 'Hourly candles. Bitcoin is drifting lower after a failed push toward its highs. Japan\'s central bank meets this week.',
      news: [
        ['2024-07-31T03', 'The Bank of Japan raises rates to 0.25% and plans to slow its bond buying.'],
        ['2024-07-31T18', 'The Fed holds rates; Powell signals a cut could come in September.'],
        ['2024-08-02T12', 'US jobs report: unemployment rises to 4.3%, triggering recession fears.'],
        ['2024-08-04T12', 'Weekend: large trading firms move ETH to exchanges; crypto slides.'],
        ['2024-08-05T06', 'Japan\'s Nikkei plunges 12% — its worst day since 1987 — as the yen carry trade unwinds.'],
        ['2024-08-07T05', 'BOJ deputy governor says the bank won\'t hike while markets are unstable.'],
      ],
      coach: [
        { k: 2, prefer: ['trim', 'exit', 'wait'], avoid: ['allin'], why: 'Recession scare plus a hawkish Japan into a thin weekend: reduce leverage-like exposure.' },
        { k: 6, prefer: ['hold', 'buy25'], avoid: ['exit'], why: 'A 25% drop in 48 hours to a long wick while Japan crashes is a liquidity event, not a change in bitcoin. Selling the wick is the costly mistake.', whyNot: 'Selling right after the capitulation wick locks in the worst price of the year.' },
      ],
      reveal: 'Bitcoin, Aug 1–9 2024. BTC fell from $67k to $49k — about −27% — as the yen carry trade unwound and Japan\'s market crashed. The low came within hours of the Nikkei\'s worst day; BTC was back above $60k four days later.',
      lesson: 'Macro liquidity shocks create forced sellers. Pre-planned size and stops limit damage; selling at the capitulation wick turns a scare into a real loss.',
    },
    {
      id: 'oct10', unit: 'u3', data: 'oct10', title: 'Liquidation Friday', lookback: 30,
      checkpoints: ['2025-09-27', '2025-10-01', '2025-10-04', '2025-10-06T16', '2025-10-08T12', '2025-10-10T12', '2025-10-11T00', '2025-10-13', '2025-10-16'],
      skill: 'Stops slip in cascades', brief: '4-hour candles. Solana is bouncing with the market as bitcoin approaches record highs. Leverage across crypto is at record levels.',
      news: [
        ['2025-10-01', 'The US government shuts down after Congress fails to pass funding.'],
        ['2025-10-06', 'Bitcoin sets a new all-time high above $125k.'],
        ['2025-10-10T15', 'Trump threatens a "massive increase" in tariffs on China; US stocks slide.'],
        ['2025-10-10T21', 'Trump announces an extra 100% tariff on Chinese imports; crypto sees its largest liquidation event on record — about $19B of leveraged positions wiped out.'],
        ['2025-10-12', 'Trump softens his tone on China; crypto rebounds.'],
      ],
      coach: [
        { k: 5, prefer: ['trim', 'exit', 'wait'], avoid: ['allin', 'buy50'], why: 'A fresh trade-war threat is hitting stocks while crypto leverage sits at record levels. Time for smaller size, not more.' },
        { k: 6, prefer: ['hold', 'buy25'], avoid: ['exit'], why: 'The cascade already happened — forced liquidations are done. Selling spot after the wick hands your coins to the buyers of the flush.', whyNot: 'Selling after a record liquidation wick is selling at the moment of maximum forced supply.' },
      ],
      reveal: 'Solana, Oct 2025. On Oct 10 a tariff shock hit the most leveraged crypto market ever: ~$19B of positions were liquidated and SOL fell ~25% within hours, with stops across the market filling far below their triggers. Spot holders with sane size saw a sharp rebound within days.',
      lesson: 'In liquidation cascades, order books empty out and stops slip. Position size — not a stop — is your real protection.',
    },
    // ---------------- Unit 4 ----------------
    {
      id: 'luna', unit: 'u4', data: 'luna', title: 'The Stablecoin Wobble', lookback: 48,
      checkpoints: ['2022-05-05T00', '2022-05-06T12', '2022-05-07T22', '2022-05-08T14', '2022-05-09T12', '2022-05-10T02', '2022-05-10T16', '2022-05-11T08', '2022-05-12T02'],
      skill: 'When the thesis breaks', brief: 'Hourly candles. A top-10 token whose value backs a $18B algorithmic stablecoin paying 20% yield. The foundation behind it holds billions in bitcoin reserves.',
      news: [
        ['2022-05-05', 'A day after the Fed\'s 50bp hike, markets reverse sharply lower.'],
        ['2022-05-07T20', 'About $2B of UST is pulled from the Anchor protocol; UST briefly slips to $0.985.'],
        ['2022-05-08T12', 'The Luna Foundation Guard says it will lend $1.5B in BTC and UST to defend the peg.'],
        ['2022-05-09T02', 'UST slides below $0.95; Do Kwon tweets "Deploying more capital — steady lads".'],
        ['2022-05-09T20', 'UST falls as low as $0.60s; LUNA is minted en masse to absorb redemptions.'],
        ['2022-05-10T12', 'Reports of rescue funding talks; UST briefly recovers toward $0.90.'],
        ['2022-05-11T06', 'UST slides toward $0.30; LUNA\'s supply explodes as the peg mechanism spirals.'],
        ['2022-05-12T08', 'The Terra blockchain is halted; exchanges suspend LUNA and UST trading.'],
      ],
      coach: [
        { k: 2, prefer: ['trim', 'exit', 'wait'], avoid: ['buy50', 'allin'], why: 'The asset\'s entire value depends on the stablecoin holding its peg — and the peg just wobbled. Reduce exposure.' },
        { k: 4, prefer: ['exit', 'wait'], avoid: ['buy25', 'buy50', 'allin'], why: 'The peg is breaking and the defense is spending reserves. The mechanism mints LUNA to defend UST — every dollar of redemptions dilutes you. Get out or stay out.', whyNot: 'Averaging down into a death spiral: the "discount" is the mechanism failing.' },
        { k: 6, prefer: ['exit', 'wait'], avoid: ['buy25', 'buy50', 'allin'], why: 'A relief bounce inside a broken peg is an exit opportunity, not a buy.', whyNot: 'Buying the bounce in a collapsing algorithmic stablecoin system bets on a rescue that never came.' },
        { k: 7, prefer: ['exit', 'wait'], avoid: ['buy25', 'buy50', 'allin'], why: 'Supply is exploding; price per token is meaningless. Nothing to buy here.', whyNot: 'Down 99% can still go down 99% more when supply is being minted by the billions.' },
      ],
      reveal: 'Terra LUNA, May 2022. LUNA went from ~$80 to under $0.0001 in about four days — a 99.99% loss — as the UST stablecoin lost its peg and the mint-and-burn mechanism printed trillions of new LUNA. Around $40B of value vanished.',
      lesson: 'Never average down on a broken thesis. When the mechanism backing an asset fails, price isn\'t cheap — it can go to zero.',
    },
    {
      id: 'ftx', unit: 'u4', data: 'ftx', title: 'Contagion', lookback: 30,
      checkpoints: ['2022-10-29', '2022-11-02T16', '2022-11-05T16', '2022-11-07T00', '2022-11-08T16', '2022-11-09T16', '2022-11-11T00', '2022-11-13'],
      skill: 'Counterparty & concentration risk', brief: '4-hour candles. Solana is holding up well in the bear market. Its most prominent backers include the founder of one of the largest crypto exchanges.',
      news: [
        ['2022-11-02T12', 'CoinDesk reports most of Alameda Research\'s $14.6B balance sheet is FTT and other FTX-linked tokens.'],
        ['2022-11-06T15', 'Binance\'s CZ says Binance will sell its remaining FTT holdings.'],
        ['2022-11-07T12', 'SBF tweets "FTX is fine. Assets are fine." Withdrawals from FTX surge.'],
        ['2022-11-08T16', 'FTX halts withdrawals; Binance signs a non-binding deal to acquire it.'],
        ['2022-11-09T21', 'Binance walks away from the FTX deal after due diligence.'],
        ['2022-11-11T14', 'FTX files for bankruptcy; SBF resigns. Hours later, hundreds of millions are drained from FTX wallets.'],
      ],
      coach: [
        { k: 2, prefer: ['trim', 'exit', 'wait'], avoid: ['allin', 'buy50'], why: 'Reports say the trading firm behind one of this token\'s biggest backers is built on its own exchange\'s token. A solvency question over a major holder is concentration risk — trim it.' },
        { k: 4, prefer: ['exit', 'wait'], avoid: ['buy25', 'buy50', 'allin'], why: 'An exchange halting withdrawals is the end-game signal. SOL is widely seen as "SBF\'s coin" — forced selling is coming.', whyNot: 'Buying the dip on the day an exchange halts withdrawals ignores who has to sell next.' },
      ],
      reveal: 'Solana, Nov 2022. SOL fell ~68%, from $38.8 to $12, in nine days as FTX and Alameda — among its largest backers and holders — collapsed. It was the most directly exposed large-cap to the contagion.',
      lesson: 'Know who holds the bag. When a major holder is forced to sell, the assets it is most concentrated in fall hardest.',
    },
    {
      id: 'celsius', unit: 'u4', data: 'celsius', title: 'Capitulation', lookback: 30,
      checkpoints: ['2022-05-01', '2022-05-09', '2022-05-20', '2022-06-01', '2022-06-10', '2022-06-13', '2022-06-18', '2022-06-28', '2022-07-07'],
      skill: 'Cash is a position', brief: 'Bitcoin is 30% off its highs. Rates are rising fast. Crypto lenders promise double-digit yields on deposits.',
      news: [
        ['2022-05-04', 'The Fed raises rates by 50bp — its largest hike since 2000.'],
        ['2022-05-09', 'Terra\'s UST stablecoin loses its peg; its foundation sells BTC reserves.'],
        ['2022-05-12', 'BTC falls below $27k as the Terra collapse spreads.'],
        ['2022-06-10', 'US CPI 8.6% — a 40-year high.'],
        ['2022-06-12', 'Crypto lender Celsius pauses all withdrawals.'],
        ['2022-06-15', 'The Fed hikes 75bp, the most since 1994. Reports say Three Arrows Capital missed margin calls.'],
        ['2022-06-18', 'BTC falls below $18k — under the previous cycle\'s all-time high for the first time.'],
        ['2022-06-27', 'Three Arrows Capital is ordered into liquidation.'],
        ['2022-07-05', 'Crypto lender Voyager files for bankruptcy.'],
        ['2022-07-13', 'Celsius files for bankruptcy.'],
      ],
      coach: [
        { k: 1, prefer: ['wait', 'exit', 'trim'], avoid: ['allin', 'buy50'], why: 'A top-10 stablecoin failing, with its reserves in BTC being sold: stay small or in cash.' },
        { k: 5, prefer: ['wait', 'exit'], avoid: ['allin', 'buy50'], why: 'A lender freezing withdrawals means forced selling ahead. In a falling market with the Fed hiking, cash is a position.' },
      ],
      reveal: 'Bitcoin, May → Jul 2022. BTC fell from $47k to $17.6k as Terra, Celsius, Three Arrows and Voyager collapsed one after another under rising rates. Every rally was sold; BTC made a final low of $15.5k after FTX in November.',
      lesson: 'In a bear market with forced sellers, bounces are sold. Preserve capital, keep positions small, and wait for the trend to turn.',
    },
  ];

  TT.scenarioById = Object.fromEntries(TT.SCENARIOS.map((s) => [s.id, s]));
})(typeof window !== 'undefined' ? window : globalThis);
