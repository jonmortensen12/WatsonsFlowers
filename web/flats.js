/* Watson's Flowers - Rattlesnake Flats, the made-up town.

   The Mesa-Gilbert map is where the family really lived; this one is for
   driving. It goes through the same builder (WMap.build) as the real one,
   so the orders, the traffic, the computer vans and the routing all work
   the same, but every district is laid out to be thrown about in, the way
   the big open-world racers do it:

   - Downtown: towers on a tight grid of alleys, smashable gates across the
     alley mouths, powder kegs down the alleys.
   - The airfield: a runway with a mega ramp each way, kickers on the
     apron, hangars and a control tower.
   - The speedway: a ring track round an infield of jumps and tyre stacks.
   - The rail yard: rows of shipping containers with ramps up onto them,
     so you can run along the roofs and fly off the end.
   - The quarry: dirt, boulders, ramps every way and a pit to jump.
   - Two dead-straight canals with jumps across them every block.

   All of it flat and all of it straight. Nothing here is a real place. */
(function(root){
  root.WGEO_FLATS = {
    note: 'Invented. Rattlesnake Flats is not a real town.',
    name: 'Rattlesnake Flats', size: [2015, 1448],
    // the mile roads; collectors between them (null: no collector there)
    ns: [
      {x: 330, names: [{name: 'Speedway Boulevard', z: null}]},
      {x: 650, names: [{name: 'Gilbert Road', z: null}]},
      {x: 970, names: [{name: 'Rattlesnake Road', z: null}]},
      {x: 1290, names: [{name: 'Quarry Road', z: null}]},
      {x: 1610, names: [{name: 'Airport Road', z: null}]},
      {x: 1930, names: [{name: 'Dynamite Drive', z: null}]}
    ],
    ew: [
      {z: 100, names: [{name: 'Railroad Avenue', z: null}]},
      {z: 420, names: [{name: 'Main Street', z: null}]},
      {z: 740, names: [{name: 'Sidewinder Boulevard', z: null}]},
      {z: 1060, names: [{name: 'Sunburst Avenue', z: null}]},
      {z: 1380, names: [{name: 'Canal Road', z: null}]}
    ],
    nsCol: ['Nitro Lane', 'Tumbleweed Trail', 'Skid Row', 'Hot Rod Lane', null],
    ewCol: [null, 'Jackrabbit Street', 'Takedown Avenue', 'Dust Devil Drive'],
    fwy: [{name: 'Loop 202', axis: 'ns', x: 40}, {name: 'Flats Freeway', axis: 'ew', z: 900}],
    canals: [
      {name: 'Consolidated Canal', pts: [[1528, 0], [1528, 1460]]},
      {name: 'Rattlesnake Canal', pts: [[0, 1298], [2030, 1298]]}
    ],
    // where things are (the shop's lot faces Main Street to its north)
    lm: {
      watsons: {x: 410, z: 437, label: "Watson's Flowers, Main Street"},
      grandpa: {x: 1380, z: 820, label: "Grandpa's place"},
      downtown: {x: 970, z: 330, label: 'Downtown'},
      airfield: {x: 1770, z: 260, label: 'Airfield'},
      speedway: {x: 190, z: 260, label: 'Speedway'},
      yard: {x: 340, z: 1060, label: 'Rail yard'},
      quarry: {x: 1750, z: 1250, label: 'Quarry'}
    },
    labels: [['downtown', 'Downtown'], ['airfield', 'Airfield'], ['speedway', 'Speedway'], ['yard', 'Rail Yard'], ['quarry', 'Quarry']],
    // districts by rectangle: a cell takes the first one its middle is in
    zones: [
      {x0: 650, z0: 100, x1: 1290, z1: 580, type: 'towers'},
      {x0: 1610, z0: 100, x1: 1930, z1: 420, type: 'airfield'},
      {x0: 40, z0: 100, x1: 330, z1: 420, type: 'speedway'},
      {x0: 40, z0: 900, x1: 650, z1: 1220, type: 'yard'},
      {x0: 1290, z0: 1060, x1: 2015, z1: 1448, type: 'quarry'}
    ],
    paradeZ: 120,        // the parade starts here on Gilbert Road and heads south
    boomCanal: 'Consolidated'
  };
})(typeof window !== 'undefined' ? window : globalThis);
