import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

assert.match(app, /Aantal complete systemen/);
assert.match(app, /surveySystemCount/);
assert.match(app, /normalizedSurveySystems/);
assert.match(app, /surveySystemCard/);
assert.match(app, /systemCount:count, systems/);
assert.match(app, /Multi split · 2–5 binnenunits/);
assert.match(app, /\['4','4 binnenunits'\]/);
assert.match(app, /\['5','5 binnenunits'\]/);
assert.match(app, /SYSTEEM \$\{number\}/);
assert.match(css, /survey-system-card/);
assert.match(config, /0\.11\.4 Meerdere systemen/);
console.log('v0.11.4 multiple-systems survey checks: OK');
