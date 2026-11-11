# Privacy assessment — Worn Gundidj CMS

**Date:** 11 November 2026 · **Version assessed:** v105 → changes shipped in v106

This is a review of how the CMS collects, uses, stores and discloses personal and
health information, measured against Australian and Victorian privacy law. It
covers the software. It is **not legal advice**, and it cannot see how the
organisation works day to day — the items in section 4 need the organisation's
own decision and, for anything contested, advice from a lawyer or the regulator.

## 1. Which laws apply

| Law | Why it applies |
|---|---|
| **Privacy Act 1988 (Cth)** — the 13 Australian Privacy Principles (APPs) | Worn Gundidj provides health services and holds health information, so it is covered whatever its turnover. |
| **Notifiable Data Breaches scheme** (Privacy Act, Part IIIC) | A breach likely to cause serious harm must be notified to the people affected and to the OAIC. |
| **Health Records Act 2001 (Vic)** — the Health Privacy Principles (HPPs) | Applies to health information held in Victoria by any organisation. Adds a record-keeping rule the Privacy Act does not have (HPP 4.2). |
| **Privacy and Data Protection Act 2014 (Vic)** | Can apply through State funding agreements, and governs the State's Vulnerable Persons Register. Check each service agreement. |
| **Family Violence / Child Information Sharing Schemes** (Vic) | If Worn Gundidj is a prescribed Information Sharing Entity, these allow (and sometimes require) sharing without consent. An organisational decision, not a software one. |
| **Spam Act 2003 (Cth)** | Texts to clients. Appointment and service messages are not marketing, but must identify the sender. |

Also relevant, though not law: the Maiam nayri Wingara **Indigenous Data
Sovereignty** principles (community control over data about community).

## 2. What was found

Risk is the likelihood and seriousness of harm to a client, or of a breach of the law.

| # | Finding | Principle | Risk | Outcome |
|---|---|---|---|---|
| 1 | **Voice to text sends speech to Google or Microsoft.** The 🎤 button uses the browser's speech service. Dictated case notes left the CMS, possibly overseas, with no notice to staff and no way to switch it off. | APP 8, APP 11, HPP 9 | High | **Fixed.** Staff see a notice before first use; the System Manager can switch it off for everyone (Settings → Privacy). Whether to keep it on is a decision for the organisation (4.3). |
| 2 | **The client's online intake form had no proper privacy notice**, and said information is "only seen by Worn Gundidj staff", which is not the whole picture (audits, funders, sharing with consent or by law). | APP 5, HPP 1.4 | High | **Fixed.** The form now explains why information is collected, that answering is a choice, who sees it, where it is kept, and how to get access, corrections or make a complaint. |
| 3 | **The built-in privacy policy was inaccurate.** It left out the Health Records Act, said there was no overseas disclosure at all, and gave no retention period, breach process or Victorian complaint body. | APP 1.3–1.4 | High | **Fixed** in the CMS text. It is a starting draft: the organisation must approve it (4.1). |
| 4 | **Settings showed green "compliant" ticks** for six APPs. The software cannot establish that, and the "no overseas disclosure" tick was wrong. | APP 1.2 | Medium | **Fixed.** Replaced with a plain statement of where information goes and what the organisation must have in place. |
| 5 | **Client names stayed in the browser after sign-out**: the calendar, walk-in register and audit log. On a shared computer the next person could read them. | APP 11.1 | Medium | **Fixed.** All three are cleared at sign-out (the audit log only after it is confirmed saved to the cloud) and reload at sign-in. |
| 6 | **Every page load asked an overseas service for the device's IP address** (api.ipify.org), before sign-in. | APP 3, APP 8 | Medium | **Fixed.** Removed. Sign-ins are still audited (who, when, two-step on or off). The address was self-reported by the browser, so it was weak evidence anyway. |
| 7 | **Exporting, printing or copying a whole client file was not audited.** Nor was deleting a note or removing a file. | APP 11.1, HPP 4.3 | Medium | **Fixed.** Each is now in the audit log: who, when, which client, what kind of record — never the content. |
| 8 | **No retention date on closed files.** Health records must be kept at least 7 years after the last service, or until a person who was a child turns 25, and must not be deleted earlier. | HPP 4.2, APP 11.2 | Medium | **Fixed.** Closed Clients shows "Keep record until" for every file. The CMS has no way to delete a client file. Notes can only be deleted within 24 hours, and the cloud copy is kept, marked as deleted. |
| 9 | **Emailing a client ignored the "safe to contact" answer.** Texts already check it. | APP 6, APP 11 (safety) | Medium | **Fixed.** The email form shows a reminder when the answer is No or blank. It does not block, because the question is about calls and texts. |
| 10 | **Intake did not record that privacy was explained.** | APP 5 | Low | **Fixed.** A new tick on the Consent card, saved and printed with the intake. |
| 11 | **Printing a client document loaded a font from Google.** No client data was sent, but it was an outside call made while handling a record. | APP 11 | Low | **Fixed.** Removed. |
| 12 | **The site's security policy still allowed Google Analytics.** Nothing used it. | APP 11 | Low | **Fixed.** Removed from the allow-list, with the IP service. |
| 13 | **"Clear Log" on the audit page looked like it destroyed the audit trail.** It only clears the device; the cloud copy cannot be deleted. | APP 11 | Low | **Fixed.** Relabelled, and the prompt says so. |
| 14 | **Texts and email subjects named the program** ("Worn Gundidj SEWB…"). A text shows on a phone's lock screen, so it told anyone nearby what kind of service the person uses. | APP 6, APP 11 | Low | **Fixed.** Texts and subject lines now say "Worn Gundidj" only. The automatic-text service carries the same change and takes effect when it is next deployed. |
| 15 | **Old IP addresses** remain in past audit entries and are no longer shown in the staff list. | APP 11.2 | Low | Left in the audit log as part of the historical record. |

