const KEY = 'onderhoudplanner_v06_empty';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const pageTitle = $('#pageTitle');
const backBtn = $('#backBtn');
const fabAdd = $('#fabAdd');

const BRAND_OPTIONS = [
  'Daikin','Mitsubishi Electric','LG','Samsung','Panasonic','Toshiba','Fujitsu','Hitachi',
  'Midea','Haier','Carrier','Gree','Hisense','Bosch','NIBE','Vaillant','Remeha','Intergas',
  'Nefit Bosch','Atlantic','Viessmann','Stiebel Eltron','Weishaupt','Anders...'
];

const MODEL_OPTIONS = {
  'Daikin':['Emura','Stylish','Perfera','Comfora','Sensira','Ururu Sarara','Altherma','Multi+','Anders...'],
  'Mitsubishi Electric':['MSZ-LN','MSZ-AP','MSZ-AY','MSZ-HR','MSZ-EF','Ecodan','Anders...'],
  'LG':['Artcool','Dualcool','Standard Plus','Therma V','Anders...'],
  'Samsung':['WindFree Elite','WindFree Comfort','Luzon','EHS Mono','EHS Split','Anders...'],
  'Panasonic':['Etherea','TZ','BZ','Aquarea','Anders...'],
  'Toshiba':['Daiseikai','Haori','Seiya','Shorai Edge','Estia','Anders...'],
  'Fujitsu':['ASYG','KGTA','KMTA','Waterstage','Anders...'],
  'Hitachi':['airHome','Dodai','Mokai','Yutaki','Anders...'],
  'Midea':['Xtreme Save','Breezeless','Mission','Arctic','Anders...'],
  'Haier':['Pearl','Flexis','Tundra','Jade','Anders...'],
  'Carrier':['QHG','QHC','XPower','AquaSnap','Anders...'],
  'Gree':['Amber','Fairy','U-Crown','Versati','Anders...'],
  'Hisense':['Energy Pro','Wings','Easy Smart','Hi-Therma','Anders...'],
  'Bosch':['Climate 3000i','Climate 5000i','Compress 3400i','Compress 5800i','Anders...'],
  'NIBE':['S2125','F2120','F2040','VVM','AMS','Anders...'],
  'Vaillant':['aroTHERM plus','aroTHERM split','uniTOWER','Anders...'],
  'Remeha':['Elga Ace','Mercuria Ace','Eria Tower','Anders...'],
  'Intergas':['Xtend','Anders...'],
  'Nefit Bosch':['EnviLine','Compress 3400i','Compress 5800i','Anders...'],
  'Atlantic':['Alfea Extensa','Alfea Excellia','Fujitsu Atlantic','Anders...'],
  'Viessmann':['Vitocal 100-S','Vitocal 150-A','Vitocal 200-S','Anders...'],
  'Stiebel Eltron':['WPL','LWZ','WPE-I','Anders...'],
  'Weishaupt':['Biblock','Aeroblock','Anders...']
};

function makeSystem(customerId,type,brand,model,serial,installedAt,interval){
  return { id: crypto.randomUUID(), customerId, type, brand, model, serial, installedAt, interval:Number(interval), lastService:null, reminderCustomer:true, reminderCompany:true, doneCount:0 };
}

const demoState = {
  company:'Airco Service',
  customers:[],
  systems:[],
  appointments:[]
};

let state = load();
let route = {name:'dashboard'};
let calendarMonth = new Date();
let selectedAgendaDate = todayKey();

function load(){
  try{
    const old = JSON.parse(localStorage.getItem(KEY));
    const data = old || demoState;
    if(!data.appointments) data.appointments = [];
    return data;
  }catch(e){
    return demoState;
  }
}

