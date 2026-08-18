import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

const start = app.indexOf('async function surveyEditPage');
const end = app.indexOf('function quoteStatusLabel', start);
assert.ok(start >= 0 && end > start, 'surveyEditPage moet gevonden worden');
const edit = app.slice(start, end);

// Het oude afrondingsblok hoort niet meer in het actieve opnameformulier.
assert.doesNotMatch(edit, /Afronding opname/);
assert.doesNotMatch(edit, /name="scope"/);
assert.doesNotMatch(edit, /name="findings"/);
assert.doesNotMatch(edit, /name="technicalNotes"/);

// Camera en galerij zijn aparte, duidelijke acties.
assert.match(edit, /id="takeSurveyPhoto"/);
assert.match(edit, /id="chooseSurveyPhotos"/);
assert.match(edit, /id="surveyCameraInput" type="file" accept="image\/\*" capture="environment"/);
assert.match(edit, /id="surveyGalleryInput" type="file" accept="image\/\*" multiple/);

// Foto's worden direct na selectie geüpload en opnieuw uit cloud geladen.
assert.match(edit, /cameraInput\.onchange=\(\)=>uploadSelectedPhotos\(cameraInput\.files\)/);
assert.match(edit, /galleryInput\.onchange=\(\)=>uploadSelectedPhotos\(galleryInput\.files\)/);
assert.match(edit, /await uploadSurveyPhotos\(appointmentId,files\)/);
assert.match(edit, /currentPhotos=await listSurveyPhotos\(appointmentId\)/);
assert.doesNotMatch(edit, /\$\('#surveyPhotos'\)/);

// Historische tekstvelden blijven behouden wanneer een oud dossier opnieuw wordt opgeslagen.
assert.match(edit, /scope:value\.scope\|\|''/);
assert.match(edit, /findings:value\.findings\|\|''/);
assert.match(edit, /technicalNotes:value\.technical_notes\|\|''/);

assert.match(css, /\.survey-photo-actions\{/);
assert.match(css, /\.survey-photo-input\{position:absolute!important/);
assert.match(css, /\.survey-photo-status\.show\{display:block\}/);

assert.match(pkg.version, /^0\.\d+\.\d+$/);
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'Zichtbare appversie moet gelijk lopen met package.json');
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`), 'PWA-cacheversie moet gelijk lopen met package.json');

console.log('survey-camera-v124: ok');
