import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(pkg.version, /^0\.\d+\.\d+$/);
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'Zichtbare appversie moet gelijk lopen met package.json');
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`), 'PWA-cacheversie moet gelijk lopen met package.json');
assert.match(app, /id=\"maintenanceFilter\"/);
assert.match(app, /Toon onderhoudsacties/);
assert.match(app, /maintenanceFilter\.onchange=\(\)=>draw\(maintenanceFilter\.value\)/);
assert.doesNotMatch(app, /document\.querySelectorAll\('\.chip'\)\.forEach/);
assert.match(styles, /\.action-filter-control/);
console.log('action-list-filter-v119: OK');