function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function todayKey(){ return new Date().toISOString().slice(0,10); }
function toDateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addMonths(date, months){ const d=new Date(date+'T12:00:00'); d.setMonth(d.getMonth()+Number(months)); return d.toISOString().slice(0,10); }
function nextDate(s){ return addMonths(s.lastService || s.installedAt, s.interval || 12); }
function daysUntil(date){ const a=new Date(); a.setHours(0,0,0,0); const b=new Date(date+'T00:00:00'); return Math.ceil((b-a)/86400000); }
function fmt(date){ return new Date(date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}); }
function monthLabel(date){ return date.toLocaleDateString('nl-NL',{month:'long',year:'numeric'}); }
function esc(v=''){ return String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function customer(id){ return state.customers.find(c=>c.id===id); }
function systemById(id){ return state.systems.find(s=>s.id===id); }
function systemsForCustomer(id){ return state.systems.filter(s=>s.customerId===id); }
function sortedSystems(){ return [...state.systems].sort((a,b)=>nextDate(a).localeCompare(nextDate(b))); }
function appointments(){ return state.appointments || []; }
function appointmentsOnDate(date){ return appointments().filter(a=>a.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||'')); }
function appointmentForSystem(systemId){ return appointments().filter(a=>a.systemId===systemId).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]; }

function dueLabel(s){
  const d=daysUntil(nextDate(s));
  if(d<0) return `<span class="due redtext">${Math.abs(d)} dagen verlopen</span>`;
  if(d===0) return `<span class="due redtext">Vandaag</span>`;
  return `<span class="due">Over ${d} dagen</span>`;
}

function whatsappLink(c){
  const phone=(c.phone||'').replace(/\D/g,'').replace(/^0/,'31');
  const text=encodeURIComponent(`Hallo ${c.name}, het is weer tijd voor onderhoud. Zullen we een afspraak plannen?`);
  return `https://wa.me/${phone}?text=${text}`;
}

function nav(name, params={}){
  route = {name, ...params};
  render();
}

function updateFab(){
  const show = ['dashboard','customers','agenda'].includes(route.name);
  fabAdd.style.display = show ? 'block' : 'none';
  fabAdd.onclick = () => nav('new',{back:route.name});
}

function render(){
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===route.name));
  backBtn.hidden = ['dashboard','customers','agenda','settings'].includes(route.name);
  backBtn.onclick = () => navBack();

  const titles = {
    dashboard:'Dashboard', customers:'Klanten', agenda:'Agenda', settings:'Instellingen',
    new:'Nieuwe installatie', detail:'Klantdetail', editCustomer:'Klant bewerken',
    editSystem:'Systeem bewerken', planAppointment:'Afspraak plannen'
  };
  pageTitle.textContent = titles[route.name] || 'OnderhoudPlanner';

  if(route.name==='dashboard') dashboard();
  if(route.name==='customers') customers();
  if(route.name==='agenda') agenda();
  if(route.name==='settings') settings();
  if(route.name==='new') newInstall();
  if(route.name==='detail') detail(route.customerId);
  if(route.name==='editCustomer') editCustomer(route.customerId);
  if(route.name==='editSystem') editSystem(route.systemId);
  if(route.name==='planAppointment') planAppointment(route.systemId);

  updateFab();
}

function navBack(){
  if(route.name==='detail') return nav(route.back || 'dashboard');
  if(route.name==='editCustomer') return nav('detail',{customerId:route.customerId,back:'customers'});
  if(route.name==='editSystem' || route.name==='planAppointment'){
    const s = systemById(route.systemId);
    return nav('detail',{customerId:s ? s.customerId : null,back:'customers'});
  }
  return nav(route.back || 'dashboard');
}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>nav(b.dataset.route));

function stats(){
  const dueNow = state.systems.filter(s=>daysUntil(nextDate(s))<=0).length;
  const dueSoon = state.systems.filter(s=>{const d=daysUntil(nextDate(s)); return d>0 && d<=30;}).length;
  return { customers: state.customers.length, systems: state.systems.length, dueNow, dueSoon };
}

function statCards(){
  const s=stats();
  return `<div class="stats">
    <div class="stat">👥<b>${s.customers}</b><span>Actieve klanten</span></div>
    <div class="stat">❄️<b>${s.systems}</b><span>Systemen</span></div>
    <div class="stat">🔴<b>${s.dueNow}</b><span>Onderhoud nodig</span></div>
    <div class="stat">🟠<b>${s.dueSoon}</b><span>Binnen 30 dagen</span></div>
  </div>`;
}

