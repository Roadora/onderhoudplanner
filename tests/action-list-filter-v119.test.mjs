import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.match(app, /id=\"maintenanceFilter\"/);
assert.match(app, /Toon onderhoudsacties/);
assert.match(app, /maintenanceFilter\.onchange=\(\)=>draw\(maintenanceFilter\.value\)/);
assert.doesNotMatch(app, /document\.querySelectorAll\('\.chip'\)\.forEach/);
assert.match(styles, /\.action-filter-control/);
console.log('action-list-filter-v119: OK');
