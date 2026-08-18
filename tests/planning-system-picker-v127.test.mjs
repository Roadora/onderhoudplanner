import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(source, /<label>Bestaande installatie/);
assert.match(source, /\['onderhoud','storing','controle'\]\.includes\(field\(f,'type'\)\.value\)/);
assert.match(source, /wrap\.hidden=!show/);
assert.match(source, /if\(sys && !show\) sys\.value=''/);
assert.match(source, /const selectedSystemId=\['onderhoud','storing','controle'\]\.includes\(appointmentType\)/);
assert.doesNotMatch(source, /<label>Systeem \/ installatie/);
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'Zichtbare appversie moet gelijk lopen met package.json');
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`), 'PWA-cacheversie moet gelijk lopen met package.json');

console.log('v0.12.7 planning system picker regression checks passed');