function systemCard(s, compact=false){
  const c=customer(s.customerId)||{};
  return `<article class="card ${compact?'compact':''}" onclick="nav('detail',{customerId:'${s.customerId}',back:'${route.name}'})">
    <div class="row">
      <div class="avatar">${s.type==='warmtepomp'?'♨️':'❄️'}</div>
      <div>
        <p class="title">${c.name||'Onbekende klant'}</p>
        <p class="muted">${s.brand} ${s.model}</p>
        <p class="muted">📍 ${c.address||''}</p>
      </div>
      <div class="right-chevron">›</div>
    </div>
    <div class="row between" style="margin-top:10px">
      <span class="muted">${fmt(nextDate(s))}</span>${dueLabel(s)}
    </div>
  </article>`;
}

function dashboard(){
  const action = sortedSystems().filter(s=>daysUntil(nextDate(s))<=30).slice(0,4);
  app.innerHTML = `<section class="screen">
    ${statCards()}
    <div class="list-header">
      <h2>Komende onderhoudsbeurten</h2>
      <button class="link" onclick="nav('agenda')">Bekijk alles</button>
    </div>
    ${action.map(systemCard).join('') || '<div class="card empty">Geen onderhoud nodig.</div>'}
  </section>`;
}

function customers(){
  app.innerHTML = `<section class="screen">
    <input class="search" id="search" placeholder="Zoek klant..."/>
    <h2>Klanten</h2>
    <div id="customerList"></div>
  </section>`;

  const renderList=()=>{
    const q=$('#search').value.toLowerCase();
    $('#customerList').innerHTML = state.customers
      .filter(c=>c.name.toLowerCase().includes(q)||c.address.toLowerCase().includes(q))
      .map(c=>`<article class="card" onclick="nav('detail',{customerId:'${c.id}',back:'customers'})">
        <div class="row between">
          <div>
            <p class="title">${c.name}</p>
            <p class="muted">${c.address}</p>
            <p class="muted">${systemsForCustomer(c.id).length} systeem/systemen</p>
          </div>
          <span class="right-chevron">›</span>
        </div>
      </article>`).join('') || '<div class="card empty">Geen klanten gevonden.</div>';
  };
  $('#search').oninput=renderList;
  renderList();
}

function agenda(){
  const selectedSystems = sortedSystems().filter(s=>nextDate(s)===selectedAgendaDate);
  const selectedAppointments = appointmentsOnDate(selectedAgendaDate);
  app.innerHTML = `<section class="screen">
    <article class="card calendar-card">
      <div class="calendar-head">
        <button class="smallbtn" onclick="changeMonth(-1)">‹</button>
        <strong>${monthLabel(calendarMonth)}</strong>
        <button class="smallbtn" onclick="changeMonth(1)">›</button>
      </div>
      ${calendarGrid()}
    </article>

    <div class="list-header">
      <h2>${fmt(selectedAgendaDate)}</h2>
      <button class="link" onclick="goToday()">Vandaag</button>
    </div>

    <h2>Geplande afspraken</h2>
    ${selectedAppointments.map(appointmentCard).join('') || '<div class="card empty">Geen afspraken op deze dag.</div>'}

    <h2>Onderhoud nodig</h2>
    ${selectedSystems.map(agendaDayCard).join('') || '<div class="card empty">Geen onderhoud op deze dag.</div>'}

    <h2>Volgende onderhouden</h2>
    ${sortedSystems().slice(0,5).map(s=>systemCard(s,true)).join('') || '<div class="card empty">Geen onderhoud gepland.</div>'}
  </section>`;
}

function calendarGrid(){
  const y=calendarMonth.getFullYear();
  const m=calendarMonth.getMonth();
  const first=new Date(y,m,1);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const weekdays=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const eventDates = new Set([...state.systems.map(s=>nextDate(s)), ...appointments().map(a=>a.date)]);
  let cells='';

  for(let i=0;i<offset;i++) cells += '<button class="calendar-day blank" disabled></button>';

  for(let day=1;day<=daysInMonth;day++){
    const key=toDateKey(new Date(y,m,day));
    const has=eventDates.has(key);
    const active=selectedAgendaDate===key;
    const today=todayKey()===key;
    cells += `<button class="calendar-day ${has?'has-event':''} ${active?'active':''} ${today?'today':''}" onclick="selectAgendaDate('${key}')">
      <span>${day}</span>${has?'<i></i>':''}
    </button>`;
  }

  return `<div class="calendar-weekdays">${weekdays.map(w=>`<span>${w}</span>`).join('')}</div><div class="calendar-grid">${cells}</div>`;
}

