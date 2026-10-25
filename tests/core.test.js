// Run with: node tests/core.test.js
// Loads src/core.js the way the browser does (it is a plain script, not a module).
const fs = require('fs');
const path = require('path');
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
const code = fs.readFileSync(path.join(__dirname, '../src/names.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8')
  + '\nreturn {collect, mask, restore, reset: () => { state = blankState(); }};';
const { collect, mask, restore, reset } = new Function(code)();

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + detail)); };
const scan = text => { reset(); return collect(text, { manual: [], columns: null }); };
const ticked = r => r.findings.filter(f => f.checked).map(f => f.value);
const masked = text => { const r = scan(text); return mask(text, r, new Set(r.findings.filter(f => f.checked).map(f => f.key))).out; };

const hi = "Hi Alex! This is Luca's teammate Tim. Do you want to join for the soccer season?";
check('greeting, possessive and role names are all caught',
  ['Alex', 'Luca', 'Tim'].every(n => ticked(scan(hi)).includes(n)), JSON.stringify(ticked(scan(hi))));

const days = 'Thanks to Priya and Jamal. Monday works for the Toronto office. Zoom is fine.';
check('days, places and apps are left alone',
  !['Monday', 'Toronto', 'Zoom'].some(n => scan(days).findings.some(f => f.value === n)), JSON.stringify(scan(days).findings.map(f => f.value)));

const heading = 'Annual Report Summary Of The Year';
check('a Title Case heading is not read as names', scan(heading).findings.length === 0, JSON.stringify(scan(heading).findings.map(f => f.value)));

const policy = 'Our Investment Policy says the Board Meeting Agenda is Draft.';
check('document words are not read as names', scan(policy).findings.length === 0, JSON.stringify(scan(policy).findings.map(f => f.value)));

const unk = 'The ED of a land trust in Moncton spoke with Oluwaseun yesterday.';
check('an unfamiliar name after "spoke with" is caught', ticked(scan(unk)).includes('Oluwaseun'), JSON.stringify(ticked(scan(unk))));

const jane = 'Jane Morrison called. Jane will join. Morrison\'s address is 12 King St. Email jane@x.com.';
const jm = masked(jane);
check('a first or last name on its own follows the full name', /\[PERSON_\d+_FIRST\]/.test(jm) && /\[PERSON_\d+_LAST\]/.test(jm), jm);
check('an address followed by a word starting with E is still masked', !/King/.test(jm), jm);
check('an email stays an email when the first name has a ticket', /\[EMAIL_\d+\]/.test(jm) && !/@x\.com/.test(jm), jm);

const tickedIn = t => ticked(scan(t));
check('a surname in mid-sentence is caught', tickedIn('We met with Brown and Nguyen yesterday.').includes('Brown') && tickedIn('We met with Brown and Nguyen yesterday.').includes('Nguyen'), JSON.stringify(tickedIn('We met with Brown and Nguyen yesterday.')));
check('a colour at the start of a sentence is not ticked', !tickedIn('Brown rice is good.').includes('Brown'), JSON.stringify(tickedIn('Brown rice is good.')));
check('everyday words that are also names are left alone at the start', scan('Will you come? May I ask?').findings.length === 0, JSON.stringify(scan('Will you come? May I ask?').findings.map(f => f.value)));
check('a pair with a known surname is ticked', tickedIn('The cheque came from Adaeze Okafor last week.').includes('Adaeze Okafor'), JSON.stringify(tickedIn('The cheque came from Adaeze Okafor last week.')));
check('francophone names are known', tickedIn('Merci à Geneviève Tremblay pour tout.').some(v => /Tremblay/.test(v)), JSON.stringify(tickedIn('Merci à Geneviève Tremblay pour tout.')));

for (const t of [hi, jane.replace('jane@x.com', 'jane@x.com'), days, 'Mark the date. Frank talk with Mark.',
  "O'Brien and Jean-Luc met Anne-Marie. Dr. Singh said Sam's idea was good."]) {
  const out = masked(t);
  check('round trip: ' + t.slice(0, 40), restore(out).text === t, restore(out).text);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
