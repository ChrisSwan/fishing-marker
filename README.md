# Fishing Marker (prototype)

Phone web app that marks bait spots on a lake as ratios between the near/far bank lines (r) and two far-bank anchor trees (s), on a frozen camera frame.

- Run tests: `node tests/run-node.mjs` (or open `tests/test.html` via the dev server)
- End-to-end smoke test: `node tools/smoke.mjs` (headless Chrome/Edge, fake camera; `SMOKE_SHOT=shot.png` saves a screenshot)
- Dev server: `node tools/serve.mjs` → http://localhost:8080/ (localhost allows camera access)
- Deploy: push to `main`; GitHub Pages serves the repo root. Bump `VERSION` in `js/version.js` **and** `sw.js` on each release.

Design spec and plan live in the owner's notes vault (11_Fishing_Marker/docs).
