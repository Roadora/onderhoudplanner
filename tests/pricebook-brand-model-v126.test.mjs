import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

assert.match(app, /function priceBookBrandOptions/);
assert.match(app, /function priceBookModelOptions/);
assert.match(app, /name=\"brandChoice\"/);
assert.match(app, /name=\"modelChoice\"/);
assert.match(app, /Alle merken \/ geen specifiek merk/);
assert.match(app, /Alle modellen \/ geen specifiek model/);
assert.match(app, /Anders \/ handmatig/);
assert.match(app, /MODEL_OPTIONS\[brandChoice\]/);
assert.match(app, /selectedBrand==='Anders\.\.\.'/);
assert.match(app, /selectedModel==='Anders\.\.\.'/);
assert.doesNotMatch(app, /surveyField\('brand','Merk \(optioneel\)'/);
assert.doesNotMatch(app, /surveyField\('model','Model \/ serie \(optioneel\)'/);

console.log('v0.12.6 pricebook brand/model dropdown regression tests passed');
