const KEY = 'onderhoudplanner_v01';
const $ = (s) => document.querySelector(s);
const app = $('#app');
const pageTitle = $('#pageTitle');
const backBtn = $('#backBtn');

const demoState = {
  company: 'Airco Service',
  customers: [
    {id: crypto.randomUUID(), name:'Fam. Jansen', address:'Burgemeesterlaan 12, Rotterdam', phone:'0612345678', email:'info@jansenmail.nl'},
    {id: crypto.randomUUID(), name:'De Vries', address:'Dordrecht', phone:'0611122233', email:'devries@mail.nl'},
    {id: crypto.randomUUID(), name:'Bakker', address:'Gouda', phone:'0622233344', email:'bakker@mail.nl'}
  ],
  systems: []
};
demoState.systems = [
  sys(demoState.customers[0].id,'airco','Daikin','Emura','FTXG25LW','2026-06-07',12),
  sys(demoState.customers[1].id,'airco','Mitsubishi','LN35','MSZ-LN35','2026-06-18',12),
  sys(demoState.customers[2].id,'warmtepomp','Daikin','Stylish','WP-09','2026-06-25',12)
];

let state = load();
let route = {name:'dashboard'};
function sys(customerId,type,brand,model,serial,installedAt,interval){return {id: crypto.randomUUID(), customerId,type,brand,model,serial,installedAt,interval:Number(interval), lastService:null, reminderCustomer:true, reminderCompany:true, doneCount:0}}
function load(){try{return JSON.parse(localStorage.getItem(KEY)) || demoState}catch(e){return demoState}}
function save(){localStorage.setItem(KEY, JSON.stringify(state))}
function addMonths(date, months){const d=new Date(date+'T12:00:00'); d.setMonth(d.getMonth()+Number(months)); return d.toISOString().slice(0,10)}
function nextDate(s){return addMonths(s.lastService || s.installedAt, s.interval || 12)}
function daysUntil(date){const a=new Date(); a.setHours(0,0,0,0); const b=new Date(date+'T00:00:00'); return Math.ceil((b-a)/86400000)}
function fmt(date){return new Date(date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})}
function shortDate(date){return new Date(date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}).replace('.','').toUpperCase()}
function customer(id){return state.customers.find(c=>c.id===id)}
function systemsForCustomer(id){return state.systems.filter(s=>s.customerId===id)}
function sortedSystems(){return [...state.systems].sort((a,b)=>nextDate(a).localeCompare(nextDate(b)))}
function dueLabel(s){const d=daysUntil(nextDate(s)); if(d<0)return `<span class="due redtext">${Math.abs(d)} dagen verlopen</span>`; if(d===0)return `<span class="due redtext">Vandaag</span>`; return `<span class="due">Over ${d} dagen</span>`}
function nav(name, params={}){route={name,...params}; render();}

function render(){
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===route.name));
  backBtn.hidden = ['dashboard','customers','agenda','settings'].includes(route.name);
  backBtn.onclick = () => nav(route.back || 'dashboard');
  const map={dashboard:'Dashboard',customers:'Klanten',agenda:'Agenda',settings:'Instellingen',new:'Nieuwe installatie',detail:'Klantdetail'};
  pageTitle.textContent = map[route.name] || 'OnderhoudPlanner';
  if(route.name==='dashboard') return dashboard();
  if(route.name==='customers') return customers();
  if(route.name==='agenda') return agenda();
  if(route.name==='settings') return settings();
  if(route.name==='new') return newInstall();
  if(route.name==='detail') return detail(route.customerId);
}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>nav(b.dataset.route));

