// Prediction Log Collector core (spec 07 Part B). Merges prediction-log files
// from many students and tools, removes exact duplicates, filters, and
// summarizes: per problem, per student, and measured against model. Summaries
// use the median of the absolute percent difference, so a few wild predictions
// don't swamp the picture (spec 07 §6). Pure functions; tested in dev/test.js.
const CollectorCore = (function () {
  'use strict';
  const PL = typeof PredictionLog !== 'undefined' ? PredictionLog : require('./vendor/prediction-log.js');
  const St = typeof Stats !== 'undefined' ? Stats : require('./vendor/stats.js');
  const isNum = v => typeof v === 'number' && isFinite(v);
  const WITHIN = 5;                                       // percent: the "close" band (spec 00 §4.5)

  // Unit modules per tool (ecosystem/schemas.md; QUESTIONS Q27). "all" matches every module.
  const MODULES = {
    'Truss Stress Visualizer': [0, 2, 4, 5], 'Motor and Drive Matcher': [1, 5], 'Gear Train Workbench': [1, 5],
    'Friction and Screw Lab': [2], 'Flywheel Brake Lab': [3], 'Shaft and Beam Workbench': [4, 5],
    'Conveyor Designer': [5], 'Units and Formula Checker': 'all',
  };
  const MODULE_LIST = [0, 1, 2, 3, 4, 5];
  function modulesOf(tool) { const m = MODULES[tool]; return m === 'all' ? MODULE_LIST : (m || []); }

  /* ------------------------------------------------------------ loading (§4.1.1–2) */
  // files: [{ name, text, error }]. Returns the merged, deduplicated list and a line per file.
  function loadFiles(files, existing) {
    const report = [];
    let incoming = [];
    for (const f of files) {
      if (f.text === null || f.text === undefined) { report.push({ name: f.name, ok: false, error: f.error || 'the file could not be read' }); continue; }
      try {
        const res = PL.parseFile(f.name, f.text);
        incoming = incoming.concat(res.records);
        report.push({ name: f.name, ok: true, count: res.records.length, warnings: res.warnings });
      } catch (e) {
        report.push({ name: f.name, ok: false, error: e.message });
      }
    }
    const before = (existing || []).length;
    const d = PL.dedupe((existing || []).concat(incoming));
    return { records: d.records, files: report, read: incoming.length, added: d.records.length - before, removed: d.removed };
  }
  // One sentence about a load, for the status line and the live region.
  function loadMessage(res) {
    const ok = res.files.filter(f => f.ok).length, bad = res.files.filter(f => !f.ok);
    let t = ok + ' file' + (ok === 1 ? '' : 's') + ' read, ' + res.added.toLocaleString('en-US') + ' record' + (res.added === 1 ? '' : 's') + ' added';
    if (res.removed) t += ', ' + res.removed.toLocaleString('en-US') + ' duplicate' + (res.removed === 1 ? '' : 's') + ' removed';
    if (bad.length) t += ', ' + bad.length + ' file' + (bad.length === 1 ? '' : 's') + ' failed';
    return t + '.';
  }

  /* ------------------------------------------------------------ filters (§4.1.3) */
  const dateOf = r => { const s = PL.wallClock(r.timestamp); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
  function filter(records, f) {
    f = f || {};
    return records.filter(r =>
      (f.module === '' || f.module === undefined || f.module === null || modulesOf(r.tool).indexOf(+f.module) >= 0) &&
      (!f.tool || r.tool === f.tool) && (!f.problem || r.problemId === f.problem) && (!f.quantity || r.quantity === f.quantity) &&
      (!f.student || r.student === f.student) && (!f.team || r.team === f.team) && (!f.period || r.classPeriod === f.period) &&
      (!f.from || dateOf(r) >= f.from) && (!f.to || (dateOf(r) && dateOf(r) <= f.to)));
  }
  function options(records) {
    const uniq = key => Array.from(new Set(records.map(key).filter(x => x !== '' && x !== null && x !== undefined))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const dates = records.map(dateOf).filter(Boolean).sort();
    return {
      tool: uniq(r => r.tool), problem: uniq(r => r.problemId), quantity: uniq(r => r.quantity), student: uniq(r => r.student),
      team: uniq(r => r.team), period: uniq(r => r.classPeriod),
      module: MODULE_LIST.filter(m => records.some(r => modulesOf(r.tool).indexOf(m) >= 0)),
      from: dates[0] || '', to: dates[dates.length - 1] || '',
    };
  }

  /* ------------------------------------------------------------ summaries (§4.1.4) */
  const absPct = r => isNum(r.pctPredVsModel) ? Math.abs(r.pctPredVsModel) : null;
  const key3 = r => r.student + '\u0001' + r.problemId + '\u0001' + r.quantity;
  // Each student's attempts at one problem and quantity, in attempt order.
  function byStudentProblem(records) {
    const m = new Map();
    for (const r of records) { const k = key3(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    for (const list of m.values()) list.sort((a, b) => a.attempt - b.attempt || String(a.timestamp).localeCompare(String(b.timestamp)));
    return m;
  }
  // PL-9: the first attempt (by number) whose |%| is within 5%, or null if none is.
  function attemptsToWithin(list) {
    const hit = list.find(r => { const a = absPct(r); return a !== null && a <= WITHIN; });
    return hit ? hit.attempt : null;
  }
  function problemSummary(records) {
    const groups = new Map();
    for (const [, list] of byStudentProblem(records)) {
      const r0 = list[0], k = r0.problemId + '\u0001' + r0.quantity;
      if (!groups.has(k)) groups.set(k, { problemId: r0.problemId, quantity: r0.quantity, unit: r0.unit, tools: new Set(), lists: [] });
      const g = groups.get(k); g.lists.push(list); g.tools.add(r0.tool);
    }
    const rows = [];
    for (const g of groups.values()) {
      const firsts = g.lists.map(l => absPct(l[0])).filter(x => x !== null);
      const reached = g.lists.map(attemptsToWithin).filter(x => x !== null);
      rows.push({
        problemId: g.problemId, quantity: g.quantity, unit: g.unit, tools: Array.from(g.tools),
        students: g.lists.length, firstN: firsts.length,
        medAbs1: firsts.length ? St.median(firsts) : null,
        within1: firsts.length ? firsts.filter(x => x <= WITHIN).length / firsts.length * 100 : null,
        medAttempts: reached.length ? St.median(reached) : null,
        reached: reached.length, notYet: g.lists.length - reached.length,
        records: g.lists.reduce((s, l) => s + l.length, 0),
      });
    }
    return rows;
  }
  function studentSummary(records) {
    const m = new Map();
    for (const [, list] of byStudentProblem(records)) {
      const r0 = list[0];
      if (!m.has(r0.student)) m.set(r0.student, { student: r0.student, teams: new Set(), periods: new Set(), firsts: [], records: 0 });
      const s = m.get(r0.student);
      s.records += list.length; if (r0.team) s.teams.add(r0.team); if (r0.classPeriod) s.periods.add(r0.classPeriod);
      s.firsts.push({ t: PL.wallClock(r0.timestamp), abs: absPct(r0), problemId: r0.problemId, quantity: r0.quantity });
    }
    return Array.from(m.values()).map(s => {
      const pts = s.firsts.filter(x => x.abs !== null).sort((a, b) => a.t.localeCompare(b.t));
      const half = Math.floor(pts.length / 2);
      const early = pts.length >= 4 ? St.median(pts.slice(0, half).map(x => x.abs)) : null;
      const late = pts.length >= 4 ? St.median(pts.slice(pts.length - half).map(x => x.abs)) : null;
      // Trend: compare the median of the earlier half of first attempts with the later half.
      const trend = early === null ? 'too few to tell' : late < early * 0.8 ? 'closer' : late > early * 1.25 ? 'further off' : 'about the same';
      return {
        student: s.student, team: Array.from(s.teams).join(', '), period: Array.from(s.periods).join(', '),
        problems: s.firsts.length, records: s.records,
        medAbs1: pts.length ? St.median(pts.map(x => x.abs)) : null,
        points: pts, early, late, trend,
      };
    });
  }
  // §4.1.4: measured against model, grouped by problem and quantity (records with a measured value only).
  function measuredVsModel(records) {
    const g = new Map();
    for (const r of records) {
      if (!isNum(r.pctMeasVsModel)) continue;
      const k = r.problemId + ' · ' + r.quantity;
      if (!g.has(k)) g.set(k, { label: k, problemId: r.problemId, quantity: r.quantity, values: [] });
      g.get(k).values.push(r.pctMeasVsModel);
    }
    return Array.from(g.values()).map(x => Object.assign(x, { median: St.median(x.values) }));
  }

  /* ------------------------------------------------------------ sorting */
  function sortBy(rows, key, dir) {
    const d = dir < 0 ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = a[key], y = b[key];
      if (x === y) return 0;
      if (x === null || x === undefined || x === '') return 1;           // blanks last either way
      if (y === null || y === undefined || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * d;
    });
  }

  function totals(records) {
    return {
      records: records.length, students: new Set(records.map(r => r.student)).size, tools: new Set(records.map(r => r.tool)).size,
      problems: new Set(records.map(r => r.problemId + '\u0001' + r.quantity)).size, measured: records.filter(r => isNum(r.measured)).length,
      noModel: records.filter(r => r.pctPredVsModel === null).length,
    };
  }

  return { WITHIN, MODULES, MODULE_LIST, modulesOf, loadFiles, loadMessage, filter, options, dateOf, problemSummary, studentSummary, measuredVsModel, attemptsToWithin, byStudentProblem, sortBy, totals };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CollectorCore;
