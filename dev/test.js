// Prediction Log Collector: spec 07 test cases PL-6 to PL-11 (PL-1 to PL-5 are the
// record format, tested in the EngineeredByTheNumbers ecosystem), plus the summaries,
// filters and sorting the interface relies on.
// Run: node dev/test.js
'use strict';
const C = require('./core.js');
const PL = require('./vendor/prediction-log.js');
const { makeClass } = require('./fixtures/generate.js');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}
const near = (name, got, exp, tol) => ok(name, typeof got === 'number' && Math.abs(got - exp) <= (tol || 1e-9), 'got ' + got + ', expected ' + exp);
let ts = Date.UTC(2026, 9, 1, 14, 0, 0);
const rec = o => PL.makeRecord(Object.assign({ tool: 'Shaft and Beam Workbench', toolVersion: '1.0.0', student: 'A', problemId: 'SB-6', quantity: 'safety factor n', unit: '', model: 4.0975, attempt: 1, timestamp: new Date(ts += 60000).toISOString().slice(0, 19) + '-04:00' }, o));
const file = (name, records) => ({ name, text: JSON.stringify(PL.toJSON(records)) });

console.log('PL-6: the same file twice');
{
  const f = file('a.json', [rec({ predicted: 3.8 }), rec({ predicted: 4.1, attempt: 2 })]);
  const one = C.loadFiles([f], []);
  const two = C.loadFiles([f], one.records);
  ok('PL-6 record count unchanged after the second load', one.records.length === 2 && two.records.length === 2);
  ok('PL-6 the duplicates are counted', two.removed === 2 && two.added === 0);
  ok('PL-6 the message says how many were removed', C.loadMessage(two) === '1 file read, 0 records added, 2 duplicates removed.');
  const both = C.loadFiles([f, f], []);
  ok('the same file twice in one load', both.records.length === 2 && both.removed === 2);
}

console.log('PL-7: a file from a newer version');
{
  const r = C.loadFiles([{ name: 'new.json', text: JSON.stringify({ schema: 'prediction-log', schemaVersion: 2, records: [Object.assign(rec({ predicted: 3.8 }), { schemaVersion: 2, newField: 'x' })] }) }], []);
  ok('PL-7 loads the known fields', r.records.length === 1 && r.records[0].predicted === 3.8 && !('newField' in r.records[0]));
  ok('PL-7 warns "made by a newer tool version; some fields may be ignored"', r.files[0].ok && r.files[0].warnings.indexOf('made by a newer tool version; some fields may be ignored') >= 0);
}

console.log('PL-8: a malformed file');
{
  const r = C.loadFiles([{ name: 'bad.json', text: '{"schema": "prediction-log", "records": [' }, file('good.json', [rec({ predicted: 4 })]), { name: 'gone.csv', text: null, error: 'the file could not be read' }, { name: 'other.json', text: '{"schema":"shaft-loads","loads":[]}' }], []);
  ok('PL-8 the malformed file is listed as failed, with the reason', !r.files[0].ok && /not valid JSON/.test(r.files[0].error));
  ok('PL-8 the other files still load', r.records.length === 1 && r.files[1].ok);
  ok('an unreadable file and a different kind of file are explained too', r.files[2].error === 'the file could not be read' && /shaft-loads/.test(r.files[3].error));
  ok('the message counts the failures', /3 files failed/.test(C.loadMessage(r)));
}

console.log('PL-9: attempts to within 5%');
{
  const list = [rec({ predicted: 4.0975 * 1.30, attempt: 1 }), rec({ predicted: 4.0975 * 0.88, attempt: 2 }), rec({ predicted: 4.0975 * 1.03, attempt: 3 })];
  ok('PL-9 30%, 12%, 3% off: attempts to within 5% = 3', C.attemptsToWithin(list) === 3);
  const s = C.problemSummary(list)[0];
  ok('the problem summary gives a median of 3 attempts for one student', s.medAttempts === 3 && s.reached === 1 && s.notYet === 0);
  near('first-attempt median |%| is 30', s.medAbs1, 30, 1e-9);
  ok('never within 5% counts as not yet', C.attemptsToWithin([rec({ predicted: 8 })]) === null);
}