function agendaDayCard(s){
  const c=customer(s.customerId)||{};
  return `<article class="card compact">
    <div class="row">
      <div class="avatar">${s.type==='warmtepomp'?'♨️':'❄️'}</div>
      <div>
        <p class="title">${c.name}</p>
        <p class="muted">${s.brand} ${s.model}</p>
        <p class="muted">📍 ${c.address}</p>
      </div>
    </div>
    <div class="actions">
      <a class="secondary" href="tel:${c.phone}">📞 Bel</a>
      <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
    </div>
    <div class="actions">
      <button class="secondary" onclick="nav('planAppointment',{systemId:'${s.id}',back:'agenda'})">📅 Afspraak plannen</button>
      <button class="smallbtn" onclick="nav('detail',{customerId:'${s.customerId}',back:'agenda'})">Open klant</button>
    </div>
  </article>`;
}

function appointmentCard(a){
  const s=systemById(a.systemId);
  if(!s) return '';
  const c=customer(s.customerId)||{};
  return `<article class="card compact">
    <div class="row between">
      <div>
        <p class="title">📅 ${a.time||'Tijd onbekend'} · ${c.name}</p>
        <p class="muted">${s.brand} ${s.model}</p>
        <p class="muted">${a.note||'Onderhoudsafspraak'}</p>
      </div>
      <button class="edit-btn" onclick="nav('planAppointment',{systemId:'${s.id}',appointmentId:'${a.id}',back:'agenda'})">✏️</button>
    </div>
    <div class="actions">
      <a class="secondary" href="tel:${c.phone}">📞 Bel</a>
      <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
    </div>
  </article>`;
}

function changeMonth(dir){
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+dir, 1);
  selectedAgendaDate = toDateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
  render();
}

function selectAgendaDate(key){
  selectedAgendaDate = key;
  render();
}

function goToday(){
  selectedAgendaDate = todayKey();
  calendarMonth = new Date();
  render();
}

function appointmentInfo(s){
  const a=appointmentForSystem(s.id);
  if(!a) return '<div class="notice appointment-empty" style="margin-top:12px">Nog geen afspraak ingepland.</div>';
  return `<div class="notice appointment-set" style="margin-top:12px"><b>Geplande afspraak</b><br>${fmt(a.date)} om ${a.time||'tijd onbekend'}<br>${a.note||'Onderhoudsafspraak'}</div>`;
}

function detail(id){
  const c=customer(id);
  if(!c) return nav('customers');
  const systems=systemsForCustomer(id);

  app.innerHTML = `<section class="screen">
    <article class="card">
      <div class="row">
        <div class="avatar">❄️</div>
        <div style="flex:1">
          <div class="row between">
            <p class="title">${c.name} <span class="pill">Actief</span></p>
            <button class="edit-btn" onclick="event.stopPropagation(); nav('editCustomer',{customerId:'${c.id}',back:'detail'})">✏️</button>
          </div>
          <p class="muted">${c.address}</p>
          <p class="muted">☎ ${c.phone}</p>
          <p class="muted">✉ ${c.email}</p>
        </div>
      </div>
      <div class="actions">
        <a class="secondary" href="tel:${c.phone}">📞 Bel klant</a>
        <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
      </div>
    </article>

    <h2>Systemen</h2>
    ${systems.map(s=>`<article class="card">
      <div class="row between">
        <p class="title">${s.type==='warmtepomp'?'Warmtepomp':'Airco'} / ${s.brand} ${s.model}</p>
        <button class="edit-btn" onclick="event.stopPropagation(); nav('editSystem',{systemId:'${s.id}',back:'detail'})">✏️</button>
      </div>
      <p style="margin:10px 0 0">${dueLabel(s)}</p>
      <div class="detail-grid" style="margin-top:12px">
        <div class="mini"><span>Serienummer</span><b>${s.serial||'-'}</b></div>
        <div class="mini"><span>Installatie</span><b>${fmt(s.installedAt)}</b></div>
        <div class="mini"><span>Interval</span><b>Elke ${s.interval} maanden</b></div>
        <div class="mini"><span>Volgend onderhoud</span><b>${fmt(nextDate(s))}</b></div>
      </div>
      <div class="notice" style="margin-top:12px">Reminder naar bedrijf: ${s.reminderCompany?'aan':'uit'} · Reminder naar klant: ${s.reminderCustomer?'aan':'uit'}</div>
      ${appointmentInfo(s)}
      <div class="actions">
        <button class="secondary" onclick="nav('planAppointment',{systemId:'${s.id}',back:'detail'})">📅 Afspraak plannen</button>
        <button class="secondary" onclick="markDone('${s.id}')">✅ Uitgevoerd</button>
      </div>
      <button class="danger" style="width:100%;margin-top:10px" onclick="deleteSystem('${s.id}')">🗑 Verwijder</button>
    </article>`).join('') || '<div class="card empty">Nog geen systemen bij deze klant.</div>'}
    <button class="primary" onclick="nav('new',{customerId:'${c.id}',back:'detail'})">+ Systeem toevoegen bij deze klant</button>
  </section>`;
}

