// Worn Gundidj CMS — the teams (tenants) that share this system, in one place.
// Used by the CMS (index.html), the client pages (intake.html, consent.html), the
// text service's link (functions-sms) and the tests, so they always agree.
//
// Each team has its own records in the cloud (teams/<id>/…), its own staff list and
// its own copy on a device. The security rules (firestore.rules) only let an account
// reach the teams it belongs to. If you add or rename a team id, change the list in
// validMember() in BOTH firestore.rules and firestore.rules.strict (the tests check).
(function (root) {
  const LIST = [
    { id: 'worngundidj', name: 'Worn Gundidj', note: 'The Worn Gundidj team’s own records.' },
    { id: 'spare', name: 'Spare team', note: 'An empty team, ready for another team to use.' },
    { id: 'test', name: 'Test team', test: true, note: 'For trying things out and training. Made-up people only — never real client information.' },
  ];
  const DEFAULT = 'worngundidj';                 // the team every account belonged to before teams existed
  const DEVICE_KEY = 'wg_active_team';           // which team this device last used (localStorage)
  const IDS = LIST.map(t => t.id);
  const valid = id => IDS.includes(id);
  const get = id => LIST.find(t => t.id === id) || null;
  const name = id => (get(id) || { name: id || '' }).name;

  // What is kept on a device is kept apart per team, so one team's records can never be
  // mixed into (or uploaded to) another's. Worn Gundidj keeps the original key prefix.
  const storagePrefix = id => 'sewb_cms_' + (id === DEFAULT || !valid(id) ? '' : id + '__');

  // Links to a client's own form:  /i#<link id>  for Worn Gundidj (as it always was),
  // /i#<team>.<link id>  for the other teams. A link id never contains a dot.
  const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
  const linkPart = (id, token) => (id === DEFAULT || !valid(id)) ? token : id + '.' + token;
  function parseLink(hash) {
    const raw = String(hash || '').replace(/^#/, '').split(/[?&]/)[0];
    const dot = raw.indexOf('.');
    const team = dot < 0 ? DEFAULT : raw.slice(0, dot), token = dot < 0 ? raw : raw.slice(dot + 1);
    if (!valid(team) || !TOKEN.test(token)) return null;
    return { team, token };
  }

  // Which team should this account open? `mine` = the teams it belongs to, `wanted` = the device's last team.
  const pick = (mine, wanted) => (Array.isArray(mine) && mine.length) ? (mine.includes(wanted) ? wanted : (mine.includes(DEFAULT) ? DEFAULT : mine[0])) : null;

  const api = { LIST, IDS, DEFAULT, DEVICE_KEY, valid, get, name, storagePrefix, linkPart, parseLink, pick };
  root.WG_TEAMS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
