// Worn Gundidj CMS — Data Health: how complete is one client's file, 0–100%.
//
// One schema says what a file should hold. Everything else reads it:
//   • the Data Health score and scorecard on the client file,
//   • the "items missing on this file" banner and the dashboard roll-up
//     (items carrying a `flag` — see fileCompleteness() in index.html).
//
// TO ADD A FIELD: add one line to a section's `items` below. No other code
// changes. Each item has an `id`, a `label`, a `level` (its weight — see
// WEIGHTS) and ONE rule saying when it counts as done:
//   has:   'field'            the field is filled in ('a.b' reaches inside)
//   anyOf: ['a','b']          at least one of these fields is filled in
//   allOf: ['a','b']          every one of these fields is filled in
//   doc:   'consent'          a file of that document type is attached (DOC_TYPES)
//   test:  (c, h) => true     anything else; return true/false
//   ratio: (c, h) => 0..1     part-credit (e.g. 5 of 8 domains assessed)
// Optional on an item or a whole section:
//   when:  'aod'  or  (c, h) => bool    only applies to some clients (a
//                                        conditional block); skipped otherwise
//   tab:   'goals'                       where "Fix →" takes the worker (a file
//                                        section, or 'edit' for the Edit details form)
//   flag / short / flagLabel             also raise it in the missing-items banner
//
// `c` is the client record. `h` is a small set of helpers the CMS passes in
// (goal, home-risk and handbook checks, today's date). The module itself has no
// dependencies, so it runs the same in the browser and in Node (tests).
(function (root) {
  'use strict';

  // How much each level is worth. Change a number here to re-weight every item of that level.
  const WEIGHTS = { critical: 3, required: 2, recommended: 1 };

  // Score bands, highest first. `min` is the lowest score in the band.
  const BANDS = [
    { min: 90, key: 'excellent', label: 'Excellent',  color: '#16a34a' },
    { min: 70, key: 'good',      label: 'Good',       color: '#65a30d' },
    { min: 40, key: 'fair',      label: 'Needs work', color: '#d97706' },
    { min: 0,  key: 'poor',      label: 'Incomplete', color: '#dc2626' },
  ];

  // Document types a worker can give an attached file. `match` recognises older
  // files (uploaded before types existed) from their file name.
  const DOC_TYPES = [
    { key: 'vprconsent', label: 'VPR consent form',      match: /vpr|vulnerable.?persons?/i },
    { key: 'consent',    label: 'Signed consent form',   match: /consent/i },
    { key: 'referral',   label: 'Referral',              match: /referr?al/i },
    { key: 'id',         label: 'Identification',        match: /(^|[^a-z])id([^a-z]|$)|identification|licen[cs]e|passport|medicare|birth.?cert/i },
    { key: 'ndisplan',   label: 'NDIS plan',             match: /ndis.*plan|plan.*ndis/i },
    { key: 'legal',      label: 'Court / legal order',   match: /court|order|(^|[^a-z])[if]vo([^a-z]|$)|bail|legal/i },
    { key: 'medical',    label: 'Medical / health',      match: /medical|health|(^|[^a-z])gp([^a-z]|$)|discharge|mental/i },
    { key: 'assessment', label: 'Assessment / report',   match: /assessment|report|k10|screen/i },
    { key: 'other',      label: 'Other',                 match: null },
  ];

  // The AOD fields this system holds that the Victorian Alcohol and Drug
  // Collection needs — confirm against your VADC pre-flight list and add others here.
  const VADC_FIELDS = [
    ['aodPrimary', 'Principal drug of concern', 'aod'],
    ['aodTreatment', 'Treatment type', 'aod'],
    ['referralSource', 'Referral source', 'overview'],
  ];

  const SEWB_DOMAIN_COUNT = 8;
  const hasGoals = c => Array.isArray(c.goalPlan) && c.goalPlan.length > 0;
  const riskNeedsPlan = c => ['medium', 'high'].includes(c.riskLevel);

  const SCHEMA = [
    { id: 'identity', label: 'Identity & contact', tab: 'intake', items: [
      { id: 'fullName',   label: 'Full name',                                level: 'required',    has: 'fullName' },
      { id: 'dob',        label: 'Date of birth',                            level: 'critical',    has: 'dob',    flag: 'demo', short: 'date of birth' },
      { id: 'gender',     label: 'Gender',                                   level: 'critical',    has: 'gender', flag: 'demo', short: 'gender' },
      { id: 'atsi',       label: 'Aboriginal / Torres Strait Islander status', level: 'critical',  has: 'atsi',   flag: 'demo', short: 'Aboriginal / Torres Strait Islander status' },
      { id: 'contact',    label: 'Phone or address',                         level: 'critical',    anyOf: ['phone', 'address'], flag: 'demo', short: 'phone or address' },
      { id: 'safeContact', label: 'Safe to leave calls / texts?',            level: 'required',    has: 'ifSafeContact' },
      { id: 'emergency',  label: 'Emergency contact',                        level: 'required',    anyOf: ['ifEc1name', 'emergencyContact'] },
      { id: 'email',      label: 'Email address',                            level: 'recommended', has: 'email' },
      { id: 'mob',        label: 'Mob / community',                          level: 'recommended', anyOf: ['mob', 'community'] },
      { id: 'languages',  label: 'Languages spoken',                         level: 'recommended', has: 'languages' },
      { id: 'gp',         label: 'GP / health service',                      level: 'recommended', has: 'gp' },
    ] },

    { id: 'care', label: 'Care team & safety', tab: 'edit', items: [
      { id: 'keyWorker',  label: 'Key worker assigned',                      level: 'required',    has: 'keyWorker' },
      { id: 'riskLevel',  label: 'Risk level set',                           level: 'required',    has: 'riskLevel' },
      { id: 'referral',   label: 'How they were referred',                   level: 'recommended', anyOf: ['referralSource', 'ifReferralHow'] },
      { id: 'safetyPlan', label: 'Safety plan (medium / high risk)',         level: 'critical',    tab: 'safety', when: riskNeedsPlan,
        anyOf: ['sfWarning', 'sfCoping', 'sfPros', 'sfDate'], flag: 'risk', flagLabel: c => `Safety plan not completed (${c.riskLevel} risk)` },
      { id: 'homeRisk',   label: 'Home risk assessment current',             level: 'critical',    tab: 'homerisk',
        test: (c, h) => h.homeRiskStatus(c).ok, flag: 'homerisk', flagLabel: (c, h) => h.homeRiskStatus(c).msg },
    ] },

    { id: 'intake', label: 'Intake & consent', tab: 'intake', items: [
      { id: 'intakeDone', label: 'Intake form completed',                    level: 'critical',    anyOf: ['intakeSavedAt', 'ifIntakeWorker'], flag: 'intake', flagLabel: 'Intake form not completed' },
      { id: 'consent',    label: 'Signed consent recorded',                  level: 'critical',    has: 'ifConsentSigned', flag: 'consent', flagLabel: 'Signed consent not recorded' },
      { id: 'consentDate', label: 'Consent date',                            level: 'recommended', has: 'ifConsentDate' },
      { id: 'housing',    label: 'Housing situation',                        level: 'recommended', anyOf: ['ifHousing', 'housing'] },
      { id: 'employment', label: 'Employment / education',                   level: 'recommended', anyOf: ['ifEmployment', 'employment', 'ifEdu'] },
      { id: 'hasChildren', label: 'Children in care answered',               level: 'recommended', has: 'ifHasChildren' },
      // Conditional block: only when the client has children in their care.
      { id: 'childrenList', label: 'Children listed',                        level: 'required',    when: c => c.ifHasChildren === 'Yes', has: 'children_list' },
      { id: 'safeHome',   label: '"Safe to go home today?" answered',        level: 'required',    when: c => c.ifHasChildren === 'Yes', has: 'ifSafeHome' },
    ] },

    { id: 'goals', label: 'Goals', tab: 'goals', items: [
      { id: 'goalsAny',   label: 'At least one goal',                        level: 'critical',    test: hasGoals, flag: 'goals', flagLabel: 'No goals recorded' },
      { id: 'goalsMeasurable', label: 'Goals have a starting score and target', level: 'critical', when: hasGoals,
        test: (c, h) => c.goalPlan.some(h.goalIsMeasurable), flag: 'goalsMeasure', flagLabel: 'Goals have no starting score / target' },
      { id: 'goalsReviewed', label: 'Goal reviews up to date',               level: 'critical',    when: hasGoals,
        test: (c, h) => !c.goalPlan.some(h.goalReviewOverdue), flag: 'goalReview', flagLabel: 'Goal review overdue' },
    ] },

    // ---- Conditional blocks: one per program the client is enrolled in ----
    { id: 'sewb', label: 'SEWB', tab: 'sewb', when: 'sewb', items: [
      { id: 'sewbDomains', label: `SEWB domains assessed (all ${SEWB_DOMAIN_COUNT})`, level: 'required',
        ratio: c => (c.sewbDomains || []).filter(d => d > 0).length / SEWB_DOMAIN_COUNT },
      { id: 'sewbGoals',  label: 'SEWB goals / support plan',                level: 'recommended', has: 'sewbGoals' },
    ] },
    { id: 'aod', label: 'AOD', tab: 'aod', when: 'aod', items: [
      ...VADC_FIELDS.map(([key, label, tab]) => ({ id: 'vadc_' + key, label, level: 'critical', tab, has: key, flag: 'vadc', short: label })),
      { id: 'aodStage',   label: 'Stage of change',                          level: 'recommended', has: 'aodStage' },
    ] },
    { id: 'justice', label: 'Justice', tab: 'justice', when: 'justice', items: [
      { id: 'jusMatter',  label: 'Charges / court details',                  level: 'required',    anyOf: ['jusCharges', 'jusCourts'] },
      { id: 'jusLegal',   label: 'Legal representation',                     level: 'recommended', has: 'jusLegal' },
    ] },
    { id: 'cultural', label: 'Cultural Strengthening', tab: 'cultural', when: 'cultural', items: [
      { id: 'cultPlan',   label: 'Cultural connection plan started',         level: 'required',    anyOf: ['cultCountry', 'cultFamily', 'cultPractices', 'cultLanguage', 'cultSpirit', 'cultRole'] },
      { id: 'cultGoals',  label: 'Cultural goals',                           level: 'recommended', has: 'cultGoals' },
    ] },
    { id: 'mensgroup', label: "Men's Group", tab: 'mensgroup', when: 'mensgroup', items: [
      { id: 'mgJoined',   label: 'Date joined',                              level: 'required',    has: 'mgJoined' },
      { id: 'mgGoals',    label: 'Goals for the group',                      level: 'recommended', has: 'mgGoals' },
    ] },
    { id: 'disability', label: 'NDIS / Disability', tab: 'disability', when: 'disability', items: [
      { id: 'ndisNumber', label: 'NDIS number',                              level: 'required',    anyOf: ['dis.ndisNum', 'ndis'] },
      { id: 'disPrimary', label: 'Primary disability',                       level: 'recommended', has: 'dis.primary' },
    ] },
    { id: 'workfoundations', label: 'Work Foundations', tab: 'workfoundations', when: 'workFoundations', items: [
      { id: 'wfGoal',     label: 'Employment goal',                          level: 'required',    has: 'wf.employmentGoal' },
    ] },

    { id: 'documents', label: 'Documents', tab: 'files', items: [
      { id: 'handbook',   label: 'Participant handbook given',               level: 'critical',    test: (c, h) => h.hasHandbook(c), flag: 'handbook', flagLabel: 'Participant handbook not given' },
      { id: 'docConsent', label: 'Signed consent form uploaded',             level: 'required',    doc: 'consent' },
      { id: 'docNdisPlan', label: 'NDIS plan uploaded',                      level: 'required',    when: 'disability', doc: 'ndisplan' },
      { id: 'docOrder',   label: 'Copy of court / intervention order',       level: 'recommended', when: c => c.ifIvo === 'Yes' || c.ifChildCourt === 'Yes', doc: 'legal' },
    ] },

    // Conditional block: closed files.
    { id: 'closure', label: 'Closure', tab: 'overview', when: c => c.status === 'closed', items: [
      { id: 'closedDate', label: 'Closure date',                             level: 'required',    has: 'closedDate' },
      { id: 'closureReason', label: 'Reason for closure',                    level: 'required',    has: 'closureReason' },
    ] },
  ];

  // ---------------------------------------------------------------- engine --
  function get(obj, path) {
    return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  // "Filled in": non-blank text, a non-empty list, true, or any number.
  function filled(v) {
    if (v == null || v === false) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }
  function docTypeOf(file) {
    if (!file) return '';
    if (file.docType) return file.docType;
    const hit = DOC_TYPES.find(t => t.match && t.match.test(String(file.name || '')));
    return hit ? hit.key : '';
  }
  function hasDoc(c, type) { return (c.attachments || []).some(f => docTypeOf(f) === type); }

  function applies(when, c, h) {
    if (when == null) return true;
    if (typeof when === 'string') return filled(get(c, when));
    return !!when(c, h);
  }
  // How complete one item is, 0..1.
  function fraction(item, c, h) {
    if (item.ratio) { const r = Number(item.ratio(c, h)); return isFinite(r) ? Math.max(0, Math.min(1, r)) : 0; }
    if (item.test)  return item.test(c, h) ? 1 : 0;
    if (item.doc)   return hasDoc(c, item.doc) ? 1 : 0;
    if (item.has)   return filled(get(c, item.has)) ? 1 : 0;
    if (item.anyOf) return item.anyOf.some(p => filled(get(c, p))) ? 1 : 0;
    if (item.allOf) return item.allOf.every(p => filled(get(c, p))) ? 1 : 0;
    throw new Error('Data Health item "' + item.id + '" has no rule');
  }
  function bandFor(score) { return score == null ? null : BANDS.find(b => score >= b.min) || BANDS[BANDS.length - 1]; }

  // Score one client record. Returns:
  //   { status: 'ok' | 'empty' | 'unavailable', score: 0..100 | null, band,
  //     earned, possible, sections: [...], missing: [...], errors: [...] }
  // score is null when there is no record ('unavailable') or nothing applies ('empty').
  function compute(client, opts) {
    opts = opts || {};
    const schema = opts.schema || SCHEMA, weights = opts.weights || WEIGHTS, h = opts.helpers || {};
    if (!client || typeof client !== 'object') {
      return { status: 'unavailable', score: null, band: null, earned: 0, possible: 0, sections: [], missing: [], errors: [] };
    }
    const errors = [], sections = [];
    let earned = 0, possible = 0;
    schema.forEach(sec => {
      let secOn;
      try { secOn = applies(sec.when, client, h); } catch (e) { errors.push({ id: sec.id, message: e.message }); secOn = false; }
      if (!secOn) return;
      const out = { id: sec.id, label: sec.label, tab: sec.tab || '', earned: 0, possible: 0, score: null, items: [] };
      (sec.items || []).forEach(item => {
        const weight = Number(weights[item.level]);
        if (!(weight > 0)) { errors.push({ id: item.id, message: 'unknown level "' + item.level + '"' }); return; }
        let frac;
        try { if (!applies(item.when, client, h)) return; frac = fraction(item, client, h); }
        catch (e) { errors.push({ id: item.id, message: e.message }); return; }   // can't be checked → left out, not guessed
        out.items.push({ id: item.id, label: item.label, level: item.level, weight, fraction: frac, ok: frac >= 1,
          tab: item.tab || sec.tab || '', section: sec.id, flag: item.flag || '', def: item });
        out.earned += weight * frac; out.possible += weight;
      });
      if (!out.items.length) return;
      out.score = Math.round(out.earned / out.possible * 100);
      earned += out.earned; possible += out.possible;
      sections.push(out);
    });
    const score = possible > 0 ? Math.round(earned / possible * 100) : null;
    const missing = sections.flatMap(s => s.items.filter(i => !i.ok)).sort((a, b) => b.weight - a.weight);
    return { status: possible > 0 ? 'ok' : 'empty', score, band: bandFor(score), earned, possible, sections, missing, errors };
  }

  // The banner's "missing items" list: one entry per flag group, in the order
  // given by `groupOrder`. Items sharing a group are merged ("Missing: a, b").
  function flags(result, client, opts) {
    opts = opts || {};
    const h = opts.helpers || {}, prefix = opts.mergePrefix || {}, order = opts.groupOrder || [];
    const byGroup = {};
    (result.missing || []).filter(i => i.flag).forEach(i => (byGroup[i.flag] = byGroup[i.flag] || []).push(i));
    // keep schema order inside a group (missing[] is sorted by weight)
    const pos = {}; let n = 0; result.sections.forEach(s => s.items.forEach(i => { pos[i.id] = n++; }));
    const groups = Object.keys(byGroup).sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    return groups.map(g => {
      const items = byGroup[g].sort((a, b) => pos[a.id] - pos[b.id]), first = items[0].def;
      let label;
      if (prefix[g] != null) label = prefix[g] + items.map(i => i.def.short || i.label).join(', ');
      else label = typeof first.flagLabel === 'function' ? first.flagLabel(client, h) : (first.flagLabel || first.label);
      return { group: g, label, tab: items[0].tab };
    });
  }

  root.WG_DATA_HEALTH = { WEIGHTS, BANDS, DOC_TYPES, VADC_FIELDS, SCHEMA, compute, flags, bandFor, docTypeOf, filled, get, VERSION: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