function brandSelectOptions(value=''){
  const known = BRAND_OPTIONS.includes(value);
  return BRAND_OPTIONS.map(b => `<option value="${b}" ${((known && b===value) || (!known && b==='Anders...')) ? 'selected' : ''}>${b}</option>`).join('');
}

function modelSelectOptions(brand='', value=''){
  const list = MODEL_OPTIONS[brand] || ['Anders...'];
  const known = list.includes(value);
  return list.map(m => `<option value="${m}" ${((known && m===value) || (!known && m==='Anders...')) ? 'selected' : ''}>${m}</option>`).join('');
}

function toggleOtherBrand(form){
  const wrap = form.brandOther?.closest('.brand-other');
  if(wrap) wrap.classList.toggle('show', form.brand.value === 'Anders...');
}

function toggleOtherModel(form){
  const wrap = form.modelOther?.closest('.model-other');
  if(wrap) wrap.classList.toggle('show', form.model.value === 'Anders...');
}

function selectedBrand(form){
  if(form.brand.value === 'Anders...') return (form.brandOther.value || '').trim() || 'Anders';
  return form.brand.value || '-';
}

function selectedModel(form){
  if(form.model.value === 'Anders...') return (form.modelOther.value || '').trim() || 'Anders';
  return form.model.value || '-';
}

function refreshModelOptions(form, value=''){
  const brand = selectedBrand(form);
  form.model.innerHTML = modelSelectOptions(brand, value);
  toggleOtherModel(form);
}

function systemFormFields(s={}){
  const brand = s.brand || 'Daikin';
  const knownBrand = BRAND_OPTIONS.includes(brand);
  const model = s.model || '';
  const modelList = MODEL_OPTIONS[brand] || ['Anders...'];
  const knownModel = modelList.includes(model);

  return `<div class="card form">
    <h2>Systeem</h2>
    <div class="two">
      <div class="field">
        <label>Type</label>
        <select name="type">
          <option value="airco" ${s.type==='airco' || !s.type ? 'selected' : ''}>Airco</option>
          <option value="warmtepomp" ${s.type==='warmtepomp' ? 'selected' : ''}>Warmtepomp</option>
        </select>
      </div>
      <div class="field">
        <label>Interval</label>
        <select name="interval">
          <option value="12" ${Number(s.interval||12)===12?'selected':''}>12 maanden</option>
          <option value="6" ${Number(s.interval)===6?'selected':''}>6 maanden</option>
          <option value="24" ${Number(s.interval)===24?'selected':''}>24 maanden</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Merk</label><select name="brand">${brandSelectOptions(brand)}</select></div>
    <div class="field brand-other ${knownBrand?'':'show'}"><label>Eigen merk</label><input name="brandOther" value="${knownBrand?'':esc(brand)}" placeholder="Vul eigen merk in"></div>
    <div class="field"><label>Model</label><select name="model">${modelSelectOptions(brand, model)}</select></div>
    <div class="field model-other ${knownModel?'':'show'}"><label>Eigen model</label><input name="modelOther" value="${knownModel?'':esc(model)}" placeholder="Vul eigen model in"></div>
    <div class="field"><label>Serienummer</label><input name="serial" value="${esc(s.serial||'')}" placeholder="FTXG25LW"></div>
    <div class="field"><label>Installatiedatum</label><input name="installedAt" type="date" value="${s.installedAt||''}" required></div>
    <label><input type="checkbox" name="reminderCompany" ${s.reminderCompany!==false?'checked':''}> Herinner mij / mijn bedrijf</label>
    <label><input type="checkbox" name="reminderCustomer" ${s.reminderCustomer!==false?'checked':''}> Herinner ook de klant</label>
  </div>`;
}

