// Confirms the code inlined in index.html is exactly the tested code, then runs
// spec cases on the inline copy. Run: node dev/verify-html.js   (--fix copies dev/core.js in)
'use strict';
const path = require('path');
const vb = require('./vendor/verify-blocks.js');
const PL = require('./vendor/prediction-log.js'), Stats = require('./vendor/stats.js');
const root = path.join(__dirname, '..');
if (process.argv.includes('--fix') && vb.syncCore(root)) console.log('Copied dev/core.js into index.html.');
let passed = 0, failed = 0;
const ok = (n, c, d) => { if (c) { passed++; console.log('  PASS ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? ': ' + d : '')); } };

console.log('Inline blocks match dev/core.js and dev/vendor/');
const problems = vb.verify(root);
problems.forEach(p => ok(p, false));
ok('every inline block matches its tested copy', problems.length === 0);

console.log('Inline copy runs the spec cases');
const C = vb.loadInline(root, 'core', { PredictionLog: PL, Stats });
const rec = o => PL.makeRecord(Object.assign({ tool: 'Shaft and Beam Workbench', toolVersion: '1.0.0', student: 'A', problemId: 'SB-6', quantity: 'safety factor n', unit: '', model: 4.10, attempt: 1, timestamp: '2026-10-01T10:00:00-04:00' }, o));
const file = (name, recs) => ({ name, text: JSON.stringify(PL.toJSON(recs)) });
const f = file('a.json', [rec({ predicted: 3.8 }), rec({ predicted: 4.0, attempt: 2, timestamp: '2026-10-01T10:05:00-04:00' })]);
const two = C.loadFiles([f], C.loadFiles([f], []).records);
ok('PL-6 (inline) the same file twice adds nothing', two.records.length === 2 && two.removed === 2);
const bad = C.loadFiles([{ name: 'x.json', text: '{oops' }, f], []);
ok('PL-8 (inline) a malformed file fails with a reason; the rest load', !bad.files[0].ok && /not valid JSON/.test(bad.files[0].error) && bad.records.length === 2);
ok('PL-9 (inline) 30%, 12%, 3% off: 3 attempts', C.attemptsToWithin([rec({ predicted: 4.1 * 1.3 }), rec({ predicted: 4.1 * 1.12, attempt: 2 }), rec({ predicted: 4.1 * 1.03, attempt: 3 })]) === 3);
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
