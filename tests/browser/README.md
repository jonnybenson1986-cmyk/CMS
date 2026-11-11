# Browser tests

End-to-end checks of the CMS in a real Chromium, against `fakecloud.js` — a
stand-in for Firebase that holds only made-up data (no real client data, no
network). The site is served from `site/`.

```bash
node tests/browser/smoke.cjs            # every page and client-file section opens
node tests/browser/regression.cjs       # counting rules, Log Session, second worker
node tests/browser/familyviolence.cjs   # Family Violence session type → SEWB
node tests/browser/datahealth.cjs       # Data Health score, scorecard, document types
node tests/browser/email.cjs            # Email page: inbox, read, reply, send (Microsoft Graph is stubbed)
node tests/browser/vpr.cjs              # Vulnerable Persons Register: screening, auto add/remove, Admin page
node --test tests/unit/data-health.test.js   # the scoring engine on its own (no browser)
node --test tests/unit/vpr.test.js           # the VPR rules on their own (no browser)
```

Needs Playwright (`npm i -g playwright` or a local install) and its Chromium
(set `CHROME_PATH` to use another one). Each file prints PASS/FAIL lines and a
`RESULT: n/m passed` summary.

`fixtures-old-completeness.js` is the previous hard-coded "items missing" check,
kept only so `datahealth.cjs` can prove the schema-driven version gives the same
answers.