console.log('Problem summary (§4.1.4)');
{
  // Five students' first attempts: 2%, 4%, 10%, 30% and one wild 400%. The median ignores the wild one.
  const offs = [0.02, -0.04, 0.10, -0.30, 4.0];
  const recs = offs.map((o, k) => rec({ student: 'S' + k, predicted: 4.0975 * (1 + o) }));
  recs.push(rec({ student: 'S0', predicted: 4.0975, attempt: 2 }));
  recs.push(rec({ student: 'S3', predicted: 4.0975 * 1.02, attempt: 2 }));
  recs.push(rec({ student: 'S3', problemId: 'SB-1', quantity: 'reaction R_A', unit: 'N', model: 500, predicted: 520 }));
  const rows = C.problemSummary(recs);
  const sb6 = rows.find(r => r.problemId === 'SB-6');
  ok('one row per problem and quantity', rows.length === 2 && sb6.students === 5);
  near('first-attempt median |%| = 10 (the wild 400% does not swamp it)', sb6.medAbs1, 10, 1e-9);
  near('share within 5% on the first attempt = 40%', sb6.within1, 40, 1e-9);
  ok('median attempts to within 5%: S0 1, S1 1, S3 2 → 1', sb6.medAttempts === 1 && sb6.reached === 3 && sb6.notYet === 2);
  const noModel = C.problemSummary([rec({ predicted: 3, model: 0 })])[0];
  ok('a record with no model value is counted but not in the medians', noModel.students === 1 && noModel.firstN === 0 && noModel.medAbs1 === null);
}

console.log('Student summary');
{
  const recs = [];
  const probs = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  [40, 30, 25, 6, 4, 2].forEach((p, k) => recs.push(rec({ student: 'Ana', problemId: probs[k], predicted: 4.0975 * (1 + p / 100) })));
  recs.push(rec({ student: 'Ana', problemId: 'P1', predicted: 4.0975, attempt: 2 }));
  recs.push(rec({ student: 'Bo', predicted: 4.0975 * 1.5 }));
  const s = C.studentSummary(recs);
  const ana = s.find(x => x.student === 'Ana');
  ok('problems attempted and records', ana.problems === 6 && ana.records === 7);
  near('median first-attempt |%| = 15.5', ana.medAbs1, 15.5, 1e-9);
  ok('trend over time: closer (earlier half 30%, later half 4%)', ana.trend === 'closer' && Math.abs(ana.early - 30) < 1e-9 && Math.abs(ana.late - 4) < 1e-9, ana.trend + ' ' + ana.early + ' ' + ana.late);
  ok('too few attempts to tell', s.find(x => x.student === 'Bo').trend === 'too few to tell');
}

console.log('Measured against model');
{
  const recs = [rec({ predicted: 4, measured: 3.5 }), rec({ student: 'B', predicted: 4, measured: 3.9 }), rec({ student: 'C', predicted: 4 }), rec({ tool: 'Friction and Screw Lab', problemId: 'FS-4', quantity: 'handle force F', unit: 'N', model: 13.4, predicted: 12, measured: 16 })];
  const g = C.measuredVsModel(recs);
  ok('one group per problem and quantity, measured values only', g.length === 2 && g[0].values.length === 2);
  near('FS-4 measured is 19.4% above the model', g[1].values[0], (16 - 13.4) / 13.4 * 100, 1e-9);
}

console.log('Filters (§4.1.3)');
{
  const recs = [rec({ predicted: 4, team: 'T1', classPeriod: '3' }), rec({ tool: 'Friction and Screw Lab', problemId: 'FS-4', quantity: 'handle force F', model: 13.4, predicted: 12, student: 'B', timestamp: '2026-10-20T10:00:00-04:00' }), rec({ tool: 'Units and Formula Checker', problemId: 'sandbox-abc', quantity: 'T', model: 15.9, predicted: 1.67, student: 'C' })];
  ok('module 2: the screw lab and the units checker (which serves every module)', C.filter(recs, { module: '2' }).map(r => r.student).join() === 'B,C');
  ok('module 4: the workbench and the units checker', C.filter(recs, { module: 4 }).map(r => r.student).join() === 'A,C');
  ok('tool, student, team and period', C.filter(recs, { tool: 'Friction and Screw Lab' }).length === 1 && C.filter(recs, { student: 'C' }).length === 1 && C.filter(recs, { team: 'T1', period: '3' }).length === 1);
  ok('date range', C.filter(recs, { from: '2026-10-15' }).map(r => r.student).join() === 'B' && C.filter(recs, { to: '2026-10-15' }).length === 2);
  const o = C.options(recs);
  ok('filter options list what is loaded', o.tool.length === 3 && o.module.join() === '0,1,2,3,4,5' && o.to === '2026-10-20');
  ok('a tool not in the table belongs to no module', C.modulesOf('Some Other Tool').length === 0);
}

