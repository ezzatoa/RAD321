/* Dependency-free structural checks for the RAD 321 offline lab package. */
'use strict';

const fs = require('fs');
const path = require('path');

const webRoot = path.resolve(__dirname, '..', 'labs', 'webapp');
const models = require(path.join(webRoot, 'shared', 'lab-models.js'));
const issues = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const htmlFiles = walk(webRoot).filter((file) => file.endsWith('.html'));

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(referencePattern)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(reference)) continue;
    const target = path.resolve(path.dirname(file), reference.split(/[?#]/)[0]);
    if (!fs.existsSync(target)) {
      issues.push(`Broken reference in ${path.relative(webRoot, file)}: ${reference}`);
    }
  }

  const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(inlineScriptPattern)) {
    if (!match[1].trim()) continue;
    try {
      Function(match[1]);
    } catch (error) {
      issues.push(`Invalid inline script in ${path.relative(webRoot, file)}: ${error.message}`);
    }
  }
}

const dashboard = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
if (/lab-\d+-teacher\.html/i.test(dashboard)) {
  issues.push('The student dashboard exposes an instructor answer-key handout.');
}

const labFiles = Array.from({ length: 15 }, (_, index) =>
  path.join(webRoot, 'labs', `lab-${String(index + 1).padStart(2, '0')}`, 'index.html')
);
labFiles.forEach((file) => {
  if (!fs.existsSync(file)) issues.push(`Missing lab: ${path.relative(webRoot, file)}`);
});

for (const file of labFiles.slice(1)) {
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const configMatch = html.match(/const LAB = (\{[\s\S]*?\n\};)/) || html.match(/const LAB = (\{[^\r\n]+\});/);
  if (!configMatch) {
    issues.push(`Cannot read LAB configuration: ${path.relative(webRoot, file)}`);
    continue;
  }
  let labJson = configMatch[1];
  if (labJson.endsWith(';')) labJson = labJson.slice(0, -1);
  const lab = JSON.parse(labJson);
  if (lab.controls.length !== 4) issues.push(`Lab ${lab.week} does not have four experimental controls.`);
  if (lab.quiz.length < 4) issues.push(`Lab ${lab.week} has fewer than four knowledge-check questions.`);
  if (!lab.procedure || lab.procedure.length < 5) issues.push(`Lab ${lab.week} lacks a complete controlled procedure.`);
  if (!lab.scenario || lab.scenario.options.length < 4) issues.push(`Lab ${lab.week} lacks a complete clinical decision.`);
  if (lab.minimumRuns < 3) issues.push(`Lab ${lab.week} requires fewer than three unique runs.`);

  const baselineValues = Object.fromEntries(lab.controls.map((control) => [control.id, control.value]));
  const baseline = JSON.stringify(models.compute(lab.type, baselineValues).metrics);
  for (const control of lab.controls) {
    const changedValues = { ...baselineValues };
    changedValues[control.id] = control.value === control.min ? control.max : control.min;
    const changed = JSON.stringify(models.compute(lab.type, changedValues).metrics);
    if (changed === baseline) issues.push(`Lab ${lab.week} control ${control.id} does not affect any metric.`);
  }
}

const summary = {
  htmlFiles: htmlFiles.length,
  labs: labFiles.filter(fs.existsSync).length,
  modelLabs: labFiles.slice(1).filter(fs.existsSync).length,
  issues
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (issues.length) process.exitCode = 1;
