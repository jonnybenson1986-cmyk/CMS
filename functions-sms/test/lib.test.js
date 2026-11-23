// Unit tests for the handbook-text decision logic and provider requests.
// Run: cd functions-sms && node --test     (no Firebase, no network)
const test = require('node:test');
const assert = require('node:assert');
const lib = require('../lib');

const URL_ = 'https://cms.example.org/handbook/SEWB-Participant-Handbook.pdf';
const STAFF = new Set(['jon.benson@worngundidj.org.au']);
function deps(over) {
  const sent = [];
  const d = Object.assign({
    handbookUrl: URL_, getRequesterEmail: async () => 'Jon.Benson@worngundidj.org.au', getStaffEmails: async () => STAFF,
    getClient: async () => ({ fullName: 'Jordan Citizen', preferredName: 'Jordy', phone: '0491 570 156', ifSafeContact: 'Yes' }),
    alreadySent: async () => false, sentInLastHour: async () => 0, monthSpend: async () => 0,
    send: async (to, body) => { sent.push({ to, body }); return 'MSG123'; },
  }, over || {});
  d.sent = sent; return d;
}

test('sends to the client mobile from the record, in +61 format, with the template text', async () => {
  const d = deps(); const r = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d);
  assert.equal(r.status, 'sent'); assert.equal(r.to, '0491 ••• 156'); assert.equal(r.providerId, 'MSG123');
  assert.equal(d.sent.length, 1); assert.equal(d.sent[0].to, '+61491570156');
  assert.match(d.sent[0].body, /^Hi Jordy, welcome to Worn Gundidj\./);
  assert.ok(d.sent[0].body.includes(URL_)); assert.ok(!/Citizen|0491/.test(d.sent[0].body));
});
test('request text or numbers from the browser are ignored (only clientId is used)', async () => {
  const d = deps(); await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1', to: '+61400000000', body: 'spam' }, d);
  assert.equal(d.sent[0].to, '+61491570156'); assert.ok(!/spam/.test(d.sent[0].body));
});
test('not staff → not sent', async () => {
  const d = deps({ getRequesterEmail: async () => 'stranger@example.com' });
  const r = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u9' }, d);
  assert.equal(r.status, 'skipped'); assert.match(r.reason, /not in the staff directory/); assert.equal(d.sent.length, 0);
});
test('anonymous / unknown account → not sent', async () => {
  const d = deps({ getRequesterEmail: async () => '' });
  assert.equal((await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'anon' }, d)).status, 'skipped');
  assert.equal(d.sent.length, 0);
});
test('no consent to texts → not sent', async () => {
  const d = deps({ getClient: async () => ({ fullName: 'A B', phone: '0491570156', ifSafeContact: 'No' }) });
  const r = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d);
  assert.equal(r.status, 'skipped'); assert.match(r.reason, /not agreed to texts/); assert.equal(d.sent.length, 0);
});
test('landline → not sent', async () => {
  const d = deps({ getClient: async () => ({ fullName: 'A B', phone: '03 5561 0000', ifSafeContact: 'Yes' }) });
  assert.match((await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d)).reason, /mobile/);
  assert.equal(d.sent.length, 0);
});
test('already sent to this number → not sent again', async () => {
  const d = deps({ alreadySent: async () => true });
  assert.match((await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d)).reason, /already sent/);
  assert.equal(d.sent.length, 0);
});
test('hourly cap stops a flood', async () => {
  const d = deps({ sentInLastHour: async () => lib.HOURLY_CAP });
  assert.equal((await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d)).status, 'failed');
  assert.equal(d.sent.length, 0);
});
test('missing HANDBOOK_URL → fails safely, nothing sent', async () => {
  const d = deps({ handbookUrl: '' });
  assert.match((await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d)).reason, /HANDBOOK_URL/);
  assert.equal(d.sent.length, 0);
});
test('provider error is recorded as failed', async () => {
  const d = deps({ send: async () => { throw new Error('insufficient credit'); } });
  const r = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d);
  assert.equal(r.status, 'failed'); assert.match(r.reason, /insufficient credit/);
});
test('first name is cleaned (no quotes, symbols or long text)', () => {
  assert.equal(lib.firstName({ fullName: 'Taylor "Sam" Samantha' }), 'Samantha');   // surname first; the quoted nickname is ignored
  assert.equal(lib.firstName({ preferredName: '<b>Jo</b>', fullName: 'x' }), 'Jo');
  assert.equal(lib.firstName({ fullName: '' }), 'there');
});
test('mobile formats', () => {
  assert.deepEqual(['+61 491 570 156', '491570156', '0491-570-156', '03 5561 5315'].map(lib.auMobile), ['0491570156', '0491570156', '0491570156', '']);
});
test('ClickSend request and response handling', async () => {
  const calls = [];
  const fetchOk = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ response_code: 'SUCCESS', data: { messages: [{ status: 'SUCCESS', message_id: 'CS1' }] } }) }; };
  const id = await lib.sendViaProvider('clicksend', { username: 'u', apiKey: 'k', from: 'WornGundidj' }, '+61491570156', 'hi', fetchOk);
  assert.equal(id, 'CS1'); assert.equal(calls[0].url, 'https://rest.clicksend.com/v3/sms/send');
  assert.equal(calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('u:k').toString('base64'));
  assert.deepEqual(JSON.parse(calls[0].init.body).messages[0], { source: 'wg-cms', from: 'WornGundidj', to: '+61491570156', body: 'hi' });
  const fetchBad = async () => ({ ok: true, status: 200, json: async () => ({ response_code: 'SUCCESS', data: { messages: [{ status: 'INVALID_RECIPIENT' }] } }) });
  await assert.rejects(lib.sendViaProvider('clicksend', { username: 'u', apiKey: 'k', from: 'x' }, '+61491570156', 'hi', fetchBad), /INVALID_RECIPIENT/);
});
test('Twilio request and response handling', async () => {
  const calls = [];
  const fetchOk = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201, json: async () => ({ sid: 'SM1', status: 'queued' }) }; };
  const id = await lib.sendViaProvider('twilio', { username: 'AC1', apiKey: 't', from: '+61400000000' }, '+61491570156', 'hi', fetchOk);
  assert.equal(id, 'SM1'); assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  assert.equal(new URLSearchParams(calls[0].init.body).get('To'), '+61491570156');
  await assert.rejects(lib.sendViaProvider('twilio', { username: 'AC1', apiKey: 't', from: 'x' }, '+61491570156', 'hi', async () => ({ ok: false, status: 401, json: async () => ({ message: 'Authenticate' }) })), /401/);
});
test('unknown provider is refused', () => { assert.throws(() => lib.providerRequest('nope', {}, '+61', 'x'), /Unknown SMS_PROVIDER/); });

