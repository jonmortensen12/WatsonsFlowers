# Watson's Flowers

## Git workflow

Solo project, no collaborators — work directly on `main`. Commit and push
straight to `main`, no feature branches or PRs needed. Cloudflare Workers
deploys from `main` on every push, so anything on another branch is not
live, and a change has to work before it is committed.

## Start here

Read `HANDOFF.md` before making any non-trivial change — the map (what is
real and what is invented), the jobs, the day, the driving numbers and the
phone protocol.

## The game lives in `web/`

`web/` is the only directory Cloudflare uploads. The check scripts, the
OpenStreetMap download, the tools and the notes beside it stay in the repo
and off the internet. Run the checks from the repo root.

## Before shipping

```
node simcheck.mjs          # the simulation, headless: handling, crashes, canal jumps, whole days, parade (~1 min)
node netcheck.mjs          # the TV and six phones in Chromium over ?local=1, every job (several minutes)
python3 tools/bake.py      # regenerate web/geo.js after re-fetching tools/osm/roads.json
node tools/art.mjs         # redraw the icons and link preview
```

`web/sim.js` decides everything that happens and draws nothing; `web/map.js`
builds the town for the sim, the TV and the dispatcher's phone alike. Change
the driving, the orders or the map there and `simcheck` says whether the
computer vans still deliver and the vans still feel quick.
