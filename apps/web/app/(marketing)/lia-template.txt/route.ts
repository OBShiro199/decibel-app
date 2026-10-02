export const dynamic = 'force-static';

const TEMPLATE = `LEGITIMATE INTERESTS ASSESSMENT (LIA) TEMPLATE
B2B outbound telephone prospecting

This template is a starting point provided by Decibel. It is not legal advice.
Complete every section in your own words, have it reviewed, and keep it on file.
Review it at least once a year or whenever your outreach changes.

------------------------------------------------------------
0. DETAILS
------------------------------------------------------------
Organisation (controller):
Completed by (name and role):
Date completed:
Next review date:
Processing activity: Calling business contacts by telephone to offer [product/service]

------------------------------------------------------------
1. PURPOSE TEST: is there a legitimate interest?
------------------------------------------------------------
1.1 What are you trying to achieve by calling these people?

1.2 Who benefits (you, the people you call, third parties, the wider public)?

1.3 How important are those benefits? What happens if you cannot do this?

1.4 Is the outreach lawful and within industry rules?
    [ ] Numbers are screened against TPS and CTPS before every call (PECR reg. 21)
    [ ] A valid caller ID is always presented
    [ ] An internal do-not-call list is maintained and honoured immediately
    [ ] Country-specific rules have been checked for each market called

------------------------------------------------------------
2. NECESSITY TEST: is the processing necessary?
------------------------------------------------------------
2.1 Does calling these contacts actually help you achieve the purpose?

2.2 Is it proportionate? What data do you use (name, job title, employer,
    business phone or mobile number) and why is each item needed?

2.3 Could you achieve the same result with less data or in a less intrusive way?
    If so, why is that not sufficient?

------------------------------------------------------------
3. BALANCING TEST: do the individual's interests override yours?
------------------------------------------------------------
Nature of the data
3.1 Is any of it special category, criminal offence or otherwise sensitive data?
    (It should not be. If it is, stop and take advice.)

3.2 Does the data relate to people in their professional capacity?

Reasonable expectations
3.3 Do you have an existing relationship with these people?

3.4 Would a person in this role reasonably expect to be called about this?
    Is your offer relevant to their job?

3.5 Where did the data come from, and were people told it may be used this way
    (for example by an Article 14 notice)?

Likely impact
3.6 What is the possible impact on the individual (for example interruption,
    annoyance, calls to a personal mobile)?

3.7 Are any of the people likely to be vulnerable?

3.8 How often will each person be called, and at what times of day?

Safeguards
3.9 What safeguards reduce the impact?
    [ ] Easy opt-out offered on every call and honoured immediately
    [ ] Call frequency limits per contact
    [ ] Calls only within reasonable business hours
    [ ] Recording notice given where calls are recorded
    [ ] Retention limits for call recordings and notes
    [ ] Access to data limited to those who need it

------------------------------------------------------------
4. DECISION
------------------------------------------------------------
4.1 Can you rely on legitimate interests for this processing?   Yes / No

4.2 Reasons for the decision:

4.3 Actions required before or after starting (owner and date):

Signed:
Date:

------------------------------------------------------------
NOTES
------------------------------------------------------------
- The right to object to direct marketing is absolute. If someone objects,
  stop contacting them and record the objection.
- Keep this assessment with your record of processing activities.
- If the balancing test is finely balanced or high risk, consider a Data
  Protection Impact Assessment and take legal advice.
`;

export function GET() {
  return new Response(TEMPLATE, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="decibel-lia-template.txt"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
