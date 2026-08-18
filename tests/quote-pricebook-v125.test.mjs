import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/quotes/price-book-service.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/price_book_v125.sql',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');

assert.match(app,/priceBookMatchSystem/,'prijzenboekmatching ontbreekt');
assert.match(app,/quoteItemsFromSurvey/,'automatische offerte-opbouw ontbreekt');
assert.match(app,/Per compleet systeem maakt Optero automatisch één hoofdregel/,'uitleg over systeemregels ontbreekt');
assert.match(app,/kind:'system',systemIndex:index\+1/,'systeemregels worden niet per systeem opgebouwd');
assert.match(app,/Handmatig aangepast/,'handmatig prijslabel ontbreekt');
assert.match(app,/Opslaan als standaardprijs/,'prijs als standaard opslaan ontbreekt');
assert.match(app,/\+ Handmatige extra regel/,'handmatige extra offerteregel ontbreekt');
assert.match(app,/Extra uit prijzenboek/,'extra prijzenboekregel ontbreekt');
assert.match(app,/nav\('priceBook'/,'prijzenboekroute ontbreekt');
assert.match(service,/list_price_book_v125/,'prijzenboek service read RPC ontbreekt');
assert.match(service,/upsert_price_book_item_v125/,'prijzenboek service write RPC ontbreekt');
assert.match(sql,/create table if not exists public\.price_book_items/,'prijzenboektabel ontbreekt');
assert.match(sql,/public\.is_organization_owner/,'prijzenboek is niet eigenaar-afgeschermd');
assert.match(css,/quote-system-row/,'systeemregel styling ontbreekt');
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'appversie moet gelijk lopen met package.json');
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`), 'PWA-cacheversie moet gelijk lopen met package.json');
console.log('quote-pricebook-v125: ok');