### Already in good shape

- Client records are stored in Australia (Google Firebase, Sydney).
- Nothing is readable without a staff sign-in; two-step sign-in is supported.
- Viewing a client file is audited; the cloud audit log cannot be edited or deleted.
- Case notes lock after 24 hours; corrections are added, not overwritten.
- Automatic texts are only sent when the client has said it is safe to text; a worker is warned before sending one by hand otherwise.
- Outlook calendar entries are marked Private with first name and initial only.
- Emails are read live and never stored in the CMS.
- The client intake link expires, is unlocked by date of birth, and can be cancelled.
- A client can be given a restricted file, visible to named workers only.
- Vulnerable Persons Register entries need recorded, evidenced consent and come off automatically.
- Medicare, Centrelink and NDIS numbers are stored as details, never used as the CMS's own identifier (APP 9).
- Walk-ins can be recorded without a name (APP 2).
- Backups can be encrypted with a password, and exports are audited.

## 3. What changed in the software (v106)

1. Voice to text: first-use notice per worker, and an organisation-wide off switch.
2. Client intake form: full collection notice; declaration wording tightened.
3. Privacy policy rewritten to match what the system does; privacy contact is a setting.
4. Settings → Privacy: where information goes, and what the organisation needs in place.
5. Sign-out also clears the calendar, walk-in register and audit log from the device.
6. No IP look-up; no Google Fonts call from printed documents; tighter security policy.
7. Audit entries for: print/export/copy of a client file, deleting a note, removing a file, changing privacy settings.
8. "Keep record until" date on closed files.
9. Safe-contact reminder when emailing a client.
10. "Privacy explained" tick at intake.
11. Texts and email subject lines no longer name the program.

Tests: `tests/browser/privacy.cjs` (27 checks).

## 4. What the organisation needs to do

These cannot be done in software.

1. **Approve the privacy policy.** Read the text in the CMS (login page → Privacy Policy), correct anything that does not match practice, and have it approved. Put the same policy on the public website and offer a paper copy.
2. **Name a privacy contact** and enter it in Settings → Privacy. It appears in the policy as the place for access requests and complaints.
3. **Decide on voice to text.** If it stays on, staff must not dictate identifying details. If in doubt, switch it off.
4. **Write a data breach response plan.** Who decides, who is told, and within what time. A suspected breach must be assessed within 30 days; if serious harm is likely, notify the people affected and the OAIC. A lost laptop, a shared password, or an email to the wrong person all count.
5. **Have a process for access and correction requests** (APP 12–13, HPP 6): who handles them, proof of identity, and a written reply. The CMS can print or export a full client file, and that is audited.
6. **Check the contracts** with Google (Firebase), Microsoft 365 and ClickSend: where data is processed, and that their terms meet APP 8 and APP 11.
7. **Confirm where uploaded files are stored.** Firebase Console → Storage shows the bucket location. It should be Sydney, like the database.
8. **Turn on two-step sign-in for every staff member**, and remove accounts when people leave.
9. **Enforce roles on the server.** Today a worker's role and restricted files are enforced in the browser only: a determined staff member with a valid login could read more than their screen shows. The stricter rules are written (`docs/SECURITY-DEPLOY.md`) but not yet switched on. This is the largest remaining technical gap.
10. **Decide whether Worn Gundidj is an Information Sharing Entity** under the family violence and child schemes, and train staff on when sharing without consent is allowed or required.
11. **Records disposal.** When a file passes its "keep until" date, decide whether to destroy or keep it, and record the name, the period covered and the date destroyed (HPP 4.3). The CMS will not delete a file by itself. Consider keeping records longer where they may matter to Stolen Generations or redress claims.
12. **Train staff**: no shared logins, lock the screen, send the minimum by email or text, and report mistakes straight away.
13. **Vulnerable Persons Register**: use the State's consent form, and re-validate records by 30 April and 31 October.

## 5. If something goes wrong — first hour

1. **Contain it.** Change the password, sign the device out, cancel the intake link, recall the email if possible.
2. **Write down** what happened, when, whose information, and who may have seen it.
3. **Tell the privacy contact and a manager** the same day.
4. **Check the audit log** (Admin → Audit Log) for what was viewed, exported or changed.
5. **Assess harm** within 30 days at most — sooner for health, family violence or location details.
6. **Notify** the people affected and the OAIC (oaic.gov.au) if serious harm is likely. Tell the funding body if the service agreement requires it.
7. **Fix the cause** and record what was changed.
