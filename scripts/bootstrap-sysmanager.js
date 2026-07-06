#!/usr/bin/env node
// One-time bootstrap: grant the FIRST sysmanager role.
//
// setUserRole (the Cloud Function) only accepts calls from an existing
// sysmanager — a chicken-and-egg problem for the very first one. This script
// runs on YOUR machine with owner credentials and sets the claim directly.
//
// Usage:
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → save as serviceAccount.json (KEEP PRIVATE,
//      never commit it — it grants full project access).
//   2. npm install firebase-admin
//   3. node scripts/bootstrap-sysmanager.js serviceAccount.json jonny@example.com "Jon Benson"
//   4. Delete serviceAccount.json when done.
//
// After this, manage all other roles with the setUserRole callable (or re-run
// this script).

const path = require('path');
const admin = require('firebase-admin');

const [, , keyFile, email, name] = process.argv;
if (!keyFile || !email) {
  console.error('Usage: node bootstrap-sysmanager.js <serviceAccount.json> <email> ["Display Name"]');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyFile))),
});

const TEAM = 'worngundidj';

(async () => {
  const user = await admin.auth().getUserByEmail(email);
  const claims = { role: 'sysmanager', name: name || user.displayName || email.split('@')[0] };
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await admin.firestore().collection('teams').doc(TEAM).collection('roles').doc(user.uid).set({
    email,
    ...claims,
    updatedBy: 'bootstrap script',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✅ ${email} is now sysmanager (name claim: "${claims.name}").`);
  console.log('   They must sign OUT and back IN for the new role to take effect.');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
