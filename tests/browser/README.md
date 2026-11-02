# Browser tests

End-to-end checks of the CMS in a real Chromium, against `fakecloud.js` — a
stand-in for Firebase that holds only made-up data (no real client data, no
network). The site is served from `site/`.

```bash
node tests/browser/smoke.cjs            # every page and client-file section opens
node tests/browser/regression.cjs       # counting rules, Log Session, second worker
node tests/browser/familyviolence.cjs   # Family Violence session type → SEWB
```

Needs Playwright (`npm i -g playwright` or a local install) and its Chromium
(set `CHROME_PATH` to use another one). Each file prints PASS/FAIL lines and a
`RESULT: n/m passed` summary.
