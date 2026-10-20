// Worn Gundidj CMS — the SEWB intake questions a client can fill in themselves
// from a link (intake.html). Shared by that page and the CMS (index.html), so
// both always agree on the questions. Each "key" is the CMS client-record field
// the answer goes into when a worker applies the form.
//
// Deliberately NOT here: questions about self-harm, family violence, court
// orders, or whether it's safe to go home. A worker asks those in person.
//
// If you add or rename a key, add it to the intakeForms rule in BOTH
// firestore.rules and firestore.rules.strict (the tests check they match).
(function (root) {
  const YN = ['Yes', 'No'];
  // [CMS key, what the client sees, group heading]
  const SERVICES = [
    ['gpReferral', 'Seeing a GP or doctor', 'Health and wellbeing'], ['gpUpToDate', 'A health check', 'Health and wellbeing'],
    ['mhSupport', 'Mental health support', 'Health and wellbeing'], ['counselling', 'Counselling', 'Health and wellbeing'],
    ['financialAssist', 'Money help or financial counselling', 'Money'], ['budgeting', 'Budgeting', 'Money'], ['hardship', 'Financial hardship', 'Money'], ['gambling', 'Gambling', 'Money'],
    ['yarnElder', 'A yarn with an Elder or respected person', 'Culture, family and Country'], ['culturalMentor', 'A cultural mentor', 'Culture, family and Country'],
    ['returnCountry', 'Return to Country', 'Culture, family and Country'], ['culturalActivities', 'Cultural activities', 'Culture, family and Country'],
    ['familyConnect', 'Connecting with family, kinship and Country', 'Culture, family and Country'], ['familyTracing', 'Family tracing', 'Culture, family and Country'],
    ['stolenGen', 'Stolen Generations support', 'Culture, family and Country'], ['bthWorker', 'Bringing Them Home worker', 'Culture, family and Country'],
    ['communityGroups', 'Social or community groups', 'Groups'], ['mensWomens', "Men's or women's group", 'Groups'], ['eldersGroup', 'Elders group', 'Groups'],
    ['youthGroup', 'Youth group', 'Groups'], ['parentingGroups', 'Parenting groups', 'Groups'],
    ['policeComms', 'Talking with police', 'Justice'], ['courtDate', 'An upcoming court date', 'Justice'], ['legalSupport', 'Legal help', 'Justice'],
    ['substanceUse', 'Alcohol or other drugs', 'Alcohol and other drugs'], ['alcohol', 'Alcohol', 'Alcohol and other drugs'], ['illicitDrugs', 'Drugs', 'Alcohol and other drugs'],
    ['yarndi', 'Yarndi', 'Alcohol and other drugs'], ['tobacco', 'Smoking', 'Alcohol and other drugs'], ['vapes', 'Vaping', 'Alcohol and other drugs'], ['detox', 'Detox or rehab', 'Alcohol and other drugs'],
  ];
  const STEPS = [
    { id: 'about', title: 'About you', intro: 'Tell us a bit about yourself. Skip anything you’d rather talk about with your worker.', fields: [
      { key: 'fullName', label: 'Full name', type: 'text', required: true, autocomplete: 'name' },
      { key: 'preferredName', label: 'What would you like us to call you?', type: 'text', autocomplete: 'nickname' },
      { key: 'dob', label: 'Date of birth', type: 'date', autocomplete: 'bday' },
      { key: 'gender', label: 'Gender', type: 'radio', options: ['Male', 'Female', 'Non-Binary', 'Other', 'Not disclosed'] },
      { key: 'ifLgbtiqa', label: 'Do you identify as part of the LGBTIQA+SB community?', type: 'radio', options: ['Yes', 'No', 'Prefer not to say'] },
      { key: 'atsi', label: 'Are you of Aboriginal or Torres Strait Islander descent?', type: 'radio', options: ['Aboriginal', 'Torres Strait Islander', 'Both', 'No', 'Prefer not to say'] },
      { key: 'mob', label: 'Who’s your Mob?', type: 'text', help: 'Not sure? We can help with family tracing.' },
      { key: 'languages', label: 'Languages spoken at home', type: 'text' },
      { key: 'interpreter', label: 'Would you like an interpreter or support person?', type: 'radio', options: YN },
      { key: 'ifMarital', label: 'Relationship status', type: 'radio', options: ['Married', 'De facto', 'Single', 'Separated', 'Other'] },
    ] },
    { id: 'contact', title: 'How we contact you', intro: '', fields: [
      { key: 'phone', label: 'Mobile or phone number', type: 'tel', autocomplete: 'tel' },
      { key: 'ifSafeContact', label: 'Is it safe for us to call this number and leave texts?', type: 'radio', options: YN },
      { key: 'email', label: 'Email (optional)', type: 'email', autocomplete: 'email' },
      { key: 'address', label: 'Home address', type: 'textarea', rows: 2, autocomplete: 'street-address' },
    ] },
    { id: 'emergency', title: 'Emergency contacts', intro: 'Who should we contact in an emergency?', fields: [
      { key: 'ifEc1name', label: 'Contact 1 — name', type: 'text' },
      { key: 'ifEc1rel', label: 'Contact 1 — relationship to you', type: 'text' },
      { key: 'ifEc1phone', label: 'Contact 1 — phone', type: 'tel' },
      { key: 'ifEc2name', label: 'Contact 2 — name (optional)', type: 'text' },
      { key: 'ifEc2rel', label: 'Contact 2 — relationship to you', type: 'text' },
      { key: 'ifEc2phone', label: 'Contact 2 — phone', type: 'tel' },
    ] },
    { id: 'situation', title: 'Your situation', intro: '', fields: [
      { key: 'ifHousing', label: 'Where are you living at the moment?', type: 'checks', options: ['Renting', 'Boarding', 'Experiencing Homelessness', 'Shared Accommodation', 'Exiting Custody', 'Public Housing', 'With Family', 'Other'] },
      { key: 'ifEmployment', label: 'Work', type: 'checks', options: ['Employed', 'Unemployed (seeking)', 'Work Foundations (Supported Employment)', 'CDEP/CDP', 'Carer', 'Student', 'Unable to work', 'Other'] },
      { key: 'ifEdu', label: 'Are you studying, or would you like to do some training?', type: 'radio', options: YN },
      { key: 'ifCentrelink', label: 'Centrelink payment (if any)', type: 'text' },
      { key: 'gp', label: 'Who is your GP (doctor)?', type: 'text' },
      { key: 'ndis', label: 'NDIS number (if you have one)', type: 'text' },
      { key: 'ifHasChildren', label: 'Do you have children in your care?', type: 'radio', options: YN },
      { key: 'ifPrevAccess', label: 'Have you used Worn Gundidj services before?', type: 'radio', options: YN },
      { key: 'ifReferralHow', label: 'How did you hear about Worn Gundidj?', type: 'text' },
    ] },
    { id: 'support', title: 'Support you’d like', intro: 'Tick anything you’d like help with. You can change your mind later.', fields: [
      { key: 'ifServices', label: 'I’d like help with…', type: 'services' },
      { key: 'ifAdditionalInfo', label: 'Anything else you’d like us to know?', type: 'textarea', rows: 3, help: 'For example access needs, cultural considerations, or the best time to contact you.' },
    ] },
    { id: 'goals', title: 'Your goals', intro: 'What would you like to achieve with Worn Gundidj?', fields: [
      { key: 'ifHobbies', label: 'Hobbies and interests', type: 'textarea', rows: 2 },
      { key: 'ifGoalShort', label: 'In the next few weeks', type: 'textarea', rows: 2 },
      { key: 'ifGoalMedium', label: 'In the next few months', type: 'textarea', rows: 2 },
      { key: 'ifGoalLong', label: 'Longer term', type: 'textarea', rows: 2 },
    ] },
  ];
  const FIELDS = STEPS.flatMap(s => s.fields);
  // Every key a client may write (the Firestore rule allows exactly these).
  const KEYS = FIELDS.map(f => f.key).concat(['declaration']);
  const PREFILL = FIELDS.map(f => f.key).filter(k => k !== 'ifServices');
  const MAX_LEN = { text: 200, tel: 30, email: 120, date: 10, textarea: 2000 };
  root.WG_INTAKE = { STEPS, FIELDS, KEYS, PREFILL, SERVICES, MAX_LEN, VERSION: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
