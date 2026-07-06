// Worn Gundidj CMS — role management via Firebase custom claims.
//
// Why this exists (security audit findings #2/#3): the app previously kept the
// staff role in a localStorage profile, which anyone can edit in devtools.
// These functions put the role in the user's ID token (custom claims), where
// only this trusted server code can set it and Firestore/Storage rules can
// enforce it.
//
// Deploy:   firebase deploy --only functions
// Region:   australia-southeast1 (same as Firestore — data stays in Sydney)
//
// First-time setup: no user has the 'sysmanager' claim yet, so setUserRole
// would reject everyone. Run scripts/bootstrap-sysmanager.js once (see
// SECURITY-DEPLOY.md) to grant the first sysmanager, then manage roles
// through setUserRole.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const REGION = 'australia-southeast1';
const TEAM = 'worngundidj';
const ROLES = ['sysmanager', 'admin', 'supervisor', 'worker', 'reception'];

function db() { return admin.firestore(); }

// Server-side audit entry — actor comes from the verified token, not the client.
async function auditServer(action, detail, token) {
  await db().collection('teams').doc(TEAM).collection('auditlog').add({
    ts: new Date().toISOString(),
    worker: (token && (token.name || token.email)) || 'system',
    role: (token && token.role) || '',
    action,
    detail,
    page: 'cloud-function',
    server: true,
  });
}

// setUserRole — callable by an existing sysmanager only.
// data: { email: 'staff@org.au', role: 'worker', name: 'Jade Atkinson' }
// `name` must match the display name used inside the CMS (client records store
// assignedWorkers/keyWorker by name), otherwise per-worker rules won't match.
exports.setUserRole = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (req.auth.token.role !== 'sysmanager') {
    throw new HttpsError('permission-denied', 'Only a System Manager can change roles.');
  }
  const { email, role, name } = req.data || {};
  if (!email || !ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `Need email and role (one of: ${ROLES.join(', ')}).`);
  }
  const user = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!user) throw new HttpsError('not-found', `No Firebase account for ${email}.`);

  const claims = {
    role,
    name: name || user.displayName || email.split('@')[0],
  };
  await admin.auth().setCustomUserClaims(user.uid, claims);

  // Mirror to Firestore so the app can show who has what role. Rules make this
  // collection read-only to clients — only this Admin-SDK code writes it.
  await db().collection('teams').doc(TEAM).collection('roles').doc(user.uid).set({
    email,
    ...claims,
    updatedBy: req.auth.token.email || req.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await auditServer('Role changed', `${email} → ${role} (name: ${claims.name})`, req.auth.token);
  return { ok: true, uid: user.uid, ...claims };
});

// listStaff — lets sysmanager/admin see every account and its claim role.
exports.listStaff = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!['sysmanager', 'admin'].includes(req.auth.token.role)) {
    throw new HttpsError('permission-denied', 'Managers only.');
  }
  const out = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((u) => out.push({
      uid: u.uid,
      email: u.email,
      name: (u.customClaims && u.customClaims.name) || u.displayName || '',
      role: (u.customClaims && u.customClaims.role) || '(none)',
      disabled: u.disabled,
      lastSignIn: u.metadata.lastSignInTime,
    }));
    pageToken = page.pageToken;
  } while (pageToken);
  return { users: out };
});

// New accounts default to the least-privileged real role. A sysmanager
// promotes them with setUserRole afterwards.
exports.onNewUser = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    const claims = {
      role: 'worker',
      name: user.displayName || (user.email || '').split('@')[0],
    };
    await admin.auth().setCustomUserClaims(user.uid, claims);
    await db().collection('teams').doc(TEAM).collection('roles').doc(user.uid).set({
      email: user.email || '',
      ...claims,
      updatedBy: 'onNewUser (default)',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await auditServer('Account created', `${user.email} defaulted to role: worker`, null);
  });