test('every text is plain GSM and ONE SMS (160 chars) — the old dash made it 4', () => {
  const long = 'https://candid-trifle-167698.netlify.app/handbook/SEWB-Participant-Handbook.pdf';
  for (const url of ['https://candid-trifle-167698.netlify.app/hb', long]) {
    for (const name of ['Jo', 'Maximiliana-Bartholomew', 'Zoë', '<b>x</b>']) {
      const m = lib.handbookMessage({ fullName: name + ' Citizen' }, url);
      assert.equal(lib.smsParts(m), 1, m); assert.ok(m.includes(url)); assert.equal(lib.toGsm(m), m);
    }
  }
  const i = lib.intakeMessage({ fullName: 'Maximiliana-Bartholomew Smith' }, 'https://candid-trifle-167698.netlify.app/i#AbCdEfGhIjKlMnOpQrStUv', 7);
  assert.equal(lib.smsParts(i), 1, i);
  assert.equal(lib.smsParts('a\u2014b'), 1); assert.equal(lib.smsParts('x'.repeat(71) + '\u2014'), 2);   // UCS-2: 70 per SMS
  assert.equal(lib.smsParts('x'.repeat(161)), 2); assert.equal(lib.toGsm('it\u2019s \u201Cok\u201D \u2014 fine\u2026'), 'it\'s "ok" - fine...');
  assert.equal(lib.firstName({ fullName: 'Smith Zoë' }), 'Zoe');
});
test('monthly budget: refuses a text that would go over, says so plainly', async () => {
  const d = deps({ monthSpend: async () => 9.95, monthlyBudget: 10, costPerPart: 0.10 });
  const r = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, d);
  assert.equal(r.status, 'skipped'); assert.match(r.reason, /Monthly SMS budget of \$10\.00 reached \(\$9\.95 used\)/); assert.equal(d.sent.length, 0);
  const ok = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, deps({ monthSpend: async () => 9.90, monthlyBudget: 10, costPerPart: 0.10 }));
  assert.equal(ok.status, 'sent'); assert.equal(ok.parts, 1); assert.equal(ok.cost, 0.1);
  const def = await lib.processRequest({ kind: 'handbook', clientId: 'c1', requestedBy: 'u1' }, deps({ monthSpend: async () => 9.95 }));
  assert.equal(def.status, 'skipped', 'defaults to a $10 budget');
});
test('budget month is Melbourne time', () => {
  assert.equal(lib.budgetMonth(new Date('2026-10-31T14:30:00Z')), '2026-11');   // 1:30am 1 Nov in Melbourne
  assert.equal(lib.budgetMonth(new Date('2026-10-31T12:00:00Z')), '2026-10');
});

