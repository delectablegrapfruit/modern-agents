// js/data/text/en-world.js — owner: W1-W (W2-City in wave 2, W3-Park in wave 3, W4-Writing in
// wave 4). The world's text (docs/CONTRACT.md §7): place names (place.*, including the lettering
// of signs, place.sign.*), door prompts and tags (door.*), Pilot Ori of the Fold Rescue (ori.*),
// the world actions' labels and the city's prompts and buttons (act.world.*) and world toasts
// (toast.world.*). All original writing.
(function () {
  'use strict';
  var SR = window.SR;

  SR.def.text({
    // Buildings (building defs name them place.<id>) and the home card.
    'place.home': 'Home',
    'place.home_apt': 'Paperview Apartments',
    'place.home_castle': 'The Castle',
    'place.home_mansion': 'Hillcrest Mansion',
    'place.home_pent': 'Edgeview Tower',
    'place.bank': 'Bank of the 2nd Dimension',
    'place.nli': 'New Lines Inc.',
    'place.uofs': 'University of Stick',
    'place.cityhall': 'City Hall',
    'place.furniture': 'Fine Line Furnishings',
    'place.mcsticks': 'McSticks',
    'place.bar': 'Sticky\'s',
    'place.casino': 'Silver Lining Casino',
    'place.store': 'Funkytown Five-O',
    'place.pawn': 'Pawn Shop',
    'place.bus': 'Bus Depot',
    'place.skybus': 'The Sky Bus',
    'place.hospital': 'Stick General',
    'place.precinct': 'the Precinct desk',

    // Streets and landmarks of the sheet (GDD §3.1).
    'place.mainSt': 'Main Street',
    'place.westAve': 'West Avenue',
    'place.eastAve': 'East Avenue',
    'place.castleDrive': 'Castle Drive',
    'place.bankLane': 'Bank Lane',
    'place.campusWalk': 'Campus Walk',
    'place.parkPath': 'Park Path',
    'place.dealerAlley': 'Edgeview Walk',
    'place.marginPath': 'Margin Path',
    'place.civicPlaza': 'Civic Plaza',
    'place.originPlaza': 'Origin Plaza',
    'place.park': 'Stickwood Park',
    'place.edgeview': 'Edgeview',
    'place.pointMargin': 'Point Margin',
    'place.dogEar': 'The Dog-Ear',
    'place.castleRim': 'The Castle Rim',
    'place.notch': 'The NE Notch',
    'place.bite': 'The Bite',
    'place.busHole': 'The Bus Hole',
    'place.skyRibbon': 'The Sky Ribbon',

    // Sign lettering on the exteriors (ART_AUDIO §5.2) and the road-end sawhorses (§1.1).
    'place.sign.home_apt': 'PAPERVIEW',
    'place.sign.home_mansion': 'HILLCREST',
    'place.sign.home_pent': 'EDGEVIEW',
    'place.sign.bank': 'BANK',
    'place.sign.nli': 'NEW LINES INC.',
    'place.sign.uofs': 'U of S',
    'place.sign.cityhall': 'CITY HALL',
    'place.sign.furniture': 'FINE LINE FURNISHINGS',
    'place.sign.mcsticks': 'McSTICKS',
    'place.sign.bar': 'STICKY\'S',
    'place.sign.casino': 'SILVER LINING',
    'place.sign.store': 'FIVE-O',
    'place.sign.pawn': 'PAWN',
    'place.sign.bus': 'BUS DEPOT',
    'place.sign.roadEnds': 'ROAD ENDS. OBVIOUSLY.',
    // The facades' and props' other words (W2-Exterior request 1; ART_AUDIO §5.2, §6).
    'place.sign.forSale': 'FOR SALE',
    'place.sign.slushee': 'SLUSHEE',
    'place.sign.departures': 'DEPARTURES',
    'place.sign.skybus': 'SKY BUS',
    'place.sign.nliAd': 'WE DRAW THE LINE',
    'place.sign.ceo': 'YOUR CEO',
    'place.sign.billboard.1': 'FRIES ON A STICK',
    'place.sign.billboard.2': 'THINK INSIDE THE LINES',
    'place.sign.billboard.3': 'EVERY CLOUD PAYS',
    'place.sign.billboard.4': 'CASH FOR YOUR STUFF',
    'place.sign.billboard.5': 'BRAIN FREEZE ZONE',

    // Door prompts ("[E] Enter McSticks") and tags (GDD §3.6).
    'door.enter': 'Enter {place}',
    'door.park': 'Park and enter',
    'door.live': 'Home',
    'door.owned': 'Yours',
    'door.forSale': 'For Sale',

    // The world actions (never shown as rows; labels for logs and debugging).
    'act.world.fall': 'Fall off the edge',
    'act.world.carHit': 'Hit by a car',
    'act.world.carCrash': 'Car crash',
    'act.world.carFished': 'Car fished from the clouds',
    'act.world.enter': 'Walk in',
    'act.world.getIn': 'Get in the car',
    'act.world.getOut': 'Get out',
    'act.world.city': 'Step into the city',
    'act.world.cab': 'Take a cab',
    'act.world.retire': 'Retire',

    // The city's prompts (UI.md §2.3 ContextPrompt), its touch buttons (UI.md §5.5) and the minimap.
    'act.world.talk': 'Talk to {name}',
    'act.world.look': 'Look at {name}',
    'act.world.junker': 'the junker',
    'act.world.car': 'Car',
    'act.world.carAria': 'Get in or out of your car',
    'act.world.action': 'Action',
    'act.world.actionAria': 'Enter, talk or act here',
    'act.world.skate': 'Skate',
    'act.world.skateAria': 'Skate: hold on or off',
    'act.world.minimap': 'Minimap',
    'act.world.minimapOpen': 'Minimap: open the map',
    'act.world.touch': 'Touch controls',

    // World toasts (≤ 80 characters).
    'toast.world.phew': 'Phew. Still on the paper.',
    'toast.world.hey': 'Hey!',
    'toast.world.edge': 'Mind the edge. Really.',
    'toast.world.carHit': 'Flattened by traffic. Paper bends back, mostly.',
    'toast.world.crash': 'Crunch! Both cars bounce off each other.',
    'toast.world.carFished': 'Your car sank into the clouds. It gets towed home tonight for {money}.',
    'toast.world.noCar': 'None of your cars is close enough.',
    'toast.world.noRoute': 'Can\'t find a way there on foot.',
    'toast.world.midnight': 'Midnight. Only free things and sleep are left today. Head home.',
    'toast.world.midnightCab': 'Midnight. Only free things and sleep are left. Walk or cab it home.',
    'toast.world.cabRide': 'The cab drops you at {place}.',

    // Pilot Ori of the Fold Rescue (GDD §3.9): a line after falls 1, 2, 5, 10, 25 and 50.
    'ori.name': 'Pilot Ori',
    'ori.rescue': 'Fold Rescue!',
    'ori.fall1': 'Pilot Ori, Fold Rescue. Paper has edges. That was one of them.',
    'ori.fall2': 'Back so soon? The clouds said you would be. The clouds gossip.',
    'ori.fall5': 'Five rescues. I am printing you a frequent-flyer card.',
    'ori.fall10': 'Ten! You are less a citizen now and more a boomerang.',
    'ori.fall25': 'Twenty-five. I named a seat after you. It is the one with the dent.',
    'ori.fall50': 'Fifty falls. The sky is not a shortcut. Please tell your legs.',
  });
})();
