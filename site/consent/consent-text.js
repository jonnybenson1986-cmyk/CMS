// Worn Gundidj CMS — the wording of the client consent form, in one place.
// Used by the client's page (consent.html), the CMS (index.html: review, the signed
// record, and the printed copy), and the Firestore rules tests, so they always agree.
//
// IMPORTANT: this is a plain-English DRAFT built from the organisation's privacy
// policy in the CMS. Worn Gundidj's management (and, if it wants, a lawyer) must
// approve it before it is sent to clients. When the wording changes, change VERSION:
// every signed form records the version it was signed under.
//
// If you add or rename an answer key, add it to the consentForms rule in BOTH
// firestore.rules and firestore.rules.strict (the tests check they match).
(function (root) {
  const VERSION = '2026-11 v1';

  // What informed consent means — shown first, in plain words.
  const EXPLAIN_INTRO = 'Informed consent means you decide what happens with your information and your support. You decide with all the facts in front of you, and with no pressure.';
  const EXPLAIN = [
    ['You are told', 'We explain, in plain words, what we collect, why we collect it, who might see it, and what it means for you. That includes anything you might not expect.'],
    ['You understand', 'You can ask us to read this out, say it a different way, or get an interpreter. You can bring someone you trust. Take your time. You don’t have to sign today.'],
    ['It’s your choice', 'Nobody can pressure you. You can say yes to some things and no to others. Saying no to the optional parts should not stop you getting support from us.'],
    ['You can change your mind', 'You can withdraw or change your consent at any time by telling your worker. From then on we will stop using your information in that way. We can’t take back information that was already shared lawfully.'],
  ];
  const CAPACITY = 'If you are under 18, or you can’t make this decision for yourself right now, a parent, guardian or someone with legal authority can sign for you. Your worker will still talk it through with you in a way you can understand.';

  // The choices. `key` is stored in the form; `file` is the CMS client-record field it fills in.
  // required: needed to open a file and give support. The rest are the client's own choice.
  const CHOICES = [
    { key: 'collect', required: true, file: 'ifConsentDatabase',
      q: 'Keeping my information',
      d: 'Worn Gundidj can collect, use and keep my personal and health information, in its secure client record system in Australia, so it can give me support and keep an accurate record.' },
    { key: 'programs', file: 'ifConsentInfo',
      q: 'Other Worn Gundidj programs',
      d: 'Staff in other Worn Gundidj programs (for example SEWB, AOD or Justice) can see the parts of my file they need to support me.' },
    { key: 'audit', file: 'ifConsentAudit',
      q: 'Checking quality and funding',
      d: 'Worn Gundidj can check my file for quality and funding reviews. Funding bodies only get the information they require.' },
    { key: 'external', file: 'ifConsentExternal',
      q: 'Sharing with other services',
      d: 'Worn Gundidj can share information with other services or agencies to help me, or for funding support. My worker will tell me who and what first, unless the law says they must share it.' },
    { key: 'video', file: 'ifConsentVideo',
      q: 'Video appointments',
      d: 'I am OK to have appointments by video call (for example Teams or Zoom).' },
    { key: 'transport', file: 'ifTransportConsent',
      q: 'Transport',
      d: 'A Worn Gundidj worker can drive me in a Worn Gundidj vehicle when I need it for my support.' },
  ];

  // When information can be shared without consent.
  const LIMITS_INTRO = 'We keep your information private. Sometimes the law lets us, or requires us, to share it without your consent. If we can, we will tell you first. For example:';
  const LIMITS = [
    'to prevent or lessen a serious threat to your life, health or safety, or someone else’s',
    'to protect a child from harm',
    'when a court or the law requires it',
    'under family violence or child information sharing laws, where they apply to us',
  ];

  // Your rights.
  const RIGHTS = [
    ['See your information', 'You can ask to see what we hold about you, and ask us to correct it. We will answer within 30 days.'],
    ['Change or withdraw consent', 'Tell your worker at any time. You don’t need a reason.'],
    ['Get a copy of this form', 'You can save or print your copy when you send it. You can also ask your worker for one.'],
    ['Complain', 'Tell us first, on (03) 5561 5315. If you are not happy, you can contact the Office of the Australian Information Commissioner (oaic.gov.au, 1300 363 992) or the Victorian Health Complaints Commissioner (hcc.vic.gov.au).'],
    ['How long we keep your file', 'Health records are kept for at least 7 years after your last service, or until you turn 25 if you were under 18. After that they are destroyed safely or de-identified.'],
  ];

  // Before you sign: each one must be ticked.
  const CONFIRMS = [
    { key: 'understood', t: 'I have read this form, or had it read to me, and I understand it.' },
    { key: 'questions', t: 'I have had the chance to ask questions, and I know I can ask more at any time.' },
    { key: 'voluntary', t: 'I am agreeing freely. Nobody has pressured me.' },
    { key: 'change', t: 'I know I can change or withdraw my consent at any time by telling my worker.' },
  ];

  const KEYS = CHOICES.map(c => c.key).concat(CONFIRMS.map(c => c.key));   // every answer a client may write (the Firestore rule allows exactly these)
  root.WG_CONSENT = { VERSION, EXPLAIN_INTRO, EXPLAIN, CAPACITY, CHOICES, LIMITS_INTRO, LIMITS, RIGHTS, CONFIRMS, KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