// ── teams: the link in a text opens the right team's form ──
test('team link part agrees with the CMS (site/teams.js): Worn Gundidj unchanged, other teams prefixed', () => {
  const TEAMS = require('../../site/teams.js'), L = 'AbCdEfGhIjKlMnOpQrStUv';
  for (const id of TEAMS.IDS) assert.equal(lib.teamLinkPart(id, L), TEAMS.linkPart(id, L), id);
  assert.equal(lib.teamLinkPart('worngundidj', L), L);
  assert.equal(lib.teamLinkPart('test', L), 'test.' + L);
  assert.equal(lib.teamLinkPart(undefined, L), L);
  assert.equal(lib.teamLinkPart('../evil', L), L);
  for (const id of TEAMS.IDS) assert.deepEqual(TEAMS.parseLink('#' + lib.teamLinkPart(id, L)), { team: id, token: L });
});

// ── names are recorded surname first: greet people by their first name ──
test('greeting name: preferred name, else after a comma, else the second word (names are recorded surname first)', () => {
  assert.equal(lib.firstName({ fullName: 'Burns Jason' }), 'Jason');
  assert.equal(lib.firstName({ fullName: 'Burns Jason Michael' }), 'Jason');
  assert.equal(lib.firstName({ fullName: 'Burns, Jason' }), 'Jason');
  assert.equal(lib.firstName({ fullName: 'Burns,Jason' }), 'Jason');
  assert.equal(lib.firstName({ fullName: 'Burns Jason', preferredName: 'Jase' }), 'Jase');
  assert.equal(lib.firstName({ fullName: 'Burns' }), 'Burns');
  assert.equal(lib.firstName({ fullName: '   ' }), 'there');
  assert.equal(lib.firstName({ fullName: "O'Brien Mary-Anne" }), "Mary-Anne");
});
test('greeting name: the text service and the CMS use exactly the same rule', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../site/index.html'), 'utf8');
  const grab = re => { const m = src.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
  const code = grab(/function _nameWords\(s\)[^\n]*\n/) + grab(/function clientGivenName\(c\) \{[\s\S]*?\n\}\n/);
  const cms = new Function(code + '; return clientGivenName;')();
  const cases = [{ fullName: 'Burns Jason' }, { fullName: 'Burns, Jason' }, { fullName: 'Burns Jason Michael' }, { fullName: 'Burns' }, { fullName: 'Burns Jason', preferredName: 'Jase' },
    { fullName: 'Taylor "Sam" Samantha' }, { fullName: '<b>Smith</b> Zoe' }, { fullName: '' }, { fullName: 'Lee,  Ann  Marie' }, { preferredName: '  ', fullName: 'Ng Tom' }];
  for (const c of cases) assert.equal(lib.givenName(c), cms(c), JSON.stringify(c));
});

