// Teams (site/teams.js): ids, device storage per team, and the team inside a client's form link.
const test = require('node:test'), assert = require('node:assert');
const T = require('../../site/teams.js');
const L = 'AbCdEfGhIjKlMnOpQrStUv';

test('three teams: Worn Gundidj, a spare team and a test team; only the test team is marked as a test', () => {
  assert.deepEqual(T.IDS, ['worngundidj', 'spare', 'test']);
  assert.equal(T.DEFAULT, 'worngundidj');
  assert.deepEqual(T.LIST.filter(t => t.test).map(t => t.id), ['test']);
  assert.equal(T.name('test'), 'Test team'); assert.equal(T.name('spare'), 'Spare team'); assert.equal(T.name('worngundidj'), 'Worn Gundidj');
  assert.ok(T.valid('spare')); assert.ok(!T.valid('other')); assert.ok(!T.valid('')); assert.ok(!T.valid(undefined));
});
test('each team has its own copy on a device; Worn Gundidj keeps the keys it always had', () => {
  assert.equal(T.storagePrefix('worngundidj'), 'sewb_cms_');
  assert.equal(T.storagePrefix('test'), 'sewb_cms_test__');
  assert.equal(T.storagePrefix('spare'), 'sewb_cms_spare__');
  assert.equal(new Set(T.IDS.map(T.storagePrefix)).size, T.IDS.length);
  // no team's keys can collide with another's: a Worn Gundidj key never starts with another team's prefix
  for (const k of ['clients', 'notes', 'test', 'spare', 'testclients']) for (const id of ['test', 'spare']) assert.ok(!(T.storagePrefix('worngundidj') + k).startsWith(T.storagePrefix(id)), k);
  assert.equal(T.storagePrefix('nonsense'), 'sewb_cms_');
});
test('form links: Worn Gundidj links are unchanged; other teams carry the team; both parse back', () => {
  assert.equal(T.linkPart('worngundidj', L), L);
  assert.equal(T.linkPart('test', L), 'test.' + L);
  for (const id of T.IDS) assert.deepEqual(T.parseLink('#' + T.linkPart(id, L)), { team: id, token: L });
  assert.deepEqual(T.parseLink(L), { team: 'worngundidj', token: L });
  assert.deepEqual(T.parseLink('#test.' + L + '?x=1'), { team: 'test', token: L });
});
test('form links: an unknown team, a short or odd link id, or junk is refused', () => {
  for (const bad of ['', '#', '#other.' + L, '#test.short', '#test.' + L + '.more', '#.' + L, '#test.', '#TEST.' + L, '#../' + L, '#test/' + L, '#' + 'x'.repeat(65)])
    assert.equal(T.parseLink(bad), null, bad);
});
test('which team an account opens: the device\'s last team if it is theirs, else Worn Gundidj if theirs, else their first; none → nothing', () => {
  assert.equal(T.pick(['worngundidj', 'test'], 'test'), 'test');
  assert.equal(T.pick(['worngundidj', 'test'], 'spare'), 'worngundidj');
  assert.equal(T.pick(['test'], 'worngundidj'), 'test');
  assert.equal(T.pick(['spare', 'test'], 'worngundidj'), 'spare');
  assert.equal(T.pick([], 'worngundidj'), null);
  assert.equal(T.pick(undefined, 'worngundidj'), null);
});
test('the Worn Gundidj logo: shown for Worn Gundidj and the Test team, not for the Spare team', () => {
  assert.equal(T.showLogo('worngundidj'), true);
  assert.equal(T.showLogo('test'), true);
  assert.equal(T.showLogo('spare'), false);
  assert.equal(T.showLogo('unknown'), true);      // an unknown id falls back to Worn Gundidj
});
