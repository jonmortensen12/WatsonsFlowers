/* Watson's Flowers - Rattlesnake Ridge, the made-up town.

   The Mesa-Gilbert map is where the family really lived: flat, and every
   road dead straight. This one is for driving, the way the big open-world
   racers lay a town out: curving roads, hills, a mountain pass, a mesa to
   climb, crests to fly off. It goes through the same builder (WMap.build)
   as the real one, so the orders, the traffic, the computer vans and the
   routing all work the same.

   - Downtown: a little grid of towers and alleys round Gilbert Road and
     Main Street, in the valley.
   - Rattlesnake Pass: hairpins up over the ridge north of town and down
     onto the mesa.
   - The airfield, up on the mesa: a runway with a mega ramp each way.
     Mesa Grade climbs up to it from the east end of Main.
   - Rollercoaster Road: over the southern hills, crest after crest.
   - The river and the lake, the speedway, the rail yard and the quarry
     (dug into a pit), the freeway sweeping round the south of town.

   Nothing here is a real place. Coordinates in metres: x east, z south. */
(function(root){
  var W = 2400, H = 1800;
  // smooth value noise, the same everywhere
  function hash(i, j){ var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, z){
    var i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function fbm(x, z){ return vnoise(x / 230, z / 230) + 0.45 * vnoise(x / 95 + 7, z / 95 + 3) + 0.18 * vnoise(x / 41 + 2, z / 41 + 9); }
  function sm(t){ t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  // 1 inside the rectangle, fading to 0 over `soft` metres outside it
  function rect(x, z, x0, z0, x1, z1, soft){
    var dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    return 1 - sm(Math.hypot(dx, dz) / soft);
  }
  function terrain(x, z){
    // rolling hills everywhere...
    var h = Math.max(-1, (fbm(x, z) - 0.55) * 30);   // (no hollow deep enough to show the water under the map)
    // ...higher in the south, where Rollercoaster Road runs
    h += sm((z - 1300) / 250) * 10 * fbm(x * 1.7 + 50, z * 1.7);
    // the valley floor: the town, the river and the lake are flat
    var flat = Math.max(rect(x, z, 260, 360, 1960, 1290, 110), rect(x, z, 150, 100, 720, 1800, 70));
    h *= 1 - flat;
    // the ridge north of town
    var ridge = sm((330 - z) / 260) * (1 - rect(x, z, 250, 100, 720, 330, 60));
    h += ridge * (38 + 26 * fbm(x * 0.7, z * 0.7));
    // the mesa: a flat top 26 m up, steep sides
    var mesa = rect(x, z, 1790, 120, 2330, 520, 55);
    h = h * (1 - mesa) + mesa * (26 + 1.5 * vnoise(x / 60, z / 60));
    // the quarry: a pit
    var pit = rect(x, z, 1990, 1275, 2325, 1685, 50);
    h = h * (1 - pit) - 14 * pit;
    // down to the plain at the edge of the world
    var e = sm(Math.min(x, W - x, z, H - z) / 90);
    return h * e;
  }

  var J = {
    mw: [230, 870], gn: [1050, 380], g1: [1050, 740], g2: [1050, 850], g3: [1050, 960],
    c1: [1200, 740], c2: [1200, 850], c3: [1200, 960],
    gf: [1050, 1290], gs: [1050, 1480], me: [1720, 820],
    rf: [210, 1195], rr: [235, 1540], df: [1530, 1265], dr: [1530, 1560]
  };

  root.WGEO_RIDGE = {
    note: 'Invented. Rattlesnake Ridge is not a real town.',
    name: 'Rattlesnake Ridge', size: [W, H], origin: [1050, 850],
    terrain: terrain,
    junctions: J,
    roads: [
      {name: 'Main Street', kind: 'art', pts: ['mw', [420, 862], [700, 850], 'g2', 'c2', [1380, 850], [1560, 862], 'me', [1860, 872], [2010, 905]]},
      {name: 'Gilbert Road', kind: 'art', pts: ['gn', 'g1', 'g2', 'g3', 'gf', 'gs']},
      {name: 'First Avenue', kind: 'col', pts: [[905, 740], 'g1', 'c1', [1315, 740]]},
      {name: 'Second Avenue', kind: 'col', pts: [[905, 960], 'g3', 'c3', [1315, 960]]},
      {name: 'Center Street', kind: 'col', pts: ['c1', 'c2', 'c3']},
      {name: 'Superstition Freeway', kind: 'fwy', pts: [[20, 1188], 'rf', [500, 1225], [800, 1262], 'gf', [1300, 1293], 'df', [1800, 1180], [2050, 1085], [2380, 1050]]},
      {name: 'River Road', kind: 'art', pts: [[205, 70], [190, 400], 'mw', 'rf', 'rr', [250, 1775]]},
      {name: 'Rattlesnake Pass', kind: 'art', pts: ['gn', [1000, 330], [925, 282], [990, 232], [1160, 214], [1232, 170], [1140, 126], [1250, 82], [1480, 72], [1660, 118], [1755, 205], [1782, 300]]},
      {name: 'Mesa Grade', kind: 'col', pts: ['me', [1792, 742], [1722, 662], [1832, 600], [1902, 560], [1962, 515]]},
      {name: 'Rollercoaster Road', kind: 'art', pts: ['rr', [420, 1562], [650, 1602], [850, 1562], 'gs', [1250, 1542], 'dr', [1750, 1562], [1945, 1480]],
        crests: [{at: 0.11, h: 5, w: 20}, {at: 0.23, h: 6, w: 22}, {at: 0.36, h: 5, w: 20}, {at: 0.58, h: 6, w: 22}, {at: 0.67, h: 5, w: 20}, {at: 0.88, h: 6, w: 22}]},
      {name: 'Depot Street', kind: 'col', pts: ['df', 'dr']}
    ],
    // the districts: flat pads beside the roads (the type says what is built)
    pockets: [
      {x0: 650, z0: 868, x1: 790, z1: 960, type: 'watsons'},
      {x0: 330, z0: 890, x1: 640, z1: 1160, type: 'grandpa'},
      {x0: 330, z0: 600, x1: 640, z1: 836, type: 'homes'},
      {x0: 660, z0: 420, x1: 880, z1: 836, type: 'homes'},
      {x0: 660, z0: 975, x1: 1036, z1: 1225, type: 'homes'},
      {x0: 1340, z0: 560, x1: 1660, z1: 826, type: 'homes'},
      {x0: 1340, z0: 880, x1: 1700, z1: 1185, type: 'homes'},
      {x0: 1760, z0: 925, x1: 1990, z1: 1045, type: 'homes'},
      {x0: 1080, z0: 1320, x1: 1500, z1: 1510, type: 'homes'},
      {x0: 660, z0: 1310, x1: 1036, z1: 1460, type: 'homes'},
      {x0: 900, z0: 750, x1: 1036, z1: 836, type: 'towers'},
      {x0: 900, z0: 864, x1: 1036, z1: 950, type: 'towers'},
      {x0: 1064, z0: 750, x1: 1190, z1: 836, type: 'towers'},
      {x0: 1210, z0: 750, x1: 1320, z1: 836, type: 'towers'},
      {x0: 1064, z0: 864, x1: 1190, z1: 950, type: 'towers'},
      {x0: 1210, z0: 864, x1: 1320, z1: 950, type: 'towers'},
      {x0: 900, z0: 560, x1: 1036, z1: 730, type: 'towers'},
      {x0: 1064, z0: 560, x1: 1320, z1: 730, type: 'towers'},
      {x0: 1064, z0: 970, x1: 1320, z1: 1150, type: 'park'},
      {x0: 1800, z0: 140, x1: 2320, z1: 500, type: 'airfield'},
      {x0: 330, z0: 1265, x1: 640, z1: 1520, type: 'speedway'},
      {x0: 1580, z0: 1320, x1: 1880, z1: 1500, type: 'yard'},
      {x0: 1990, z0: 1275, x1: 2325, z1: 1685, type: 'quarry'}
    ],
    canals: [{name: 'Rattlesnake River', pts: [[330, 300], [285, 420], [270, 700], [282, 1000], [266, 1300], [276, 1600], [282, 1800]]}],
    ponds: [{x: 480, z: 220, rx: 170, rz: 82}],
    lm: {
      watsons: {x: 715, z: 868, label: "Watson's Flowers, Main Street"},
      grandpa: {x: 360, z: 1000, label: "Grandpa's place"},
      downtown: {x: 1130, z: 655, label: 'Downtown'},
      airfield: {x: 2060, z: 320, label: 'Airfield'},
      speedway: {x: 485, z: 1392, label: 'Speedway'},
      yard: {x: 1730, z: 1410, label: 'Rail yard'},
      quarry: {x: 2157, z: 1480, label: 'Quarry'},
      lake: {x: 480, z: 220, label: 'Rattlesnake Lake'},
      pass: {x: 1190, z: 150, label: 'Rattlesnake Pass'}
    },
    labels: [['downtown', 'Downtown'], ['airfield', 'Airfield'], ['speedway', 'Speedway'], ['yard', 'Rail Yard'], ['quarry', 'Quarry'], ['lake', 'Rattlesnake Lake'], ['pass', 'Rattlesnake Pass']],
    paradeZ: 600,        // the parade starts here on Gilbert Road and heads south through downtown
    boomCanal: 'Rattlesnake River',
    scatter: 1400        // saguaros and brush on the open ground
  };
})(typeof window !== 'undefined' ? window : globalThis);
