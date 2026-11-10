const OLD_VADC = [['aodPrimary','Principal drug of concern'],['aodTreatment','Treatment type'],['referralSource','Referral source']];

function oldFileCompleteness(c) {
  const out = [], add = (group, label, tab) => out.push({ group, label, tab });
  if (!(c.intakeSavedAt || c.ifIntakeWorker)) add('intake', 'Intake form not completed', 'intake');
  const demo = [!c.dob && 'date of birth', !c.gender && 'gender', !c.atsi && 'Aboriginal / Torres Strait Islander status', !(c.phone || c.address) && 'phone or address'].filter(Boolean);
  if (demo.length) add('demo', 'Missing: ' + demo.join(', '), 'intake');
  if (!c.ifConsentSigned) add('consent', 'Signed consent not recorded', 'intake');
  const goals = c.goalPlan || [];
  if (!goals.length) add('goals', 'No goals recorded', 'goals');
  else if (!goals.some(goalIsMeasurable)) add('goalsMeasure', 'Goals have no starting score / target', 'goals');
  if (goals.some(goalReviewOverdue)) add('goalReview', 'Goal review overdue', 'goals');
  if (['medium','high'].includes(c.riskLevel) && !(c.sfWarning || c.sfCoping || c.sfPros || c.sfDate)) add('risk', `Safety plan not completed (${c.riskLevel} risk)`, 'safety');
  const hr = homeRiskStatus(c); if (!hr.ok) add('homerisk', hr.msg, 'homerisk');
  if (!hasHandbook(c)) add('handbook', 'Participant handbook not given', 'files');
  if (c.aod) { const miss = OLD_VADC.filter(([k]) => !String(c[k] || '').trim()).map(([, l]) => l); if (miss.length) add('vadc', 'AOD / VADC: ' + miss.join(', '), miss[0] === 'Referral source' && miss.length === 1 ? 'overview' : 'aod'); }
  return out;
}
