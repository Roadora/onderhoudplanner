import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/quotes/quote-service.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/quotes_list_v128.sql',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(app,/nav\('quotes'\)/,'Meer bevat centrale Offertes-route');
assert.match(app,/async function quotesPage\(\)/,'Centrale offertes-pagina bestaat');
assert.match(app,/Filter op status/,'Offertes kunnen op status worden gefilterd');
assert.match(app,/data-quote-id/,'Een offerte uit het overzicht is direct te openen');
assert.match(app,/route\.back==='quotes'/,'Terug vanuit offerte gaat terug naar het offerteoverzicht');
assert.match(service,/list_quotes_v128/,'Quote-service gebruikt afgeschermde list-RPC');
assert.match(sql,/is_organization_owner/,'SQL-overzicht is alleen toegankelijk voor eigenaar');
assert.match(sql,/left join public\.customers/,'Offerteoverzicht levert klantnaam mee');
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'Zichtbare appversie moet gelijk lopen met package.json');
console.log('quotes-overview-v128: ok');
