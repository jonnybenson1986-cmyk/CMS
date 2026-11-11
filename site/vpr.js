// Worn Gundidj CMS — Vulnerable Persons Register (VPR): the rules.
//
// Source: Victorian Government (DFFH), "Vulnerable People in Emergencies
// Policy" v4.0 (Feb 2025) and "Guidance to Support the Management of
// Vulnerable Persons Registers and 'At-Risk' Local Facility Lists".
//
// IMPORTANT: this is the organisation's OWN register and screening record. The
// official VPR is the State's online database (vpr.mecccentral.com), which
// Victoria Police and the council see. Being listed here does not list anyone
// there — each record tracks whether that has been done (`councilEntered`).
//
// A person is on the register only while ALL FOUR criteria are met, and their
// file is open. Nothing is deleted when they come off: the screening, consent
// and history stay on the client record.
//
// The VPR part of a client record (`client.vpr`):
//   c1, c2, c3            'Yes' | 'No' | ''      the three screening criteria
//   c1Notes, c2Notes, c3Notes
//   hasPlan               'Yes' | 'No' | ''      personal emergency plan in place
//   planDiscussed         true/false             planning information provided / discussed
//   consent               'Yes' | 'No' | 'Withdrawn' | ''
//   consentMethod         key of CONSENT_METHODS
//   consentDate, consentBy                       when, and the worker who obtained it
//   repName, repRelationship, repPhone           authorised representative (if used)
//   checklist             [bool × 4]             WORKER_CHECKLIST
//   considerations        { mobility:[], access:[], equipment:[], communication:[] }
//   comments
//   councilEntered, councilRef                   entered in the council's VPR database
//   lastValidated                                last confirmed still eligible + consenting
//   listed, listedAt, removedAt, removedReason   register membership (set by the CMS)
//   history               [{ at, by, action, detail }]
// No dependencies: runs the same in the browser and in Node (tests).
(function (root) {
  'use strict';

  // The four mandatory eligibility criteria (Guidance, p.3) and what to consider (p.4).
  const CRITERIA = [
    { key: 'c1', n: 1, label: 'Frail and/or physically or cognitively impaired', consider: [
      'Level of frailty or physical impairment that would likely reduce their capacity to act during an emergency.',
      'Likely to require increased time and/or assistance to respond in an emergency.',
      'Inability to make an independent decision due to cognitive or other impairment.' ] },
    { key: 'c2', n: 2, label: 'Unable to comprehend warnings and directions and/or respond in an emergency situation', consider: [
      'Inability to make an independent decision due to cognitive or other impairment.',
      'Unable to understand or respond to emergency warnings or directions, such as speech/hearing impediment and poor use and/or understanding of English.',
      'Does not drive or have access to a vehicle.' ] },
    { key: 'c3', n: 3, label: 'Cannot identify personal or community support networks to help them in an emergency', consider: [
      'Lives alone, or with someone with a similar or greater degree of vulnerability.',
      'No family, friend, carer or next of kin, or social/community networks in the local area able to assist.',
      'No near neighbours, or no connection with neighbours or the local community.',
      'No local networks or service providers.' ] },
    { key: 'c4', n: 4, label: 'Consents to be on the VPR', consider: [
      'Informed consent is required before a person can be registered, and for them to remain on it.',
      'Being listed is voluntary; the person can ask to be removed at any time.' ] },
  ];

  // Ways consent can be given (Guidance, Attachment 3 — Consent Form).
  const CONSENT_METHODS = [
    { key: 'written', label: 'Written consent (signed form)' },
    { key: 'verbal', label: 'Verbal consent (recorded by worker)' },
    { key: 'representative', label: 'Authorised representative (person lacks capacity to consent)' },
  ];

  // What the worker should do so the decision is informed (Attachment 3).
  const WORKER_CHECKLIST = [
    'Discussed the proposed sharing of information with other organisations, as outlined in the consent form.',
    'Explained that the information will only be shared with these services/agencies if the person (or representative) has agreed.',
    'Provided information about privacy, such as the brochure "Your Information – It\'s Private".',
    'Provided the person (or representative) with a copy of the completed form.',
  ];

  // Emergency considerations (Guidance, pp.9–10). Tick only what applies.
  const CONSIDERATIONS = [
    { key: 'mobility', label: 'Mobility', items: ['Wheelchair', 'Walking aids', 'Weight-related mobility aids', 'Stretcher required', 'Mobility aids'] },
    { key: 'access', label: 'Access and security', items: ['4WD required', 'Side access', 'Rear access', 'Behaviour', 'Dangerous animals'] },
    { key: 'equipment', label: 'Equipment, critical medication and pets', items: ['Home ventilator', 'Oxygen', 'Dialysis', 'Parenteral nutrition', 'Ventricle assistance device', 'Critical medication', 'Service animal', 'Pets'] },
    { key: 'communication', label: 'Communication or cognitive', items: ['Hearing', 'Sight', 'Speech', 'Dementia', 'Mental health', 'Cognitive disability', 'Alcohol or other drugs', 'Non-English speaking'] },
  ];
  const COMMENT_PROMPTS = [
    'Will the person need special consideration before being approached by uniformed police or other emergency services personnel, should an evacuation be recommended?',
    'Is there a known strategy to deal with complex behaviour that could assist police in evacuation?',
    'Will specialist support be required to evacuate the person safely?',
    'Are there specific directions that could assist accessing the property?',
  ];

  // Mandatory revalidation: at least twice a year, by these dates (month is 1–12).
  const REVALIDATION_DATES = [{ month: 4, day: 30 }, { month: 10, day: 31 }];
  const REVALIDATION_WINDOW_DAYS = 31;      // records turn "re-validate" one month before
  const VALIDATION = {
    verified:   { label: 'Verified',    hint: 'Details are up to date.', color: '#16a34a' },
    revalidate: { label: 'Re-validate', hint: 'Due for review, including whether they still consent.', color: '#d97706' },
    unverified: { label: 'Unverified',  hint: 'Revalidation date missed — urgent review needed.', color: '#dc2626' },
  };

  const filled = v => typeof v === 'string' ? v.trim() !== '' : !!v;
  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function addDays(dateStr, n) { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  // Is consent evidenced? "A VPR record is non-compliant if informed consent is not captured."
  function consentEvidence(v) {
    v = v || {};
    const missing = [];
    if (v.consent !== 'Yes') { missing.push(v.consent === 'Withdrawn' ? 'consent has been withdrawn' : v.consent === 'No' ? 'the person does not consent' : 'consent not recorded'); return { ok: false, missing }; }
    if (!CONSENT_METHODS.some(m => m.key === v.consentMethod)) missing.push('how consent was given');
    if (!filled(v.consentDate)) missing.push('date of consent');
    if (!filled(v.consentBy)) missing.push('who obtained consent');
    if (v.consentMethod === 'representative' && !filled(v.repName)) missing.push("authorised representative's name");
    return { ok: missing.length === 0, missing };
  }
  // Each criterion: met or not, and why not.
  function criteria(v) {
    v = v || {};
    const ev = consentEvidence(v);
    return CRITERIA.map(c => {
      if (c.key === 'c4') return { key: c.key, n: c.n, label: c.label, met: ev.ok, why: ev.ok ? '' : ev.missing.join(', ') };
      const a = v[c.key];
      return { key: c.key, n: c.n, label: c.label, met: a === 'Yes', why: a === 'Yes' ? '' : a === 'No' ? 'assessed as not met' : 'not yet assessed' };
    });
  }
  function eligible(v) { return criteria(v).every(c => c.met); }
  function screened(v) { return !!v && ['c1', 'c2', 'c3'].some(k => v[k] === 'Yes' || v[k] === 'No'); }
  const isOpen = client => !!client && client.status !== 'closed';
  // On the register = all four criteria met AND the client's file is open.
  function onRegister(client) { return isOpen(client) && eligible(client && client.vpr); }
  // Why someone is not (or no longer) on the register, in plain words.
  function offReason(client) {
    if (!isOpen(client)) return 'File closed';
    const v = (client && client.vpr) || {};
    if (v.consent === 'Withdrawn') return 'Consent withdrawn';
    const unmet = criteria(v).filter(c => !c.met);
    return unmet.length ? 'Criteria not met: ' + unmet.map(c => `${c.n} (${c.why})`).join('; ') : '';
  }

  // The revalidation date on or after `today`, and the one before it.
  function revalidationDates(today) {
    const y = Number(today.slice(0, 4));
    const all = [y - 1, y, y + 1].flatMap(yy => REVALIDATION_DATES.map(d => ymd(yy, d.month, d.day))).sort();
    const next = all.find(d => d >= today), prev = all.filter(d => d < today).pop();
    return { next, prev, windowStart: addDays(next, -REVALIDATION_WINDOW_DAYS), prevWindowStart: addDays(prev, -REVALIDATION_WINDOW_DAYS) };
  }
  // Verified / Re-validate / Unverified (Guidance, "Updating VPR records").
  // A record is validated by `lastValidated`, or by the date it was listed.
  function validationStatus(v, today) {
    v = v || {};
    const last = [v.lastValidated, v.listedAt].filter(filled).map(s => String(s).slice(0, 10)).sort().pop() || '';
    const d = revalidationDates(today);
    if (today >= d.windowStart) return last >= d.windowStart ? 'verified' : 'revalidate';
    return last >= d.prevWindowStart ? 'verified' : 'unverified';
  }
  // A flat, readable list of ticked considerations: "Mobility: Wheelchair; …".
  function considerationsText(v) {
    const cs = (v && v.considerations) || {};
    return CONSIDERATIONS.map(g => { const t = (cs[g.key] || []).filter(x => g.items.includes(x)); return t.length ? `${g.label}: ${t.join(', ')}` : ''; }).filter(Boolean).join('; ');
  }

  root.WG_VPR = { CRITERIA, CONSENT_METHODS, WORKER_CHECKLIST, CONSIDERATIONS, COMMENT_PROMPTS, REVALIDATION_DATES, REVALIDATION_WINDOW_DAYS, VALIDATION,
    consentEvidence, criteria, eligible, screened, onRegister, offReason, revalidationDates, validationStatus, considerationsText, addDays, VERSION: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
