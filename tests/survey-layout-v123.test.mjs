import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.match(app, /survey-layout-panel/);
assert.match(app, /survey-layout-stack/);
assert.match(app, /survey-layout-compact-grid/);
assert.match(app, />Nog controleren<\/option>/);
assert.match(css, /\.survey-layout-panel\{/);
assert.match(css, /\.survey-layout-compact-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.survey-layout-compact-grid \.field label\{min-height:32px/);
assert.match(css, /@media\(max-width:360px\)\{\.survey-layout-compact-grid\{grid-template-columns:1fr\}/);
assert.doesNotMatch(css, /survey-mounting-section/);
console.log('survey-layout-v123: ok');
