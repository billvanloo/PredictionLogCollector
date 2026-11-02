// Browser checks for the Prediction Log Collector: the standard shell checks (as a
// teacher tool), then spec 07's test cases and acceptance criteria through the page.
// Run: node dev/e2e.js   (needs Playwright: npm i --no-save playwright)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const kit = require('./vendor/e2e-kit.js');
const PL = require('./vendor/prediction-log.js');
const gen = require('./fixtures/generate.js');

(async () => {
  const root = path.join(__dirname, '..');
  const t = await kit.start(root);
  const { page } = t;
  const shots = path.join(root, 'docs', 'screenshots');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plc-e2e-'));
  const put = (name, text) => { const p = path.join(tmp, name); fs.writeFileSync(p, text); return p; };
  const rec = o => PL.makeRecord(Object.assign({ tool: 'Shaft and Beam Workbench', toolVersion: '1.0.0', student: 'Ana', team: 'Team 1', classPeriod: '2', problemId: 'SB-6', quantity: 'safety factor n', unit: '', model: 4.10, attempt: 1, timestamp: '2026-10-01T10:00:00-04:00' }, o));
  const json = recs => JSON.stringify(PL.toJSON(recs));
  const load = async paths => { await page.setInputFiles('#shFile', paths); await page.waitForTimeout(250); };
  const nData = () => page.evaluate(() => window.__pc.data().length);
  const status = () => page.textContent('#pcStatus');
  const live = async txt => page.waitForFunction(x => document.getElementById('shLive').textContent.includes(x), txt, { timeout: 2000 }).then(() => true).catch(() => false);

  // A small class: three students, two tools, a measured value, and one student who improves.
  const classFiles = [
    put('Ana_shaft.json', json([rec({ predicted: 3.8 }), rec({ predicted: 4.0, attempt: 2, timestamp: '2026-10-01T10:05:00-04:00' }),
      rec({ problemId: 'SB-1', quantity: 'reaction R_A', unit: 'N', model: 500, predicted: 650, measured: 470, timestamp: '2026-10-02T10:00:00-04:00' })])),
    put('Ben_shaft.json', json([rec({ student: 'Ben', team: 'Team 2', predicted: 5.33, timestamp: '2026-10-01T11:00:00-04:00' }), rec({ student: 'Ben', team: 'Team 2', predicted: 4.51, attempt: 2, timestamp: '2026-10-01T11:02:00-04:00' }), rec({ student: 'Ben', team: 'Team 2', predicted: 4.18, attempt: 3, timestamp: '2026-10-01T11:04:00-04:00' })])),
    put('Cy_conveyor.csv', PL.toCSV([rec({ student: 'Cy', team: 'Team 2', classPeriod: '3', tool: 'Conveyor Designer', problemId: 'CD-1', quantity: 'belt pull T_e', unit: 'N', model: 22.56, predicted: 22, timestamp: '2026-10-03T09:00:00-04:00' }),
      rec({ student: 'Cy', team: 'Team 2', classPeriod: '3', tool: 'Conveyor Designer', problemId: 'CD-1', quantity: 'belt pull T_e', unit: 'N', model: 22.56, predicted: 22.4, measured: 25.1, attempt: 2, timestamp: '2026-10-03T09:03:00-04:00' })])),
  ];

  await kit.standard(t, {
    teacherTool: true,
    mutate: async p => { await p.evaluate(() => window.__app.selectTab('students')); },
    shotDir: shots, shotName: 'prediction-log-collector',
  });

  console.log('Empty page');
  await t.fresh();
  t.ok('the privacy note "Nothing leaves this browser" is shown', (await page.textContent('#shInputs')).includes('Nothing leaves this browser.') && (await page.textContent('#shStage')).includes('never uploaded'));
  t.ok('the empty chart says how measured values get there', (await page.textContent('#pcDraw')).includes('No measured values yet'));
  t.ok('Export merged CSV is off with nothing loaded', await page.isDisabled('#pcExport'));

  console.log('Loading several files at once');
  await load(classFiles);
  t.ok('all three files load: 8 records', await nData() === 8);
  t.ok('the status line counts files and records', (await status()).startsWith('3 files read, 8 records added.'), await status());
  t.ok('the load is announced', await live('3 files read, 8 records added.'));
  t.ok('totals line', (await page.textContent('#pcTotals')).startsWith('8 records · 3 students · 3 quantities across 3 problems · 2 with a measured value'), await page.textContent('#pcTotals'));
  const row = pid => page.evaluate(id => [...document.querySelectorAll('#pcProbT tbody tr')].map(tr => [...tr.children].map(td => td.textContent)).find(c => c[0] === id), pid);
  const sb6 = await row('SB-6');
  t.ok('SB-6: 2 students, median of 7.32% and 30.0% off on the first try = 18.7%', sb6[2] === '2' && sb6[3] === '18.7%', JSON.stringify(sb6));
  t.ok('SB-6: half the students within 5% on the first try? none: 0%', sb6[4] === '0%', sb6[4]);
  t.ok('SB-6: tries to within 5%: Ana 2, Ben 3, median 2.5', sb6[5] === '2.5', sb6[5]);
  const cd1 = await row('CD-1');
  t.ok('CD-1 (from a CSV file): 2.48% off, within 5% on the first try', cd1[3] === '2.48%' && cd1[4] === '100%' && cd1[5] === '1', JSON.stringify(cd1));
  t.ok('measured against model: one group per problem with a measurement', await page.locator('#pcDraw svg circle').count() === 2);
  t.ok('the chart has the 0% reference line and its label', (await page.textContent('#pcDraw')).includes('Dashed line at 0%: the lab matched the model') && await page.locator('#pcDraw line[stroke-dasharray]').count() === 1);
  await kit.noBadNumbers(t, 'class loaded');

  console.log('PL-6: the same file loaded twice');
  await load([classFiles[0]]);
  t.ok('PL-6 record count is unchanged', await nData() === 8);
  t.ok('PL-6 the message says how many duplicates were removed', (await status()).startsWith('1 file read, 0 records added, 3 duplicates removed.'), await status());

  console.log('PL-7 and PL-8: a newer file and a broken one, loaded with a good one');
  const newer = put('newer.json', JSON.stringify({ schema: 'prediction-log', schemaVersion: 2, records: [Object.assign(rec({ student: 'Dee', predicted: 4.2 }), { schemaVersion: 2, extra: 1 })] }));
  const broken = put('broken.json', '{"schema": "prediction-log", "records": [');
  const design = put('design.json', JSON.stringify({ schema: 'shaft-loads', schemaVersion: 1 }));
  await load([newer, broken, design]);
  t.ok('PL-7 the newer file loads its known fields', await nData() === 9);
  t.ok('PL-7 the warning names the file and says "made by a newer tool version; some fields may be ignored"', (await page.textContent('#pcFiles')).includes('newer.json: made by a newer tool version; some fields may be ignored'));
  t.ok('PL-8 the broken file is listed as failed, with the reason', /broken\.json: this is not valid JSON/.test(await page.textContent('#pcFailed')));
  t.ok('another kind of file is refused with a clear reason', /design\.json: .*not a prediction log/.test(await page.textContent('#pcFailed')), await page.textContent('#pcFailed'));
  t.ok('PL-8 the status line counts the failures', (await status()).includes('2 files failed'), await status());

  console.log('Filters');
  await page.selectOption('#pcFStu', 'Ben');
  t.ok('Student filter: Ben\'s 3 records', (await page.textContent('#pcTotals')).startsWith('3 records match the filters (of 9)'), await page.textContent('#pcTotals'));
  await page.selectOption('#pcFStu', '');
  await page.selectOption('#pcFMod', '5');
  t.ok('Module 5 matches the Shaft and Beam Workbench and the Conveyor Designer (all 9)', (await page.textContent('#pcTotals')).startsWith('9 records'));
  await page.selectOption('#pcFMod', '4');
  t.ok('Module 4 leaves out the Conveyor Designer (7)', (await page.textContent('#pcTotals')).startsWith('7 records match'));
  t.ok('module options are the ones the loaded tools cover', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#pcFMod option')].map(o => o.value))) === JSON.stringify(['', '4', '5']));
  await page.selectOption('#pcFMod', '');
  await page.selectOption('#pcFTeam', 'Team 2');
  await page.selectOption('#pcFPer', '3');
  t.ok('Team and period filters combine (Cy: 2 records)', (await page.textContent('#pcTotals')).startsWith('2 records match'));
  await page.click('#pcReset');
  t.ok('Show everything clears the filters', (await page.textContent('#pcTotals')).startsWith('9 records ·') && (await page.inputValue('#pcFTeam')) === '');
  await page.fill('#pcFrom', '2026-10-02');
  t.ok('From date: records on or after 2 October (3)', (await page.textContent('#pcTotals')).startsWith('3 records match'), await page.textContent('#pcTotals'));
  await page.fill('#pcTo', '2026-10-02');
  t.ok('From and To the same day: 1 record', (await page.textContent('#pcTotals')).startsWith('1 record match'));
  await page.click('#pcReset');
  t.ok('Show everything clears the dates too', (await page.inputValue('#pcFrom')) === '' && (await page.textContent('#pcTotals')).startsWith('9 records ·'));

  console.log('Sorting with the keyboard');
  const firstCol = sel => page.evaluate(s => [...document.querySelectorAll(s + ' tbody tr')].map(tr => tr.children[0].textContent), sel);
  t.ok('the problem table starts sorted by problem', JSON.stringify(await firstCol('#pcProbT')) === JSON.stringify(['CD-1', 'SB-1', 'SB-6']));
  await page.focus('#pcProbT .sortbtn[data-key="medAbs1"]'); await page.keyboard.press('Enter');
  t.ok('Enter on a heading sorts by it (median % off, smallest first)', JSON.stringify(await firstCol('#pcProbT')) === JSON.stringify(['CD-1', 'SB-6', 'SB-1']), JSON.stringify(await firstCol('#pcProbT')));
  t.ok('focus stays on the heading after sorting', await page.evaluate(() => document.activeElement.classList.contains('sortbtn') && document.activeElement.dataset.key === 'medAbs1'));
  t.ok('the heading says how it is sorted', (await page.getAttribute('#pcProbT th:nth-child(4)', 'aria-sort')) === 'ascending');
  await page.keyboard.press('Enter');
  t.ok('Enter again reverses it', JSON.stringify(await firstCol('#pcProbT')) === JSON.stringify(['SB-1', 'SB-6', 'CD-1']) && (await page.getAttribute('#pcProbT th:nth-child(4)', 'aria-sort')) === 'descending');
  t.ok('the sort is announced', await live('Sorted by Median % off, 1st try, descending.'));

  console.log('Students and records views');
  await page.evaluate(() => window.__app.selectTab('students'));
  t.ok('Students: one row each (Ana, Ben, Cy, Dee)', JSON.stringify(await firstCol('#pcStuT')) === JSON.stringify(['Ana', 'Ben', 'Cy', 'Dee']));
  await page.evaluate(() => window.__app.selectTab('records'));
  t.ok('Records: every record, 9 rows', await page.locator('#pcRecT tbody tr').count() === 9);
  t.ok('a record with model 0 or none would show "not defined"; these all have a model', !(await page.textContent('#pcRecT')).includes('NaN'));
  await page.evaluate(() => window.__app.selectTab('summary'));

  console.log('Show the working');
  const wk = await page.textContent('#shWorkingBody');
  t.ok('the working shows how the top row is worked out, from the records', wk.includes('How the top row of the problem summary is worked out') && wk.includes('(predicted − model) ÷ model × 100'), wk.slice(0, 200));

  console.log('Export merged CSV, and reading it back');
  const csv = await kit.download(t, () => page.click('#pcExport'));
  t.ok('file name: class_prediction-log-collector_merged_<date>.csv', /^class_prediction-log-collector_merged_\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name), csv.name);
  const back = PL.parseFile('x.csv', csv.buf.toString('utf8')).records;
  t.ok('the merged CSV has all 9 records', back.length === 9);
  await page.click('#pcClear');
  t.ok('Clear loaded data empties the page', await nData() === 0 && (await page.textContent('#pcTotals')).startsWith('Load some'));
  await load([put('merged.csv', csv.buf.toString('utf8'))]);
  t.ok('the merged CSV reloads to the same 9 records', await nData() === 9);
  await page.selectOption('#pcFStu', 'Ana');
  const anaCsv = await kit.download(t, () => page.click('#pcExport'));
  t.ok('export follows the filters (Ana: 3 records)', PL.parseFile('a.csv', anaCsv.buf.toString('utf8')).records.length === 3);
  await page.click('#pcReset');

  console.log('PL-11: a CSV saved back from Google Sheets');
  await page.click('#pcClear');
  await load([path.join(__dirname, 'fixtures', 'sheets-resaved.csv')]);
  t.ok('PL-11 the Sheets copy loads (2 records, blank rows skipped)', await nData() === 2 && !(await page.textContent('#pcFiles')).includes('Could not read'));
  t.ok('PL-11 timestamps are back in ISO form', await page.evaluate(() => window.__pc.data().every(r => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.timestamp))));

  console.log('Loaded data is not kept after a reload (QUESTIONS Q28)');
  await page.selectOption('#pcFStu', await page.evaluate(() => window.__pc.data()[0].student));
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForFunction(() => !!window.__app);
  t.ok('after a reload no records are held', await nData() === 0 && (await page.textContent('#pcTotals')).startsWith('Load some'));
  t.ok('nothing from the records is in localStorage', await page.evaluate(() => !Object.keys(localStorage).some(k => /"predicted"|pctPredVsModel/.test(localStorage.getItem(k) || ''))));
  t.ok('the saved Student filter is kept, and marked when its student is not loaded', /not in the loaded files/.test(await page.evaluate(() => { const s = document.getElementById('pcFStu'); return s.options[s.selectedIndex].text; })));
  await page.click('#pcReset');

  console.log('The drop zone works from the keyboard');
  await page.focus('#pcDrop');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
  t.ok('Enter on the drop zone opens the file chooser for several files', chooser.isMultiple());
  await chooser.setFiles(classFiles); await page.waitForTimeout(250);
  t.ok('files chosen there load', await nData() === 8);

  console.log('PL-10: 500 files and 20,000 records in the browser');
  await page.click('#pcClear');
  const big = gen.makeClass({ files: 500, perFile: 40, seed: 7 });
  const ms = await page.evaluate(files => { const a = performance.now(); window.__pc.load(files); return performance.now() - a; }, big);
  t.ok('PL-10 all 20,000 records load', await nData() === 20000);
  t.ok('PL-10 large groups are drawn as boxes, not thousands of dots', await page.locator('#pcDraw rect title').count() === 10 && await page.locator('#pcDraw circle').count() === 0);
  t.ok('big counts have thousands separators', (await status()).startsWith('500 files read, 20,000 records added.'));
  t.ok('PL-10 load, summarize and draw in under 3 s (' + ms.toFixed(0) + ' ms)', ms < 3000);
  t.ok('PL-10 the records view shows one page of 100 rows', await page.evaluate(() => { window.__app.selectTab('records'); return document.querySelectorAll('#pcRecT tbody tr').length; }) === 100);
  await page.click('#pcPager [data-page="1"]');
  t.ok('Next shows rows 101 to 200', (await page.textContent('#pcPager')).includes('Rows 101–200 of 20,000'));
  const ms2 = await page.evaluate(() => { const a = performance.now(); document.getElementById('pcFStu').value = 'Student 007'; document.getElementById('pcFStu').dispatchEvent(new Event('change')); return performance.now() - a; });
  t.ok('a filter change on 20,000 records takes under 1 s (' + ms2.toFixed(0) + ' ms)', ms2 < 1000);
  await page.evaluate(() => window.__app.selectTab('summary'));
  await page.click('#pcReset');
  await page.evaluate(() => document.getElementById('shToast').classList.remove('on')); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, 'prediction-log-collector-class.png') });
  await kit.noBadNumbers(t, 'PL-10');

  console.log('Logs exported from the real tools (sibling repos, skipped when absent)');
  const sibs = ['ShaftBeamWorkbench', 'MotorDriveMatcher', 'FrictionScrewLab', 'FlywheelBrakeLab', 'ConveyorDesigner', 'UnitsFormulaChecker'].filter(r => fs.existsSync(path.join(root, '..', r, 'index.html')));
  if (!sibs.length) console.log('  (no sibling tool repos found next to this one)');
  const real = [];
  for (const r of sibs) {
    const p2 = await t.context.newPage(); t.watch(p2);
    await p2.goto('file://' + path.join(root, '..', r, 'index.html')); await p2.waitForFunction(() => !!window.__app);
    await p2.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
    await p2.reload(); await p2.waitForFunction(() => !!window.__app);
    await p2.click('#shPredict');
    await p2.locator('#shPfBox input').first().fill('1');
    await p2.locator('#shPfBox [data-check]').first().click();
    await p2.click('#shLog');
    const [d] = await Promise.all([p2.waitForEvent('download'), p2.click('#shLogJson')]);
    real.push(put(r + '_log.json', fs.readFileSync(await d.path(), 'utf8')));
    await p2.close();
  }
  if (sibs.length) {
    await page.click('#pcClear');
    await load(real);
    const tools = await page.evaluate(() => new Set(window.__pc.data().map(r => r.tool)).size);
    t.ok('a log from each of the ' + sibs.length + ' tools loads, one tool name each', tools === sibs.length && !(await page.textContent('#pcFiles')).includes('Could not read'), tools + ' tools; ' + (await page.textContent('#pcFiles')));
    t.ok('every real record shows up in the problem summary', await page.evaluate(() => window.__pc.view().problems.length) >= sibs.length);
    await kit.noBadNumbers(t, 'real tool logs');
  }

  console.log('Report');
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('#pcPrint');
  const rep = await page.evaluate(() => ({ printed: window.__printed, text: document.getElementById('sh-report').textContent }));
  t.ok('Print summary prints the report', rep.printed === 1);
  t.ok('the report has the problem summary, the students and why medians', ['Problem summary (first attempts)', 'Students', 'Why medians', 'Files loaded'].every(s => rep.text.includes(s)));

  console.log('Help explains the medians (acceptance)');
  await page.click('#shHelp');
  t.ok('help says why medians, not means', (await page.textContent('#shHelpDlg')).includes('a few wild predictions don\'t swamp the picture'));
  await page.keyboard.press('Escape');

  fs.writeFileSync(path.join(shots, 'perf.txt'), 'PL-10: 500 files, 20,000 records, load + summarize + draw in the browser: ' + ms.toFixed(0) + ' ms; filter change: ' + ms2.toFixed(0) + ' ms\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  await t.finish();
})().catch(e => { console.error(e); process.exit(1); });
