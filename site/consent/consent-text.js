// Worn Gundidj CMS — the wording of the client consent form, in one place.
// Used by the client's page (consent.html), the CMS (index.html: review, the signed
// record, and the printed copy), and the Firestore rules tests, so they always agree.
//
// IMPORTANT: this is a plain-English DRAFT built from the organisation's privacy
// policy in the CMS. Worn Gundidj's management (and, if it wants, a lawyer) must
// approve it before it is sent to clients — above all the mandatory reporting
// section, which describes the law in general terms and should be checked against
// the organisation's own legal duties. When the wording changes, change VERSION:
// every signed form records the version it was signed under.
//
// If you add or rename an answer key, or a key of the sharing section, add it to the
// consentForms rule in BOTH firestore.rules and firestore.rules.strict (the tests check
// they match).
(function (root) {
  const VERSION = '2026-11 v2';

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
  // (Sharing with other services and with people close to you is its own section below.)
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
    { key: 'video', file: 'ifConsentVideo',
      q: 'Video appointments',
      d: 'I am OK to have appointments by video call (for example Teams or Zoom).' },
    { key: 'transport', file: 'ifTransportConsent',
      q: 'Transport',
      d: 'A Worn Gundidj worker can drive me in a Worn Gundidj vehicle when I need it for my support.' },
  ];

  // ---- Sharing with other people (third parties) ----
  // Two lists the client fills in: professionals and services, and people in their life.
  // The client chooses WHO, WHAT and WHY for each, and for HOW LONG.
  const SHARE_TITLE = 'Sharing your information with other people';
  const SHARE_INTRO = 'Sometimes it helps if we can talk to other people about your support. This part is where you say who, and what they can know. We only share with the people you name here, and only what you tick. The law sometimes says we must report or share anyway. That is in the next part.';
  const SHARE_RIGHTS_TITLE = 'Your rights when we share your information';
  const SHARE_RIGHTS = [
    ['It’s your choice', 'You decide who we can talk to, what they can know, and why. You can say no to all of it and still get support from us.'],
    ['You choose what', 'Anything you don’t tick stays private. You can allow a person to know your appointment times, and nothing more.'],
    ['Only what’s needed', 'We only share what is needed for the reason you give. We ask people to keep it private.'],
    ['Once it’s shared', 'Other people and services have their own privacy rules. We can’t control what they do with it after we share it, so please choose carefully.'],
    ['You can see it', 'You can ask what we have shared, and with who. You can ask us to correct anything that is wrong.'],
    ['You can change it any time', 'Tell your worker to add someone, take someone off, or stop sharing. It stops from then on. You don’t need to give a reason.'],
    ['It ends on its own', 'It lasts for the time you choose below, then we will ask you again.'],
  ];
  const SHARE_WHAT = [
    ['contact', 'My contact details and appointment times'],
    ['plan', 'My goals and support plan'],
    ['health', 'My health and wellbeing information'],
    ['notes', 'Progress notes about my support'],
    ['referrals', 'Referrals to other services'],
    ['safety', 'Safety and emergency information'],
  ];
  const SHARE_MAX = 5;                                  // people or services per list
  const SHARE_GROUPS = [
    { key: 'pro', title: 'Professionals and services', short: 'Professional / service',
      blurb: 'For example your GP, a hospital, an NDIS provider, a housing service, Centrelink, a school, a solicitor, or another Aboriginal service.',
      ask: 'Do you want us to share any of your information with professionals or services?',
      nameLabel: 'Name of the person or service', roleLabel: 'What kind of service is it?', roleHint: 'For example: GP, NDIS provider, housing service' },
    { key: 'per', title: 'People in my life', short: 'Personal support',
      blurb: 'For example family, your partner, a friend, a carer, an Elder, or someone from your community.',
      ask: 'Do you want us to share any of your information with people close to you?',
      nameLabel: 'Their name', roleLabel: 'How are they connected to you?', roleHint: 'For example: mother, partner, friend, carer, Elder' },
  ];
  const SHARE_LENGTH = [['m6', '6 months'], ['m12', '12 months'], ['until', 'Until I change it']];
  const SHARE_PARTY_KEYS = ['name', 'role', 'contact', 'what', 'why', 'back'];
  const SHARE_KEYS = ['pro', 'per', 'length']
    .concat([1, 2, 3, 4, 5].map(n => 'pro' + n)).concat([1, 2, 3, 4, 5].map(n => 'per' + n));   // the form's `sharing` map: exactly these keys

  // ---- When we must or may share without consent, including mandatory reporting ----
  const LIMITS_TITLE = 'When we must or may share without your consent';
  const LIMITS_INTRO = 'We keep your information private. But some laws mean we must report, or may share, without your consent, even if you have said no above. We will tell you first when it is safe and possible, and we only share what is needed.';
  const MUST_TITLE = 'Mandatory reporting: when the law says we must';
  const MUST = [
    ['Child abuse', 'Under Victorian child protection law, some of our staff are “mandatory reporters”. If they believe on reasonable grounds that a child is in need of protection, for example because of physical injury or sexual abuse, they must report it to Child Protection. Anyone can make a report, and some people must by law.'],
    ['Sexual offences against a child', 'Any adult who reasonably believes a sexual offence has been committed against a child under 16 must report it to police.'],
    ['NDIS serious incidents', 'Where we provide NDIS supports, we must report certain serious incidents, such as abuse, neglect or serious injury, to the NDIS Quality and Safeguards Commission.'],
    ['Court orders and the law', 'We must give information when a court order, subpoena or other law requires it.'],
  ];
  const MAY_TITLE = 'When the law lets us share';
  const MAY = [
    ['A serious threat', 'to prevent or lessen a serious threat to your life, health or safety, or someone else’s'],
    ['Family violence and child safety', 'with other services under the family violence and child information sharing laws, where they apply to us, to keep you or children safe'],
  ];
  const LIMITS_NOTE = 'This means we can’t promise to keep everything secret. If we have to report, we will explain what we are doing and why, and we will support you through it, unless telling you would put someone at risk.';

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
    { key: 'limits', t: 'I understand that the law sometimes means Worn Gundidj must report or share information, including mandatory reporting, even if I have said no.' },
    { key: 'change', t: 'I know I can change or withdraw my consent at any time by telling my worker.' },
  ];

  const KEYS = CHOICES.map(c => c.key).concat(CONFIRMS.map(c => c.key));   // every answer a client may write (the Firestore rule allows exactly these)
  root.WG_CONSENT = { VERSION, EXPLAIN_INTRO, EXPLAIN, CAPACITY, CHOICES,
    SHARE_TITLE, SHARE_INTRO, SHARE_RIGHTS_TITLE, SHARE_RIGHTS, SHARE_WHAT, SHARE_MAX, SHARE_GROUPS, SHARE_LENGTH, SHARE_PARTY_KEYS, SHARE_KEYS,
    LIMITS_TITLE, LIMITS_INTRO, MUST_TITLE, MUST, MAY_TITLE, MAY, LIMITS_NOTE, RIGHTS, CONFIRMS, KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