function wireSystemForm(form, currentModel=''){
  form.brand.onchange=()=>{ toggleOtherBrand(form); refreshModelOptions(form); };
  form.model.onchange=()=>toggleOtherModel(form);
  toggleOtherBrand(form);
  refreshModelOptions(form, currentModel);
}

function editCustomer(id){
  const c=customer(id);
  if(!c) return nav('customers');
  const systems=systemsForCustomer(id);

  app.innerHTML = `<section class="screen">
    <form class="form" id="editCustomerForm">
      <article class="card form">
        <h2>Klant bewerken</h2>
        <div class="field"><label>Klantnaam</label><input name="name" value="${esc(c.name)}" required></div>
        <div class="field"><label>Adres</label><input name="address" value="${esc(c.address)}"></div>
        <div class="two">
          <div class="field"><label>Telefoon</label><input name="phone" value="${esc(c.phone)}"></div>
          <div class="field"><label>E-mail</label><input name="email" value="${esc(c.email)}"></div>
        </div>
      </article>
      <article class="card">
        <h2>Geplaatste systemen</h2>
        ${systems.map(s=>`<div class="edit-system-card"><div class="row between"><div><p class="title">${s.type==='warmtepomp'?'♨️ Warmtepomp':'❄️ Airco'}</p><p class="muted">${s.brand} ${s.model}</p><p class="muted">Volgend onderhoud: ${fmt(nextDate(s))}</p></div><button type="button" class="edit-btn" onclick="nav('editSystem',{systemId:'${s.id}',back:'editCustomer'})">✏️</button></div></div>`).join('') || '<p class="muted">Nog geen systemen.</p>'}
      </article>
      <button class="primary" type="submit">Klant opslaan</button>
    </form>
  </section>`;

  const f=$('#editCustomerForm');
  f.onsubmit=(e)=>{
    e.preventDefault();
    c.name=f.name.value.trim() || c.name;
    c.address=f.address.value.trim();
    c.phone=f.phone.value.trim();
    c.email=f.email.value.trim();
    save();
    nav('detail',{customerId:c.id,back:'customers'});
  };
}

function editSystem(id){
  const s=systemById(id);
  if(!s) return nav('customers');
  app.innerHTML = `<section class="screen"><form class="form" id="editSystemForm">${systemFormFields(s)}<button class="primary" type="submit">Systeem opslaan</button></form></section>`;
  const f=$('#editSystemForm');
  wireSystemForm(f, s.model);
  f.onsubmit=(e)=>{
    e.preventDefault();
    s.type=f.type.value;
    s.brand=selectedBrand(f);
    s.model=selectedModel(f);
    s.serial=f.serial.value.trim();
    s.installedAt=f.installedAt.value;
    s.interval=Number(f.interval.value);
    s.reminderCompany=f.reminderCompany.checked;
    s.reminderCustomer=f.reminderCustomer.checked;
    save();
    nav('detail',{customerId:s.customerId,back:'customers'});
  };
}

function newInstall(){
  const selected=route.customerId||'';
  app.innerHTML = `<section class="screen">
    <form class="form" id="newForm">
      <div class="card form">
        <h2>Klantgegevens</h2>
        <div class="field">
          <label>Bestaande klant</label>
          <select name="existing">
            <option value="">Nieuwe klant</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Klantnaam</label><input name="name" placeholder="Bijv. Fam. Jansen"></div>
        <div class="field"><label>Adres</label><input name="address" placeholder="Straat, plaats"></div>
        <div class="two">
          <div class="field"><label>Telefoon</label><input name="phone" placeholder="06..."></div>
          <div class="field"><label>E-mail</label><input name="email" placeholder="mail@..."></div>
        </div>
      </div>
      ${systemFormFields({type:'airco',brand:'Daikin',model:'Emura',serial:'',installedAt:'',interval:12,reminderCompany:true,reminderCustomer:true})}
      <button class="primary" type="submit">Opslaan</button>
    </form>
  </section>`;

  const f=$('#newForm');
  const fill=()=>{
    const c=customer(f.existing.value);
    ['name','address','phone','email'].forEach(k=>{
      f[k].value=c?c[k]:'';
      f[k].disabled=!!c;
    });
  };
  f.existing.onchange=fill;
  fill();
  wireSystemForm(f, 'Emura');

  f.onsubmit=(e)=>{
    e.preventDefault();
    let cid=f.existing.value;
    if(!cid){
      const c={id:crypto.randomUUID(),name:f.name.value||'Nieuwe klant',address:f.address.value,phone:f.phone.value,email:f.email.value};
      state.customers.push(c);
      cid=c.id;
    }
    const s=makeSystem(cid,f.type.value,selectedBrand(f),selectedModel(f),f.serial.value,f.installedAt.value,f.interval.value);
    s.reminderCompany=f.reminderCompany.checked;
    s.reminderCustomer=f.reminderCustomer.checked;
    state.systems.push(s);
    save();
    nav('detail',{customerId:cid,back:'customers'});
  };
}