console.log('Sorting');
{
  const rows = [{ a: 3 }, { a: null }, { a: 1 }, { a: 2 }];
  ok('ascending, blanks last', C.sortBy(rows, 'a', 1).map(r => r.a).join() === '1,2,3,');
  ok('descending, blanks still last', C.sortBy(rows, 'a', -1).map(r => r.a).join() === '3,2,1,');
  ok('text sorts naturally (Student 2 before Student 10)', C.sortBy([{ s: 'Student 10' }, { s: 'Student 2' }], 's', 1)[0].s === 'Student 2');
}

console.log('PL-10: 500 files, 20,000 records');
{
  const files = makeClass({ files: 500, perFile: 40, seed: 7 });
  const t0 = process.hrtime.bigint();
  const res = C.loadFiles(files, []);
  const ps = C.problemSummary(res.records), ss = C.studentSummary(res.records), mm = C.measuredVsModel(res.records), op = C.options(res.records), fl = C.filter(res.records, { module: '5' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok('PL-10 all 20,000 records load from 500 files', res.records.length === 20000 && res.files.length === 500 && res.files.every(f => f.ok));
  ok('PL-10 loads and summarizes in under 3 s (' + ms.toFixed(0) + ' ms in Node)', ms < 3000);
  ok('summaries cover every problem and student', ps.length === 10 && ss.length === 125 && mm.length === 10 && op.student.length === 125 && fl.length > 0);
  ok('the generated class closes in with attempts', ps.every(r => r.reached > 0));
}

console.log('PL-11: a CSV opened in Google Sheets and saved back');
{
  const orig = [rec({ student: 'O\'Brien, Ana "AJ"', predicted: 3.8, measured: 3.5, note: 'Friction, "maybe".', inputs: { values: { d: 0.02, L: 0.3 }, units: { d: 'm', L: 'm' } } }), rec({ student: 'Bo', predicted: 4.2, attempt: 2 })];
  const csv = PL.toCSV(orig);
  // Sheets: no byte order mark, LF line ends, its own date format, padded empty rows at the end.
  let sheets = csv.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  orig.forEach(r => { const d = r.timestamp.slice(0, 19); const [y, mo, dd] = d.slice(0, 10).split('-'); sheets = sheets.replace(r.timestamp, (+mo) + '/' + (+dd) + '/' + y + ' ' + d.slice(11)); });
  sheets += ',,,,,,,,,,,,,,,,,,\n,,,,,,,,,,,,,,,,,,\n';
  fs_write('sheets-resaved.csv', sheets);
  const back = C.loadFiles([{ name: 'sheets.csv', text: sheets }], []);
  ok('PL-11 reads back without loss: 2 records', back.records.length === 2 && back.files[0].ok);
  const a = back.records[0], o = orig[0];
  ok('PL-11 name, numbers, note and inputs are unchanged', a.student === o.student && a.predicted === o.predicted && a.model === o.model && a.measured === o.measured && a.note === o.note && JSON.stringify(a.inputs) === JSON.stringify(o.inputs));
  ok('PL-11 percent differences recomputed the same', Math.abs(a.pctPredVsModel - o.pctPredVsModel) < 1e-12 && Math.abs(a.pctMeasVsModel - o.pctMeasVsModel) < 1e-12);
  const merged = C.loadFiles([{ name: 'sheets.csv', text: sheets }], C.loadFiles([file('orig.json', orig)], []).records);
  ok('PL-11 the re-saved copy is a duplicate of the original', merged.records.length === 2 && merged.removed === 2);
}
function fs_write(name, text) { require('fs').writeFileSync(require('path').join(__dirname, 'fixtures', name), text); }

console.log('Totals');
{
  const t = C.totals([rec({ predicted: 4 }), rec({ student: 'B', predicted: 4, measured: 3 }), rec({ student: 'B', predicted: 1, model: 0 })]);
  ok('records, students, problems, measured, no model', t.records === 3 && t.students === 2 && t.problems === 1 && t.measured === 1 && t.noModel === 1);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