function stats(){
  const now=state.systems.length, dueThisMonth=state.systems.filter(s=>{const d=daysUntil(nextDate(s)); return d>=0 && d<=30}).length;
  const overdue=state.systems.filter(s=>daysUntil(nextDate(s))<0).length;
  const done=state.systems.reduce((n,s)=>n+(s.doneCount||0),0);
  return {customers:state.customers.length,dueThisMonth,overdue,done,later:Math.max(0,now-dueThisMonth-overdue)};
}
function statCards(){const s=stats(); return `<div class="stats"><div class="stat">👥<b>${s.customers}</b><span>Actieve klanten</span></div><div class="stat">📅<b>${s.dueThisMonth}</b><span>Binnen 30 dagen</span></div><div class="stat">⚠️<b>${s.overdue}</b><span>Verlopen</span></div><div class="stat">✅<b>${s.done}</b><span>Uitgevoerd</span></div></div>`}
function systemCard(s, compact=false){const c=customer(s.customerId)||{}; return `<article class="card ${compact?'compact':''}" onclick="nav('detail',{customerId:'${s.customerId}',back:'${route.name}'})"><div class="row"><div class="avatar">${s.type==='warmtepomp'?'♨️':'❄️'}</div><div><p class="title">${c.name||'Onbekende klant'}</p><p class="muted">${s.brand} ${s.model}</p><p class="muted">📍 ${c.address||''}</p></div><div class="right-chevron">›</div></div><div class="row between" style="margin-top:10px"><span class="muted">${fmt(nextDate(s))}</span>${dueLabel(s)}</div></article>`}
function dashboard(){const next=sortedSystems().slice(0,4); app.innerHTML=`<section class="screen">${statCards()}<div class="list-header"><h2>Komende onderhoudsbeurten</h2><button class="link" onclick="nav('agenda')">Bekijk alles</button></div>${next.map(systemCard).join('')||'<div class="card empty">Nog geen systemen.</div>'}</section>`}
function customers(){app.innerHTML=`<section class="screen"><input class="search" id="search" placeholder="Zoek klant..."/><h2>Klanten</h2><div id="customerList"></div></section>`; const renderList=()=>{const q=$('#search').value.toLowerCase(); $('#customerList').innerHTML=state.customers.filter(c=>c.name.toLowerCase().includes(q)||c.address.toLowerCase().includes(q)).map(c=>`<article class="card" onclick="nav('detail',{customerId:'${c.id}',back:'customers'})"><div class="row between"><div><p class="title">${c.name}</p><p class="muted">${c.address}</p><p class="muted">${systemsForCustomer(c.id).length} systeem/systemen</p></div><span class="right-chevron">›</span></div></article>`).join('')||'<div class="card empty">Geen klanten gevonden.</div>'}; $('#search').oninput=renderList; renderList();}
function agenda(){const list=sortedSystems(); app.innerHTML=`<section class="screen"><div class="tabs"><button class="active">Lijst</button><button>Kalender later</button></div><h2>Onderhoudsplanning</h2>${list.map(s=>{const d=shortDate(nextDate(s)).split(' '); const c=customer(s.customerId)||{}; return `<article class="card compact" onclick="nav('detail',{customerId:'${s.customerId}',back:'agenda'})"><div class="row"><div class="datebox">${d[0]}<small>${d[1]||''}</small></div><div><p class="title">${c.name}</p><p class="muted">${s.brand} ${s.model}</p><p class="muted">📍 ${c.address}</p></div><div class="right-chevron">${dueLabel(s)}</div></div></article>`}).join('')||'<div class="card empty">Geen onderhoud gepland.</div>'}</section>`}
function detail(id){const c=customer(id); if(!c)return nav('customers'); const systems=systemsForCustomer(id); app.innerHTML=`<section class="screen"><article class="card"><div class="row"><div class="avatar">❄️</div><div><p class="title">${c.name} <span class="pill">Actief</span></p><p class="muted">${c.address}</p><p class="muted">☎ ${c.phone}</p><p class="muted">✉ ${c.email}</p></div></div><div class="actions"><a class="secondary" href="tel:${c.phone}">📞 Bel klant</a><a class="secondary whatsapp" href="https://wa.me/31${c.phone.replace(/^0/,'')}?text=${encodeURIComponent('Hallo '+c.name+', het is weer tijd voor onderhoud. Zullen we een afspraak plannen?')}">💬 WhatsApp</a></div></article><h2>Systemen</h2>${systems.map(s=>`<article class="card"><div class="row between"><p class="title">${s.type==='warmtepomp'?'Warmtepomp':'Airco'} / ${s.brand} ${s.model}</p>${dueLabel(s)}</div><div class="detail-grid" style="margin-top:12px"><div class="mini"><span>Serienummer</span><b>${s.serial||'-'}</b></div><div class="mini"><span>Installatie</span><b>${fmt(s.installedAt)}</b></div><div class="mini"><span>Interval</span><b>Elke ${s.interval} maanden</b></div><div class="mini"><span>Volgend onderhoud</span><b>${fmt(nextDate(s))}</b></div></div><div class="notice" style="margin-top:12px">Reminder naar bedrijf: ${s.reminderCompany?'aan':'uit'} · Reminder naar klant: ${s.reminderCustomer?'aan':'uit'}</div><div class="actions"><button class="secondary" onclick="markDone('${s.id}')">✅ Onderhoud uitgevoerd</button><button class="danger" onclick="deleteSystem('${s.id}')">🗑 Verwijder</button></div></article>`).join('')}<button class="primary" onclick="nav('new',{customerId:'${c.id}',back:'detail'})">+ Systeem toevoegen bij deze klant</button></section>`}
function newInstall(){const selected=route.customerId||''; app.innerHTML=`<section class="screen"><form class="form" id="newForm"><div class="card form"><h2>Klantgegevens</h2><div class="field"><label>Bestaande klant</label><select name="existing"><option value="">Nieuwe klant</option>${state.customers.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${c.name}</option>`).join('')}</select></div><div class="field"><label>Klantnaam</label><input name="name" placeholder="Bijv. Fam. Jansen"></div><div class="field"><label>Adres</label><input name="address" placeholder="Straat, plaats"></div><div class="two"><div class="field"><label>Telefoon</label><input name="phone" placeholder="06..."></div><div class="field"><label>E-mail</label><input name="email" placeholder="mail@..."></div></div></div><div class="card form"><h2>Systeem</h2><div class="two"><div class="field"><label>Type</label><select name="type"><option value="airco">Airco</option><option value="warmtepomp">Warmtepomp</option></select></div><div class="field"><label>Interval</label><select name="interval"><option value="12">12 maanden</option><option value="6">6 maanden</option><option value="24">24 maanden</option></select></div></div><div class="two"><div class="field"><label>Merk</label><input name="brand" placeholder="Daikin"></div><div class="field"><label>Model</label><input name="model" placeholder="Emura"></div></div><div class="field"><label>Serienummer</label><input name="serial" placeholder="FTXG25LW"></div><div class="field"><label>Installatiedatum</label><input name="installedAt" type="date" required></div><label><input type="checkbox" name="reminderCompany" checked> Herinner mij / mijn bedrijf</label><label><input type="checkbox" name="reminderCustomer" checked> Herinner ook de klant</label></div><button class="primary" type="submit">Opslaan</button></form></section>`; const f=$('#newForm'); const fill=()=>{const c=customer(f.existing.value); ['name','address','phone','email'].forEach(k=>{f[k].value=c?c[k]:''; f[k].disabled=!!c;});}; f.existing.onchange=fill; fill(); f.onsubmit=(e)=>{e.preventDefault(); let cid=f.existing.value; if(!cid){const c={id:crypto.randomUUID(),name:f.name.value||'Nieuwe klant',address:f.address.value,phone:f.phone.value,email:f.email.value}; state.customers.push(c); cid=c.id;} const s=sys(cid,f.type.value,f.brand.value||'-',f.model.value||'-',f.serial.value,f.installedAt.value, f.interval.value); s.reminderCompany=f.reminderCompany.checked; s.reminderCustomer=f.reminderCustomer.checked; state.systems.push(s); save(); nav('detail',{customerId:cid,back:'customers'});};}
function markDone(id){const s=state.systems.find(x=>x.id===id); if(!s)return; s.lastService=new Date().toISOString().slice(0,10); s.doneCount=(s.doneCount||0)+1; save(); render();}
function deleteSystem(id){if(!confirm('Systeem verwijderen?'))return; state.systems=state.systems.filter(s=>s.id!==id); save(); render();}
function settings(){app.innerHTML=`<section class="screen"><article class="card"><p class="title">Instellingen</p><p class="muted">v0.1 werkt lokaal met localStorage. Supabase/login en automatische e-mails komen later.</p><button class="danger" onclick="resetDemo()">Reset demo-data</button></article></section>`}
function resetDemo(){localStorage.removeItem(KEY); state=JSON.parse(JSON.stringify(demoState)); save(); nav('dashboard')}
window.nav=nav; window.markDone=markDone; window.deleteSystem=deleteSystem; window.resetDemo=resetDemo;
render();


const fabAdd = document.getElementById('fabAdd');
function updateFab(){
  if(!fabAdd) return;
  fabAdd.style.display = ['dashboard','customers','agenda'].includes(route.name) ? 'block' : 'none';
  fabAdd.onclick = ()=>nav('new',{back:route.name});
}
const _renderOriginal = render;
render = function(){
  _renderOriginal();
  updateFab();
}
updateFab();
