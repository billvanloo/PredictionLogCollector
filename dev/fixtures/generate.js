// Generated class data for testing the Collector (spec 07 PL-10: 500 files,
// 20,000 records). Seeded, so every run makes the same files. Each file is one
// student's prediction-log export from one tool, in the shared JSON format.
'use strict';
const PL = require('../vendor/prediction-log.js');

const TOOLS = [
  { tool: 'Shaft and Beam Workbench', problems: [['SB-6', 'safety factor n', '', 4.0975], ['SB-1', 'reaction R_A', 'N', 500]] },
  { tool: 'Motor and Drive Matcher', problems: [['MD-1', 'output speed N_out', 'rpm', 84.04], ['MD-2', 'recommended ratio i', '', 2.70]] },
  { tool: 'Friction and Screw Lab', problems: [['FS-4', 'handle force F', 'N', 13.4], ['FS-4', 'torque to raise T_R', 'N·m', 4.02]] },
  { tool: 'Flywheel Brake Lab', problems: [['FB-1', 'stopping time t', 's', 0.898], ['FB-1', 'braking torque T_b', 'N·m', 3.15]] },
  { tool: 'Conveyor Designer', problems: [['CD-1', 'belt pull T_e', 'N', 22.56], ['CD-3', 'shaft side load R', 'N', 51.37]] },
];

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// files × perFile records; returns [{ name, text }].
function makeClass(o) {
  const files = o.files || 500, perFile = o.perFile || 40, rand = rng(o.seed || 7);
  const out = [];
  for (let f = 0; f < files; f++) {
    const student = 'Student ' + String(f % 125 + 1).padStart(3, '0');
    const t = TOOLS[f % TOOLS.length];
    const recs = [];
    const day0 = Date.UTC(2026, 9, 1 + (f % 20), 14, 0, 0);
    for (let k = 0; k < perFile; k++) {
      const [pid, q, unit, model] = t.problems[k % t.problems.length];
      const attempt = Math.floor(k / t.problems.length) + 1;
      // Students start far off and close in with attempts, with the odd wild guess.
      const spread = 40 / attempt + (rand() < 0.03 ? 300 : 0);
      const predicted = Number((model * (1 + (rand() - 0.5) * spread / 50)).toPrecision(3));
      const measured = rand() < 0.2 ? Number((model * (0.85 + rand() * 0.2)).toPrecision(3)) : null;
      const ts = new Date(day0 + k * 60000).toISOString().slice(0, 19) + '-04:00';
      recs.push(PL.makeRecord({ tool: t.tool, toolVersion: '1.0.0', student, team: 'Team ' + (f % 25 + 1), classPeriod: String(f % 5 + 1), problemId: pid, quantity: q, unit, predicted, model, measured, attempt, timestamp: ts, inputs: { values: { x: k }, units: { x: '' } } }));
    }
    out.push({ name: student.replace(' ', '-') + '_' + t.tool.toLowerCase().replace(/ /g, '-') + '_prediction-log.json', text: JSON.stringify(PL.toJSON(recs)) });
  }
  return out;
}

module.exports = { makeClass, TOOLS };