// ---- two-way texts ----
test('a worker\'s message: sent to the number on file, words tidied, typographic dashes/quotes made plain', async () => {
  const d = deps(), sent = d.sent;
  const r = await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: '  Hi Jordy — see you at 2pm “tomorrow”?  \n\n\n\n- Sam  ', to: '0400000000' }, d);
  assert.equal(r.status, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '+61491570156');
  assert.equal(sent[0].body, 'Hi Jordy - see you at 2pm "tomorrow"?\n\n- Sam');
  assert.equal(r.message, sent[0].body);
  assert.equal(r.parts, 1);
});
test('a worker\'s message: empty or too long is not sent; consent and the staff check still apply', async () => {
  let d = deps(), sent = d.sent;
  assert.match((await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: '   ' }, d)).reason, /empty/);
  assert.match((await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: 'x'.repeat(641) }, d)).reason, /too long/);
  assert.match((await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: '\u{1F600}'.repeat(140) }, d)).reason, /too long/);  // emoji → UCS-2 → 5 SMS
  assert.equal(sent.length, 0);
  d = deps({ getClient: async () => ({ fullName: 'X Y', phone: '0491570156', ifSafeContact: 'No' }) }); sent = d.sent;
  assert.match((await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: 'Hi' }, d)).reason, /not agreed to texts/);
  d = deps({ getRequesterEmail: async () => 'stranger@example.com' }); sent = d.sent;
  assert.match((await lib.processRequest({ kind: 'message', clientId: 'c1', requestedBy: 'u1', body: 'Hi' }, d)).reason, /staff directory/);
  assert.equal(sent.length, 0);
});
test('a client who replied STOP gets no texts of any kind', async () => {
  const d = deps({ isOptedOut: async (m) => m === '0491570156' }), sent = d.sent;
  for (const req of [{ kind: 'message', body: 'Hi' }, { kind: 'handbook' }]) {
    const r = await lib.processRequest(Object.assign({ clientId: 'c1', requestedBy: 'u1' }, req), d);
    assert.equal(r.status, 'skipped'); assert.match(r.reason, /replied STOP/);
  }
  assert.equal(sent.length, 0);
});
test('Twilio signature: matches Twilio\'s published example, and any change breaks it', () => {
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  const p = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
  assert.equal(lib.twilioSignature('12345', url, p), '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  assert.ok(lib.validTwilioSignature('12345', ['https://other.example/x', url], p, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
  assert.ok(!lib.validTwilioSignature('12345', [url], Object.assign({}, p, { Digits: '9999' }), '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
  assert.ok(!lib.validTwilioSignature('12345', [url + '&team=spare'], p, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
  assert.ok(!lib.validTwilioSignature('wrong', [url], p, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
  assert.ok(!lib.validTwilioSignature('12345', [url], p, ''));
  assert.ok(!lib.validTwilioSignature('', [url], p, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='));
});
test('STOP / START words; ordinary replies are not', () => {
  for (const w of ['STOP', 'stop', ' Stop. ', 'UNSUBSCRIBE', 'Cancel', 'quit', 'STOP ALL']) assert.equal(lib.optOutWord(w), 'stop', w);
  for (const w of ['START', 'start', 'Unstop']) assert.equal(lib.optOutWord(w), 'start', w);
  for (const w of ['Yes', 'No', 'stop calling me at work please', 'ok thanks', '']) assert.equal(lib.optOutWord(w), '', w);
});
test('a reply is matched to the client last texted at that number, else the one client with it', async () => {
  const base = { MessageSid: 'SM0123456789abcdef0123456789abcdef', From: '+61491570156', To: '+61400000001', Body: 'Thanks, see you then', NumMedia: '0' };
  const dep = (o) => Object.assign({ lastTextTo: async () => [], clientsWithMobile: async () => [], clientHasMobile: async () => true }, o);
  let r = await lib.processInbound(base, dep({ lastTextTo: async () => [{ clientId: 'old', at: '2026-01-01' }, { clientId: 'c1', at: '2026-11-01' }] }));
  assert.equal(r.id, base.MessageSid); assert.equal(r.doc.clientId, 'c1'); assert.equal(r.doc.matchedBy, 'last-text');
  assert.equal(r.doc.fromFull, '0491570156'); assert.equal(r.doc.from, '0491 ••• 156'); assert.equal(r.doc.status, 'new'); assert.equal(r.doc.body, 'Thanks, see you then');
  // the last client texted no longer has that number → fall back to the phone on file
  r = await lib.processInbound(base, dep({ lastTextTo: async () => [{ clientId: 'moved', at: '2026-11-01' }], clientHasMobile: async (id) => id !== 'moved', clientsWithMobile: async () => [{ id: 'c2', status: 'active' }] }));
  assert.equal(r.doc.clientId, 'c2'); assert.equal(r.doc.matchedBy, 'phone');
  // two files with the number: the active one wins; two active → unmatched, with both as candidates
  r = await lib.processInbound(base, dep({ clientsWithMobile: async () => [{ id: 'a', status: 'closed' }, { id: 'b', status: 'active' }] }));
  assert.equal(r.doc.clientId, 'b');
  r = await lib.processInbound(base, dep({ clientsWithMobile: async () => [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }] }));
  assert.equal(r.doc.clientId, ''); assert.deepEqual(r.doc.candidates, ['a', 'b']);
  // unknown or overseas number → unmatched
  r = await lib.processInbound(Object.assign({}, base, { From: '+14155550100' }), dep());
  assert.equal(r.doc.clientId, ''); assert.equal(r.doc.fromFull, '+14155550100');
  assert.equal((await lib.processInbound(Object.assign({}, base, { MessageSid: '' }), dep())).error, 'No message id');
  assert.equal((await lib.processInbound(Object.assign({}, base, { Body: 'x'.repeat(5000) }), dep())).doc.body.length, 1600);
});
