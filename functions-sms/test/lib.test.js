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
  assert.match(d.sent[0].body, /^Hi Jordy, welcome to Worn Gundidj SEWB\./);
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
  assert.equal(lib.firstName({ fullName: 'Taylor "Sam" Samantha' }), 'Taylor');
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
  assert.equal(lib.firstName({ fullName: 'Zoë Smith' }), 'Zoe');
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