function planAppointment(systemId){
  const s=systemById(systemId);
  if(!s) return nav('agenda');
  const c=customer(s.customerId)||{};
  const existing = route.appointmentId ? appointments().find(a=>a.id===route.appointmentId) : appointmentForSystem(systemId);
  const dateValue = existing ? existing.date : nextDate(s);
  const timeValue = existing ? existing.time : '09:00';
  const noteValue = existing ? existing.note : 'Jaarlijks onderhoud';

  app.innerHTML = `<section class="screen">
    <form class="form" id="appointmentForm">
      <article class="card">
        <p class="title">${c.name}</p>
        <p class="muted">${s.brand} ${s.model}</p>
        <p class="muted">📍 ${c.address||''}</p>
      </article>
      <article class="card form">
        <h2>Afspraak</h2>
        <div class="field"><label>Datum</label><input name="date" type="date" value="${dateValue}" required></div>
        <div class="field"><label>Tijd</label><input name="time" type="time" value="${timeValue}"></div>
        <div class="field"><label>Notitie</label><textarea name="note" rows="3" placeholder="Bijv. jaarlijks onderhoud">${esc(noteValue)}</textarea></div>
      </article>
      <button class="primary" type="submit">Afspraak opslaan</button>
      ${existing?`<button class="danger" type="button" onclick="deleteAppointment('${existing.id}','${systemId}')">Afspraak verwijderen</button>`:''}
    </form>
  </section>`;

  const f=$('#appointmentForm');
  f.onsubmit=(e)=>{
    e.preventDefault();
    if(existing){
      existing.date=f.date.value;
      existing.time=f.time.value;
      existing.note=f.note.value.trim();
    }else{
      state.appointments.push({id:crypto.randomUUID(),systemId,date:f.date.value,time:f.time.value,note:f.note.value.trim()});
    }
    save();
    selectedAgendaDate=f.date.value;
    calendarMonth=new Date(f.date.value+'T12:00:00');
    nav('agenda');
  };
}

function deleteAppointment(id, systemId){
  if(!confirm('Afspraak verwijderen?')) return;
  state.appointments = appointments().filter(a=>a.id!==id);
  save();
  const s=systemById(systemId);
  nav('detail',{customerId:s?s.customerId:null,back:'customers'});
}

function markDone(id){
  const s=systemById(id);
  if(!s) return;
  s.lastService=todayKey();
  s.doneCount=(s.doneCount||0)+1;
  state.appointments = appointments().filter(a=>a.systemId!==id);
  save();
  render();
}

function deleteSystem(id){
  if(!confirm('Systeem verwijderen?')) return;
  state.systems=state.systems.filter(s=>s.id!==id);
  state.appointments=appointments().filter(a=>a.systemId!==id);
  save();
  render();
}

function settings(){
  app.innerHTML = `<section class="screen">
    <article class="card">
      <p class="title">Instellingen</p>
      <p class="muted">v0.6 werkt lokaal met localStorage. Supabase/login en automatische e-mails komen later.</p>
      <button class="danger" onclick="resetDemo()">Reset demo-data</button>
    </article>
  </section>`;
}

function resetDemo(){
  localStorage.removeItem(KEY);
  state = {company:'Airco Service', customers:[], systems:[], appointments:[]};
  save();
  nav('dashboard');
}

Object.assign(window,{nav,changeMonth,selectAgendaDate,goToday,markDone,deleteSystem,resetDemo,deleteAppointment});
render();
