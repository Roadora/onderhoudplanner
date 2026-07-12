import { APP_VERSION, STORAGE_KEY as KEY, LEGACY_STORAGE_KEYS as LEGACY_KEYS } from './config.js';
import { localRepository } from './data/local-repository.js';
import { getAccountContext } from './account-context.js';

const $ = (s) => document.querySelector(s);
const field = (form, name) => form?.elements?.namedItem(name) || null;
const app = $('#app');
const pageTitle = $('#pageTitle');
const backBtn = $('#backBtn');
const fabAdd = $('#fabAdd');
const notifyBtn = $('#notifyBtn');
const accountBtn = $('#accountBtn');

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

const DEFAULT_SETTINGS = {
  companyName:'Airco Service',
  contactName:'',
  maintenancePrice:129,
  leadDays:45,
  defaultInterval:12,
  whatsappTemplate:'Hallo {naam}, volgens onze planning is het weer tijd voor onderhoud aan uw {systeem}. Zullen we een afspraak inplannen? Groet, {bedrijf}'
};

function uid(){
  if(globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}

function makeSystem(customerId,type,brand,model,serial,installedAt,interval){
  return {
    id:uid(), customerId, type, brand, model, serial, installedAt,
    interval:Number(interval), lastService:null, serviceStatus:'active', pausedUntil:null,
    statusNote:'', reminderCustomer:true, reminderCompany:true, doneCount:0,
    contactStatus:'not_contacted', lastContactAt:null, maintenancePrice:null
  };
}

const demoState = {
  company:'Airco Service',
  settings:{...DEFAULT_SETTINGS},
  customers:[],
  systems:[],
  appointments:[],
  updatedAt:null
};

let state = load();
const accountContext = getAccountContext();
if(accountContext){
  const accountCompany = accountContext.organization?.name || '';
  const accountName = accountContext.profile?.full_name || '';
  let accountStateChanged=false;
  if(accountCompany && (!state.settings.companyName || state.settings.companyName === DEFAULT_SETTINGS.companyName)){
    state.settings.companyName = accountCompany;
    state.company = accountCompany;
    accountStateChanged=true;
  }
  if(accountName && !state.settings.contactName){
    state.settings.contactName = accountName;
    accountStateChanged=true;
  }
  if(accountStateChanged) save();
}
let route = {name:'dashboard'};
let calendarMonth = new Date();
let selectedAgendaDate = todayKey();
let deferredInstallPrompt = null;

function normalizeState(raw){
  const data = raw && typeof raw === 'object' ? raw : {};
  data.customers = Array.isArray(data.customers) ? data.customers : [];
  data.systems = Array.isArray(data.systems) ? data.systems : [];
  data.appointments = Array.isArray(data.appointments) ? data.appointments : [];
  data.settings = {...DEFAULT_SETTINGS, ...(data.settings || {})};
  if(data.company && !data.settings.companyName) data.settings.companyName = data.company;
  data.company = data.settings.companyName;
  data.systems.forEach(s=>{
    if(!s.id) s.id=uid();
    if(!s.serviceStatus) s.serviceStatus='active';
    if(s.pausedUntil===undefined) s.pausedUntil=null;
    if(s.statusNote===undefined) s.statusNote='';
    if(s.reminderCompany===undefined) s.reminderCompany=true;
    if(s.reminderCustomer===undefined) s.reminderCustomer=true;
    if(!s.contactStatus) s.contactStatus='not_contacted';
    if(s.lastContactAt===undefined) s.lastContactAt=null;
    if(s.maintenancePrice===undefined) s.maintenancePrice=null;
    s.interval=Number(s.interval||0);
  });
  data.customers.forEach(c=>{
    if(!c.id) c.id=uid();
    ['name','address','postalCode','city','phone','email','memo'].forEach(k=>{ if(c[k]===undefined) c[k]=''; });
  });
  data.appointments.forEach(a=>{ if(!a.id) a.id=uid(); });
  return data;
}

function load(){
  try{
    let raw = localRepository.getItem(KEY);
    if(!raw){
      for(const legacyKey of LEGACY_KEYS){
        const legacy=localRepository.getItem(legacyKey);
        if(legacy){ raw=legacy; break; }
      }
    }
    const data = normalizeState(raw ? JSON.parse(raw) : structuredClone(demoState));
    localRepository.setItem(KEY, JSON.stringify(data), {silent:true});
    return data;
  }catch(e){
    console.error('Data laden mislukt',e);
    return normalizeState(structuredClone(demoState));
  }
}

function save(){
  try{
    state.updatedAt=new Date().toISOString();
    state.company=state.settings.companyName;
    localRepository.setItem(KEY, JSON.stringify(state));
  }catch(e){
    console.error('Opslaan mislukt',e);
    alert('Opslaan is mislukt. Maak eerst een back-up en controleer de opslagruimte van de browser.');
  }
}
function todayKey(){ return toDateKey(new Date()); }
function toDateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDateKey(date){
  const [y,m,d]=String(date||'').split('-').map(Number);
  return new Date(y||1970,(m||1)-1,d||1,12,0,0,0);
}
function addMonths(date, months){
  const source=parseDateKey(date);
  const day=source.getDate();
  const target=new Date(source.getFullYear(), source.getMonth()+Number(months||0), 1, 12,0,0,0);
  const lastDay=new Date(target.getFullYear(),target.getMonth()+1,0,12).getDate();
  target.setDate(Math.min(day,lastDay));
  return toDateKey(target);
}
function nextDate(s){ return addMonths(s.lastService || s.installedAt || todayKey(), Number(s.interval) || 0); }
function daysUntil(date){
  const a=parseDateKey(todayKey());
  const b=parseDateKey(date);
  return Math.round((b-a)/86400000);
}
function fmt(date){ return date ? parseDateKey(date).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}) : '-'; }
function fmtShort(date){ return date ? parseDateKey(date).toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric'}) : '-'; }
function monthLabel(date){ return date.toLocaleDateString('nl-NL',{month:'long',year:'numeric'}); }
function esc(v=''){ return String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#039;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function euro(value){ return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value)||0); }
function fullAddress(c={}){
  return [c.address, [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function customer(id){ return state.customers.find(c=>c.id===id); }
function systemById(id){ return state.systems.find(s=>s.id===id); }
function systemsForCustomer(id){ return state.systems.filter(s=>s.customerId===id); }
function sortedSystems(){ return [...state.systems].sort((a,b)=>nextDate(a).localeCompare(nextDate(b))); }
function appointments(){ return state.appointments || []; }
function appointmentsOnDate(date){ return appointments().filter(a=>a.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||'')); }
function appointmentForSystem(systemId){ return appointments().filter(a=>a.systemId===systemId && a.date>=todayKey()).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))[0]; }

function appointmentIcon(type){
  if(type==='plaatsing') return '🛠';
  if(type==='storing') return '🚨';
  if(type==='controle') return '🔎';
  return '❄️';
}
function appointmentTitle(type){
  if(type==='plaatsing') return 'Plaatsing';
  if(type==='storing') return 'Storing';
  if(type==='controle') return 'Controle';
  return 'Onderhoud';
}
function appointmentsForCustomer(customerId){
  return appointments().filter(a=>a.customerId===customerId || (a.systemId && systemById(a.systemId)?.customerId===customerId));
}

function isSystemActiveForPlanning(s){
  if(s.serviceStatus === 'declined') return false;
  if(s.serviceStatus === 'paused'){
    if(!s.pausedUntil) return false;
    return daysUntil(s.pausedUntil) <= 0;
  }
  return true;
}
function statusBadge(s){
  if(s.serviceStatus === 'declined') return '<span class="status-badge stopped">Geen onderhoud</span>';
  if(s.serviceStatus === 'paused') return `<span class="status-badge paused">Later${s.pausedUntil ? ': '+fmt(s.pausedUntil) : ''}</span>`;
  return '<span class="status-badge active">Actief onderhoud</span>';
}

function dueLabel(s){
  const d=daysUntil(nextDate(s));
  if(d<0) return `<span class="due redtext">${Math.abs(d)} dagen verlopen</span>`;
  if(d===0) return `<span class="due redtext">Vandaag</span>`;
  return `<span class="due">Over ${d} dagen</span>`;
}

function contactStatusLabel(value){
  return ({not_contacted:'Nog benaderen',contacted:'Bericht verstuurd',responded:'Reactie ontvangen',scheduled:'Ingepland',completed:'Afgerond'})[value] || 'Nog benaderen';
}
function contactStatusClass(value){
  return ({not_contacted:'neutral',contacted:'paused',responded:'info',scheduled:'active',completed:'done'})[value] || 'neutral';
}
function contactStatusBadge(s){ return `<span class="status-badge ${contactStatusClass(s.contactStatus)}">${contactStatusLabel(s.contactStatus)}</span>`; }
function systemPrice(s){ return Number(s.maintenancePrice ?? state.settings.maintenancePrice ?? 0); }
function messageFor(c={},s=null){
  const systemName=s ? `${s.type==='warmtepomp'?'warmtepomp':'airco'} ${s.brand||''} ${s.model||''}`.trim() : 'installatie';
  return String(state.settings.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate)
    .replaceAll('{naam}',c.name||'')
    .replaceAll('{bedrijf}',state.settings.companyName||'')
    .replaceAll('{datum}',s?fmt(nextDate(s)):'')
    .replaceAll('{systeem}',systemName);
}
function whatsappLink(c,s=null){
  const phone=(c.phone||'').replace(/\D/g,'').replace(/^0/,'31');
  return `https://wa.me/${phone}?text=${encodeURIComponent(messageFor(c,s))}`;
}
function markContacted(id){
  const s=systemById(id); if(!s) return;
  s.contactStatus='contacted'; s.lastContactAt=todayKey(); save(); render();
}
function setContactStatus(id,value){
  const s=systemById(id); if(!s) return;
  s.contactStatus=value;
  if(['contacted','responded'].includes(value)) s.lastContactAt=todayKey();
  save(); render();
}
function contactStatusSelect(s){
  return `<select class="status-select" onchange="setContactStatus('${s.id}',this.value)">
    ${['not_contacted','contacted','responded','scheduled','completed'].map(v=>`<option value="${v}" ${s.contactStatus===v?'selected':''}>${contactStatusLabel(v)}</option>`).join('')}
  </select>`;
}

function nav(name, params={}){
  route = {name, ...params};
  render();
}

function updateFab(){
  const show = ['dashboard','customers'].includes(route.name);
  fabAdd.style.display = show ? 'block' : 'none';
  fabAdd.onclick = () => nav('new',{back:route.name});
}

function render(){
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===route.name));
  backBtn.hidden = ['dashboard','customers','agenda','settings'].includes(route.name);
  backBtn.onclick = () => navBack();

  const titles = {
    dashboard:'Dashboard', customers:'Klanten', agenda:'Agenda', settings:'Instellingen', account:'Bedrijfsaccount',
    new:'Nieuwe installatie', detail:'Klantdetail', editCustomer:'Klant bewerken',
    editSystem:'Systeem bewerken', planAppointment:'Afspraak plannen', dayPlan:'Dagplanning', appointmentDetail:'Afspraakdetails', notifications:'Actielijst'
  };
  pageTitle.textContent = titles[route.name] || 'OnderhoudPlanner';

  if(route.name==='dashboard') dashboard();
  if(route.name==='customers') customers();
  if(route.name==='agenda') agenda();
  if(route.name==='settings') settings();
  if(route.name==='account') accountPage();
  if(route.name==='new') newInstall();
  if(route.name==='detail') detail(route.customerId);
  if(route.name==='editCustomer') editCustomer(route.customerId);
  if(route.name==='editSystem') editSystem(route.systemId);
  if(route.name==='planAppointment') planAppointment(route.systemId);
  if(route.name==='newAppointment') newAppointment();
  if(route.name==='dayPlan') dayPlan(route.date);
  if(route.name==='appointmentDetail') appointmentDetail(route.appointmentId);
  if(route.name==='notifications') notificationsPage();

  updateFab();
}

function navBack(){
  if(route.name==='appointmentDetail') return nav('dayPlan',{date:route.date || todayKey(),back:'agenda'});
  if(route.name==='notifications' || route.name==='account') return nav('dashboard');
  if(route.name==='detail') return nav(route.back || 'dashboard');
  if(route.name==='editCustomer') return nav('detail',{customerId:route.customerId,back:'customers'});
  if(route.name==='editSystem' || route.name==='planAppointment'){
    const s = systemById(route.systemId);
    return nav('detail',{customerId:s ? s.customerId : null,back:'customers'});
  }
  return nav(route.back || 'dashboard');
}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>nav(b.dataset.route));
if(accountBtn){
  const account=getAccountContext();
  const initials=(account?.organization?.name || 'OP').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  accountBtn.textContent=initials || 'OP';
  accountBtn.onclick=()=>nav('account');
}

function dashboardGreeting(){
  const h=new Date().getHours();
  const name=(state.settings.contactName||'').trim();
  const suffix=name ? ` ${esc(name)}` : '';
  if(h>=5 && h<12) return `Goedemorgen${suffix} 👋`;
  if(h>=12 && h<18) return `Goedemiddag${suffix} 👋`;
  return `Goedenavond${suffix} 👋`;
}

function actionSystems(){
  const leadDays=Number(state.settings.leadDays)||45;
  return sortedSystems().filter(s=>s.reminderCompany!==false && isSystemActiveForPlanning(s) && daysUntil(nextDate(s))<=leadDays);
}
function stats(){
  const dueNow = state.systems.filter(s=>isSystemActiveForPlanning(s) && daysUntil(nextDate(s))<=0).length;
  const dueSoon = state.systems.filter(s=>{const d=daysUntil(nextDate(s)); return isSystemActiveForPlanning(s) && d>0 && d<=30;}).length;
  return { customers: state.customers.length, systems: state.systems.length, dueNow, dueSoon };
}
function expectedRevenue(days=365){
  return state.systems.filter(s=>isSystemActiveForPlanning(s) && daysUntil(nextDate(s))<=days).reduce((sum,s)=>sum+systemPrice(s),0);
}
function statCards(){
  const s=stats();
  return `<div class="stats">
    <div class="stat">👥<b>${s.customers}</b><span>Klanten</span></div>
    <div class="stat">❄️<b>${s.systems}</b><span>Systemen</span></div>
    <div class="stat">🔴<b>${s.dueNow}</b><span>Nu nodig</span></div>
    <div class="stat">🟠<b>${s.dueSoon}</b><span>Binnen 30 dagen</span></div>
  </div>`;
}
function revenueCard(){
  const leadDays=Number(state.settings.leadDays)||45;
  return `<article class="card revenue-card">
    <div class="row between">
      <div><p class="muted">Potentiële onderhoudsomzet</p><p class="revenue-number">${euro(expectedRevenue(365))}</p></div>
      <div class="revenue-icon">↗</div>
    </div>
    <div class="revenue-split"><span>Binnen ${leadDays} dagen <b>${euro(expectedRevenue(leadDays))}</b></span><span>Komende 12 maanden <b>${euro(expectedRevenue(365))}</b></span></div>
    <p class="helper">Indicatie op basis van de ingestelde onderhoudsprijs per systeem.</p>
  </article>`;
}
function systemCard(s, compact=false){
  const c=customer(s.customerId)||{};
  return `<article class="card ${compact?'compact':''}" onclick="nav('detail',{customerId:'${s.customerId}',back:'${route.name}'})">
    <div class="row">
      <div class="avatar">${s.type==='warmtepomp'?'♨️':'❄️'}</div>
      <div class="grow">
        <p class="title">${esc(c.name||'Onbekende klant')}</p>
        <p class="muted">${esc(s.brand)} ${esc(s.model)}</p>
        <p class="muted">📍 ${esc(fullAddress(c))}</p>
      </div>
      <div class="right-chevron">›</div>
    </div>
    <div class="row between card-meta">
      <span class="muted">${fmt(nextDate(s))} · ${euro(systemPrice(s))}</span>${contactStatusBadge(s)}
    </div>
  </article>`;
}
function quickActionCard(s){
  const c=customer(s.customerId)||{};
  const hasPhone=Boolean((c.phone||'').replace(/\D/g,''));
  return `<article class="card action-card">
    <div class="row between">
      <div class="grow"><p class="title">${esc(c.name||'Onbekende klant')}</p><p class="muted">${esc(s.brand)} ${esc(s.model)} · ${fmt(nextDate(s))}</p></div>
      ${dueLabel(s)}
    </div>
    <div class="status-row">${contactStatusSelect(s)}<span>${euro(systemPrice(s))}</span></div>
    <div class="actions">
      <a class="secondary whatsapp ${hasPhone?'':'disabled'}" ${hasPhone?`href="${whatsappLink(c,s)}" onclick="markContacted('${s.id}')"`:'aria-disabled="true"'}>💬 WhatsApp</a>
      <button class="secondary" onclick="nav('planAppointment',{systemId:'${s.id}',back:'dashboard'})">📅 Inplannen</button>
    </div>
  </article>`;
}
function dashboard(){
  const action = actionSystems().slice(0,4);
  app.innerHTML = `<section class="screen">
    <article class="card">
      <p class="title dashboard-greeting">${dashboardGreeting()}</p>
      <p class="muted">${esc(state.settings.companyName)} · ${actionSystems().length} onderhoudsmomenten vragen aandacht.</p>
    </article>
    ${statCards()}
    ${revenueCard()}
    <div class="list-header">
      <h2>Te benaderen</h2>
      <button class="link" onclick="nav('notifications')">Volledige actielijst</button>
    </div>
    ${action.map(quickActionCard).join('') || '<div class="card empty">Geen onderhoud binnen de ingestelde periode.</div>'}
  </section>`;
}
function notificationsPage(){
  const items=actionSystems();
  app.innerHTML=`<section class="screen">
    <article class="card"><p class="title">Onderhoudsactielijst</p><p class="muted">Gesorteerd op eerstvolgende onderhoudsdatum. Werk de contactstatus direct bij.</p></article>
    <div class="filter-chips">
      <button class="chip active" data-filter="all">Alles (${items.length})</button>
      <button class="chip" data-filter="not_contacted">Nog benaderen</button>
      <button class="chip" data-filter="contacted">Verstuurd</button>
      <button class="chip" data-filter="scheduled">Ingepland</button>
    </div>
    <div id="actionList"></div>
  </section>`;
  const draw=(filter='all')=>{
    const filtered=filter==='all'?items:items.filter(s=>s.contactStatus===filter);
    $('#actionList').innerHTML=filtered.map(quickActionCard).join('') || '<div class="card empty">Geen items in deze status.</div>';
  };
  document.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b===btn));
    draw(btn.dataset.filter);
  });
  draw();
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
      .filter(c=>c.name.toLowerCase().includes(q)||fullAddress(c).toLowerCase().includes(q))
      .map(c=>`<article class="card" onclick="nav('detail',{customerId:'${c.id}',back:'customers'})">
        <div class="row between">
          <div>
            <p class="title">${esc(c.name)}</p>
            <p class="muted">${esc(fullAddress(c))}</p>
            <p class="muted">${systemsForCustomer(c.id).length} systeem/systemen</p>${c.memo ? `<p class="muted">📝 ${esc(c.memo).slice(0,55)}${c.memo.length>55?'...':''}</p>` : ''}
          </div>
          <span class="right-chevron">›</span>
        </div>
      </article>`).join('') || '<div class="card empty">Geen klanten gevonden.</div>';
  };
  $('#search').oninput=renderList;
  renderList();
}

function agenda(){
  app.innerHTML = `<section class="screen">
    <article class="card calendar-card">
      <div class="calendar-head">
        <button class="smallbtn" onclick="changeMonth(-1)">‹</button>
        <strong>${monthLabel(calendarMonth)}</strong>
        <button class="smallbtn" onclick="changeMonth(1)">›</button>
      </div>
      ${calendarGrid()}
    </article>
    <button class="primary agenda-add-btn" onclick="nav('newAppointment',{date:selectedAgendaDate,back:'agenda'})">+ Afspraak</button>
  </section>`;
}

function calendarGrid(){
  const y=calendarMonth.getFullYear();
  const m=calendarMonth.getMonth();
  const first=new Date(y,m,1);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const weekdays=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const eventDates = new Set([...state.systems.filter(isSystemActiveForPlanning).map(s=>nextDate(s)), ...appointments().map(a=>a.date)]);
  let cells='';

  for(let i=0;i<offset;i++) cells += '<button class="calendar-day blank" disabled></button>';

  for(let day=1;day<=daysInMonth;day++){
    const key=toDateKey(new Date(y,m,day));
    const has=eventDates.has(key);
    const active=selectedAgendaDate===key;
    const today=todayKey()===key;
    cells += `<button class="calendar-day ${has?'has-event':''} ${active?'active':''} ${today?'today':''}" onclick="nav('dayPlan',{date:'${key}',back:'agenda'})">
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
        <p class="title">${esc(c.name)}</p>
        <p class="muted">${esc(s.brand)} ${esc(s.model)}</p>
        <p class="muted">📍 ${esc(c.address)}</p>
      </div>
    </div>
    <div class="actions">
      <a class="secondary" href="tel:${esc(c.phone)}">📞 Bel</a>
      <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
    </div>
    <div class="actions">
      <button class="secondary" onclick="nav('planAppointment',{systemId:'${s.id}',back:'agenda'})">📅 Afspraak plannen</button>
      <button class="smallbtn" onclick="nav('detail',{customerId:'${s.customerId}',back:'agenda'})">Open klant</button>
    </div>
  </article>`;
}

function appointmentCard(a){
  const s=a.systemId ? systemById(a.systemId) : null;
  const c=(a.customerId ? customer(a.customerId) : null) || (s ? customer(s.customerId) : {}) || {};
  const title = appointmentTitle(a.type || 'onderhoud');
  const subtitle = s ? `${esc(s.brand)} ${esc(s.model)}` : esc(a.note || 'Afspraak');
  return `<article class="card compact">
    <div class="row between">
      <div>
        <p class="title">${appointmentIcon(a.type)} ${a.time||'Tijd onbekend'} · ${title}</p>
        <p class="muted">${c.name || 'Geen klant gekozen'}</p>
        <p class="muted">${subtitle}</p>
        ${a.note && s ? `<p class="muted">${esc(a.note)}</p>` : ''}
      </div>
      <button class="edit-btn" onclick="nav('newAppointment',{appointmentId:'${a.id}',back:'agenda'})">✏️</button>
    </div>
    <div class="actions">
      <a class="secondary" href="tel:${c.phone||''}">📞 Bel</a>
      <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
    </div>
  </article>`;
}



function appointmentDetail(id){
  const a = appointments().find(x=>x.id===id);
  if(!a) return nav('agenda');

  const s = a.systemId ? systemById(a.systemId) : null;
  const c = (a.customerId ? customer(a.customerId) : null) || (s ? customer(s.customerId) : {}) || {};
  const mapQuery = encodeURIComponent(fullAddress(c) || '');

  app.innerHTML = `<section class="screen appointment-detail-screen">
    <article class="appointment-hero-card">
      <div class="row between">
        <div>
          <p class="muted">${fmt(a.date)} · ${a.time || 'Tijd onbekend'}</p>
          <h2>${appointmentIcon(a.type)} ${appointmentTitle(a.type || 'onderhoud')}</h2>
          <p class="appointment-customer-name">${c.name || 'Geen klant gekozen'}</p>
        </div>
        <span class="status-badge active">Gepland</span>
      </div>
    </article>

    <article class="card">
      <p class="title">Klantgegevens</p>
      <p class="muted">📍 ${fullAddress(c) || 'Geen adres'}</p>
      <p class="muted">☎ ${c.phone || 'Geen telefoon'}</p>
      <p class="muted">✉ ${c.email || 'Geen e-mail'}</p>
      ${c.memo ? `<div class="customer-memo">📝 ${esc(c.memo)}</div>` : ''}
      <div class="actions">
        <a class="secondary" href="tel:${c.phone || ''}">📞 Bel</a>
        <a class="secondary whatsapp" href="${whatsappLink(c)}">💬 WhatsApp</a>
      </div>
      <a class="secondary nav-full" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">📍 Navigeer</a>
    </article>

    <article class="card">
      <p class="title">Afspraak</p>
      <div class="detail-grid" style="margin-top:12px">
        <div class="mini"><span>Type</span><b>${appointmentTitle(a.type || 'onderhoud')}</b></div>
        <div class="mini"><span>Tijd</span><b>${a.time || '-'}</b></div>
        <div class="mini"><span>Datum</span><b>${fmt(a.date)}</b></div>
        <div class="mini"><span>Status</span><b>Gepland</b></div>
      </div>
      ${a.note ? `<div class="notice appointment-note" style="margin-top:12px"><b>Notitie</b><br>${esc(a.note)}</div>` : ''}
    </article>

    ${s ? `<article class="card">
      <p class="title">Systeem</p>
      <p class="muted">${s.type==='warmtepomp'?'Warmtepomp':'Airco'} · ${esc(s.brand)} ${esc(s.model)}</p>
      <div class="detail-grid" style="margin-top:12px">
        <div class="mini"><span>Serienummer</span><b>${s.serial || '-'}</b></div>
        <div class="mini"><span>Interval</span><b>${s.interval} maanden</b></div>
      </div>
    </article>` : ''}

    <button class="primary" onclick="nav('newAppointment',{appointmentId:'${a.id}',back:'appointmentDetail'})">✏️ Afspraak bewerken</button>
    <button class="danger" style="width:100%;margin-top:10px" onclick="deleteGenericAppointment('${a.id}')">🗑 Afspraak verwijderen</button>
  </section>`;
}


function dayPlan(date){
  const items = appointmentsOnDate(date);
  app.innerHTML = `<section class="screen dayplan-screen">
    <article class="dayplan-date-card">
      <button class="link dayplan-back" onclick="nav('agenda')">← Kalender</button>
      <h2>${fmt(date)}</h2>
      <p class="muted">${items.length} afspraak${items.length===1?'':'en'}</p>
    </article>

    ${items.map(a=>{
      const s=a.systemId ? systemById(a.systemId) : null;
      const c=(a.customerId ? customer(a.customerId) : null) || (s ? customer(s.customerId) : {}) || {};
      const workLine = s ? s.brand+' '+s.model : (a.note || 'Geen systeem ingevuld');
      return `<article class="planner-card" onclick="nav('appointmentDetail',{appointmentId:'${a.id}',date:'${date}',back:'dayPlan'})">
        <div class="planner-time">${a.time||'--:--'}</div>
        <div class="planner-content">
          <p class="title">${appointmentIcon(a.type)} ${appointmentTitle(a.type||'onderhoud')}</p>
          <p class="planner-name">${workLine}</p>
          <p class="muted">📍 ${fullAddress(c) || 'Geen adres ingevuld'}</p>
        </div>
      </article>`;
    }).join('') || '<div class="card empty">Geen afspraken op deze dag.</div>'}

    <button class="primary" onclick="nav('newAppointment',{date:\''+date+'\',back:\'dayPlan\'})">+ Afspraak</button>
  </section>`;
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
  const hasPhone=Boolean((c.phone||'').replace(/\D/g,''));

  app.innerHTML = `<section class="screen">
    <article class="card">
      <div class="row">
        <div class="avatar">❄️</div>
        <div class="grow">
          <div class="row between">
            <p class="title">${esc(c.name)} <span class="pill">Klant</span></p>
            <button class="edit-btn" onclick="event.stopPropagation(); nav('editCustomer',{customerId:'${c.id}',back:'detail'})">✏️</button>
          </div>
          <p class="muted">${esc(fullAddress(c)||'Geen adres')}</p>
          <p class="muted">☎ ${esc(c.phone||'Geen telefoon')}</p>
          <p class="muted">✉ ${esc(c.email||'Geen e-mail')}</p>
          ${c.memo ? `<div class="customer-memo">📝 ${esc(c.memo)}</div>` : ''}
        </div>
      </div>
      <div class="actions">
        <a class="secondary ${hasPhone?'':'disabled'}" ${hasPhone?`href="tel:${esc(c.phone)}"`:'aria-disabled="true"'}>📞 Bel klant</a>
        <a class="secondary whatsapp ${hasPhone?'':'disabled'}" ${hasPhone?`href="${whatsappLink(c)}"`:'aria-disabled="true"'}>💬 WhatsApp</a>
      </div>
    </article>

    <h2>Afspraken</h2>
    ${appointmentsForCustomer(c.id).filter(a=>a.date>=todayKey()).slice(0,3).map(appointmentCard).join('') || '<div class="card empty">Nog geen komende afspraken bij deze klant.</div>'}
    <button class="secondary full-width" onclick="nav('newAppointment',{customerId:'${c.id}',back:'detail'})">+ Afspraak bij deze klant</button>

    <h2>Systemen</h2>
    ${systems.map(s=>`<article class="card">
      <div class="row between">
        <div><p class="title">${s.type==='warmtepomp'?'Warmtepomp':'Airco'} / ${esc(s.brand)} ${esc(s.model)}</p><p class="muted">${contactStatusBadge(s)}</p></div>
        <button class="edit-btn" onclick="event.stopPropagation(); nav('editSystem',{systemId:'${s.id}',back:'detail'})">✏️</button>
      </div>
      <p class="card-meta">${isSystemActiveForPlanning(s)?dueLabel(s):statusBadge(s)}</p>
      <div class="detail-grid">
        <div class="mini"><span>Serienummer</span><b>${esc(s.serial||'-')}</b></div>
        <div class="mini"><span>Installatie</span><b>${fmt(s.installedAt)}</b></div>
        <div class="mini"><span>Interval</span><b>Elke ${s.interval} maanden</b></div>
        <div class="mini"><span>Volgend onderhoud</span><b>${fmt(nextDate(s))}</b></div>
        <div class="mini"><span>Onderhoudsprijs</span><b>${euro(systemPrice(s))}</b></div>
        <div class="mini"><span>Uitgevoerd</span><b>${Number(s.doneCount)||0} keer</b></div>
      </div>
      ${appointmentInfo(s)}
      <div class="notice status-note block-gap"><b>Onderhoudsstatus</b><br>${statusBadge(s)}${s.statusNote ? '<br>'+esc(s.statusNote) : ''}</div>
      <div class="status-row">${contactStatusSelect(s)}${s.lastContactAt?`<small>Laatst: ${fmtShort(s.lastContactAt)}</small>`:''}</div>
      <div class="actions">
        <a class="secondary whatsapp ${hasPhone?'':'disabled'}" ${hasPhone?`href="${whatsappLink(c,s)}" onclick="markContacted('${s.id}')"`:'aria-disabled="true"'}>💬 Herinner klant</a>
        <button class="secondary" onclick="nav('planAppointment',{systemId:'${s.id}',back:'detail'})">📅 Inplannen</button>
      </div>
      <button class="primary secondary-primary" onclick="markDone('${s.id}')">✅ Onderhoud uitgevoerd</button>
      <button class="danger full-width block-gap" onclick="deleteSystem('${s.id}')">🗑 Systeem verwijderen</button>
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
  const brand = field(form, 'brand');
  const brandOther = field(form, 'brandOther');
  const wrap = brandOther?.closest('.brand-other');
  if(wrap) wrap.classList.toggle('show', brand?.value === 'Anders...');
}

function toggleOtherModel(form){
  const model = field(form, 'model');
  const modelOther = field(form, 'modelOther');
  const wrap = modelOther?.closest('.model-other');
  if(wrap) wrap.classList.toggle('show', model?.value === 'Anders...');
}

function selectedBrand(form){
  const brand = field(form, 'brand');
  const brandOther = field(form, 'brandOther');
  if(brand?.value === 'Anders...') return (brandOther?.value || '').trim() || 'Anders';
  return brand?.value || '-';
}

function selectedModel(form){
  const model = field(form, 'model');
  const modelOther = field(form, 'modelOther');
  if(model?.value === 'Anders...') return (modelOther?.value || '').trim() || 'Anders';
  return model?.value || '-';
}

function refreshModelOptions(form, value=''){
  const brand = selectedBrand(form);
  const model = field(form, 'model');
  if(model) model.innerHTML = modelSelectOptions(brand, value);
  toggleOtherModel(form);
}

function systemFormFields(s={}){
  const brand = s.brand || 'Daikin';
  const knownBrand = BRAND_OPTIONS.includes(brand);
  const model = s.model || '';
  const modelList = MODEL_OPTIONS[brand] || ['Anders...'];
  const knownModel = modelList.includes(model);
  const interval=Number(s.interval ?? state.settings.defaultInterval ?? 12);
  const price=s.maintenancePrice ?? state.settings.maintenancePrice ?? 0;
  const contactStatus=s.contactStatus || 'not_contacted';

  return `<div class="card form">
    <h2>Systeem</h2>
    <div class="field">
      <label>Type</label>
      <select name="type">
        <option value="airco" ${s.type==='airco' || !s.type ? 'selected' : ''}>Airco</option>
        <option value="warmtepomp" ${s.type==='warmtepomp' ? 'selected' : ''}>Warmtepomp</option>
      </select>
    </div>
    <div class="field"><label>Merk</label><select name="brand">${brandSelectOptions(brand)}</select></div>
    <div class="field brand-other ${knownBrand?'':'show'}"><label>Eigen merk</label><input name="brandOther" value="${knownBrand?'':esc(brand)}" placeholder="Vul eigen merk in"></div>
    <div class="field"><label>Model</label><select name="model">${modelSelectOptions(brand, model)}</select></div>
    <div class="field model-other ${knownModel?'':'show'}"><label>Eigen model</label><input name="modelOther" value="${knownModel?'':esc(model)}" placeholder="Vul eigen model in"></div>
    <div class="field"><label>Serienummer</label><input name="serial" value="${esc(s.serial||'')}" placeholder="Bijv. FTXG25LW"></div>
    <div class="field"><label>Installatiedatum</label><input name="installedAt" type="date" value="${s.installedAt||todayKey()}" required></div>
    <div class="two">
      <div class="field"><label>Onderhoudsinterval</label><select name="interval">
        <option value="6" ${interval===6?'selected':''}>6 maanden</option>
        <option value="12" ${interval===12?'selected':''}>12 maanden</option>
        <option value="18" ${interval===18?'selected':''}>18 maanden</option>
        <option value="24" ${interval===24?'selected':''}>24 maanden</option>
      </select></div>
      <div class="field"><label>Prijs per onderhoud (€)</label><input name="maintenancePrice" type="number" min="0" step="1" value="${Number(price)||0}"></div>
    </div>
    <div class="field"><label>Onderhoudsstatus</label><select name="serviceStatus"><option value="active" ${!s.serviceStatus || s.serviceStatus==='active'?'selected':''}>Actief onderhoud</option><option value="paused" ${s.serviceStatus==='paused'?'selected':''}>Klant wil later</option><option value="declined" ${s.serviceStatus==='declined'?'selected':''}>Klant wil geen onderhoud</option></select></div>
    <div class="field status-later ${s.serviceStatus==='paused'?'show':''}"><label>Opnieuw benaderen op</label><input name="pausedUntil" type="date" value="${s.pausedUntil||''}"></div>
    <div class="field"><label>Opvolgstatus</label><select name="contactStatus">${['not_contacted','contacted','responded','scheduled','completed'].map(v=>`<option value="${v}" ${contactStatus===v?'selected':''}>${contactStatusLabel(v)}</option>`).join('')}</select></div>
    <div class="field"><label>Statusnotitie</label><textarea name="statusNote" rows="2" placeholder="Bijv. klant wil na vakantie gebeld worden">${esc(s.statusNote||'')}</textarea></div>
    <label><input type="checkbox" name="reminderCompany" ${s.reminderCompany!==false?'checked':''}> Toon in mijn actielijst</label>
    <label><input type="checkbox" name="reminderCustomer" ${s.reminderCustomer!==false?'checked':''}> Klant mag een herinnering ontvangen</label>
  </div>`;
}

function toggleStatusLater(form){
  const pausedUntil = field(form, 'pausedUntil');
  const serviceStatus = field(form, 'serviceStatus');
  const interval = field(form, 'interval');
  const wrap = pausedUntil?.closest('.status-later');
  if(wrap) wrap.classList.toggle('show', serviceStatus?.value === 'paused');
  if(serviceStatus && interval){
    interval.disabled = serviceStatus.value === 'declined';
  }
}

function wireSystemForm(form, currentModel=''){
  const brand = field(form, 'brand');
  const model = field(form, 'model');
  const serviceStatus = field(form, 'serviceStatus');
  if(brand) brand.onchange=()=>{ toggleOtherBrand(form); refreshModelOptions(form); };
  if(model) model.onchange=()=>toggleOtherModel(form);
  if(serviceStatus) serviceStatus.onchange=()=>toggleStatusLater(form);
  toggleOtherBrand(form);
  refreshModelOptions(form, currentModel);
  toggleStatusLater(form);
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
        <div class="field"><label>Straat + huisnummer</label><input name="address" value="${esc(c.address)}"></div><div class="two"><div class="field"><label>Postcode</label><input name="postalCode" value="${esc(c.postalCode||'')}"></div><div class="field"><label>Plaats</label><input name="city" value="${esc(c.city||'')}"></div></div>
        <div class="two">
          <div class="field"><label>Telefoon</label><input name="phone" value="${esc(c.phone)}"></div>
          <div class="field"><label>E-mail</label><input name="email" value="${esc(c.email)}"></div>
        </div>
        <div class="field"><label>Memo klant</label><textarea name="memo" rows="4" placeholder="Interne notitie over deze klant">${esc(c.memo||'')}</textarea></div>
      </article>
      <article class="card">
        <h2>Geplaatste systemen</h2>
        ${systems.map(s=>`<div class="edit-system-card"><div class="row between"><div><p class="title">${s.type==='warmtepomp'?'♨️ Warmtepomp':'❄️ Airco'}</p><p class="muted">${esc(s.brand)} ${esc(s.model)}</p><p class="muted">Volgend onderhoud: ${fmt(nextDate(s))}</p></div><button type="button" class="edit-btn" onclick="nav('editSystem',{systemId:'${s.id}',back:'editCustomer'})">✏️</button></div></div>`).join('') || '<p class="muted">Nog geen systemen.</p>'}
      </article>
      <button class="primary" type="submit">Klant opslaan</button><button class="danger" type="button" onclick="deleteCustomer(\'${c.id}\')">🗑 Klant verwijderen</button>
    </form>
  </section>`;

  const f=$('#editCustomerForm');
  f.onsubmit=(e)=>{
    e.preventDefault();
    c.name=field(f,'name').value.trim() || c.name;
    c.address=field(f,'address').value.trim();
    c.postalCode=field(f,'postalCode').value.trim();
    c.city=field(f,'city').value.trim();
    c.phone=field(f,'phone').value.trim();
    c.email=field(f,'email').value.trim();
    c.memo=field(f,'memo').value.trim();
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
    s.type=field(f,'type').value;
    s.brand=selectedBrand(f);
    s.model=selectedModel(f);
    s.serial=field(f,'serial').value.trim();
    s.installedAt=field(f,'installedAt').value;
    s.serviceStatus=field(f,'serviceStatus').value;
    s.interval=Number(field(f,'interval').value||state.settings.defaultInterval||12);
    s.maintenancePrice=Number(field(f,'maintenancePrice').value||0);
    s.pausedUntil=s.serviceStatus==='paused' ? (field(f,'pausedUntil').value || null) : null;
    s.contactStatus=field(f,'contactStatus').value;
    s.statusNote=field(f,'statusNote').value.trim();
    s.reminderCompany=field(f,'reminderCompany').checked;
    s.reminderCustomer=field(f,'reminderCustomer').checked;
    if(s.serviceStatus==='declined'){
      state.appointments=appointments().filter(a=>a.systemId!==s.id);
      s.contactStatus='completed';
    }
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
            ${state.customers.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Klantnaam</label><input name="name" placeholder="Bijv. Fam. Jansen"></div>
        <div class="field"><label>Straat + huisnummer</label><input name="address" placeholder="Bijv. Kerkstraat 12"></div><div class="two"><div class="field"><label>Postcode</label><input name="postalCode" placeholder="3341 AB"></div><div class="field"><label>Plaats</label><input name="city" placeholder="Hendrik-Ido-Ambacht"></div></div>
        <div class="two">
          <div class="field"><label>Telefoon</label><input name="phone" placeholder="06..."></div>
          <div class="field"><label>E-mail</label><input name="email" placeholder="mail@..."></div>
        </div>
        <div class="field"><label>Memo klant</label><textarea name="memo" rows="3" placeholder="Bijv. klant wil alleen in de ochtend, sleutel bij buren, hond aanwezig..."></textarea></div>
      </div>
      ${systemFormFields({type:'airco',brand:'Daikin',model:'Emura',serial:'',installedAt:todayKey(),interval:state.settings.defaultInterval,maintenancePrice:state.settings.maintenancePrice,reminderCompany:true,reminderCustomer:true})}
      <button class="primary" type="submit">Opslaan</button>
    </form>
  </section>`;

  const f=$('#newForm');
  const fill=()=>{
    const c=customer(field(f,'existing').value);
    ['name','address','postalCode','city','phone','email','memo'].forEach(k=>{
      const control=field(f,k);
      if(!control) return;
      control.value=c?c[k]:'';
      control.disabled=!!c;
    });
  };
  field(f,'existing').onchange=fill;
  fill();
  wireSystemForm(f, 'Emura');

  f.onsubmit=(e)=>{
    e.preventDefault();
    let cid=field(f,'existing').value;
    if(!cid){
      const c={id:uid(),name:field(f,'name').value.trim()||'Nieuwe klant',address:field(f,'address').value,postalCode:field(f,'postalCode').value,city:field(f,'city').value,phone:field(f,'phone').value,email:field(f,'email').value,memo:field(f,'memo') ? field(f,'memo').value.trim() : ''};
      state.customers.push(c);
      cid=c.id;
    }
    const s=makeSystem(cid,field(f,'type').value,selectedBrand(f),selectedModel(f),field(f,'serial').value,field(f,'installedAt').value,field(f,'interval').value);
    s.serviceStatus=field(f,'serviceStatus').value;
    s.interval=Number(field(f,'interval').value||state.settings.defaultInterval||12);
    s.maintenancePrice=Number(field(f,'maintenancePrice').value||0);
    s.pausedUntil=s.serviceStatus==='paused' ? (field(f,'pausedUntil').value || null) : null;
    s.contactStatus=field(f,'contactStatus').value;
    s.statusNote=field(f,'statusNote').value.trim();
    s.reminderCompany=field(f,'reminderCompany').checked;
    s.reminderCustomer=field(f,'reminderCustomer').checked;
    if(s.serviceStatus==='declined') s.contactStatus='completed';
    state.systems.push(s);
    save();
    nav('detail',{customerId:cid,back:'customers'});
  };
}


function newAppointment(){
  const existing = route.appointmentId ? appointments().find(a=>a.id===route.appointmentId) : null;
  const customerId = existing?.customerId || route.customerId || state.customers[0]?.id || '';
  const dateValue = existing?.date || route.date || selectedAgendaDate || todayKey();
  const timeValue = existing?.time || '09:00';
  const typeValue = existing?.type || 'plaatsing';
  const noteValue = existing?.note || '';

  app.innerHTML = `<section class="screen">
    <form class="form" id="genericAppointmentForm">
      <article class="card form">
        <h2>Afspraak</h2>
        <div class="field">
          <label>Type afspraak</label>
          <select name="type">
            <option value="plaatsing" ${typeValue==='plaatsing'?'selected':''}>Plaatsing</option>
            <option value="onderhoud" ${typeValue==='onderhoud'?'selected':''}>Onderhoud</option>
            <option value="storing" ${typeValue==='storing'?'selected':''}>Storing</option>
            <option value="controle" ${typeValue==='controle'?'selected':''}>Controle</option>
          </select>
        </div>
        <div class="field">
          <label>Klant</label>
          <select name="customerId" required>
            <option value="">Kies klant</option>
            <option value="__new__">+ Nieuwe klant</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${c.id===customerId?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="new-customer-fields">
          <div class="field"><label>Nieuwe klantnaam</label><input name="newName" placeholder="Bijv. Fam. Jansen"></div>
          <div class="field"><label>Straat + huisnummer</label><input name="newAddress" placeholder="Bijv. Kerkstraat 12"></div>
          <div class="two">
            <div class="field"><label>Postcode</label><input name="newPostalCode" placeholder="1234 AB"></div>
            <div class="field"><label>Plaats</label><input name="newCity" placeholder="Plaats"></div>
          </div>
          <div class="two">
            <div class="field"><label>Telefoon</label><input name="newPhone" placeholder="06..."></div>
            <div class="field"><label>E-mail</label><input name="newEmail" placeholder="mail@..."></div>
          </div>
          <div class="field"><label>Memo klant</label><textarea name="newMemo" rows="2" placeholder="Interne notitie"></textarea></div>
        </div>
        <div class="two">
          <div class="field"><label>Datum</label><input name="date" type="date" value="${dateValue}" required></div>
          <div class="field"><label>Tijd</label><input name="time" type="time" value="${timeValue}"></div>
        </div>
        <div class="field"><label>Notitie</label><textarea name="note" rows="3" placeholder="Bijv. nieuwe airco plaatsen slaapkamer">${esc(noteValue)}</textarea></div>
      </article>
      <button class="primary" type="submit">Afspraak opslaan</button>
      ${existing?`<button class="danger" type="button" onclick="deleteGenericAppointment('${existing.id}')">Afspraak verwijderen</button>`:''}
    </form>
  </section>`;

  const f=$('#genericAppointmentForm');
  const toggleNewCustomerFields=()=>{
    const wrap=f.querySelector('.new-customer-fields');
    if(wrap) wrap.classList.toggle('show', field(f,'customerId').value==='__new__');
  };
  field(f,'customerId').onchange=toggleNewCustomerFields;
  toggleNewCustomerFields();
  f.onsubmit=(e)=>{
    e.preventDefault();
    let appointmentCustomerId=field(f,'customerId').value;
    if(appointmentCustomerId==='__new__'){
      const newCustomer={
        id:uid(),
        name:field(f,'newName').value.trim() || 'Nieuwe klant',
        address:field(f,'newAddress').value.trim(),
        postalCode:field(f,'newPostalCode').value.trim(),
        city:field(f,'newCity').value.trim(),
        phone:field(f,'newPhone').value.trim(),
        email:field(f,'newEmail').value.trim(),
        memo:field(f,'newMemo') ? field(f,'newMemo').value.trim() : ''
      };
      state.customers.push(newCustomer);
      appointmentCustomerId=newCustomer.id;
    }
    if(existing){
      existing.type=field(f,'type').value;
      existing.customerId=appointmentCustomerId;
      existing.systemId=null;
      existing.date=field(f,'date').value;
      existing.time=field(f,'time').value;
      existing.note=field(f,'note').value.trim();
    }else{
      state.appointments.push({
        id:uid(),
        type:field(f,'type').value,
        customerId:appointmentCustomerId,
        systemId:null,
        date:field(f,'date').value,
        time:field(f,'time').value,
        note:field(f,'note').value.trim()
      });
    }
    save();
    selectedAgendaDate=field(f,'date').value;
    calendarMonth=new Date(field(f,'date').value+'T12:00:00');
    nav('agenda');
  };
}
function deleteGenericAppointment(id){
  if(!confirm('Afspraak verwijderen?')) return;
  state.appointments=appointments().filter(a=>a.id!==id);
  save();
  nav('agenda');
}

function planAppointment(systemId){
  const s=systemById(systemId);
  if(!s) return nav('agenda');
  if(s.serviceStatus==='declined'){ alert('Deze klant wil geen onderhoud. Zet de status eerst terug op actief.'); return nav('detail',{customerId:s.customerId,back:'customers'}); }
  const c=customer(s.customerId)||{};
  const existing = route.appointmentId ? appointments().find(a=>a.id===route.appointmentId) : appointmentForSystem(systemId);
  const dateValue = existing ? existing.date : nextDate(s);
  const timeValue = existing ? existing.time : '09:00';
  const noteValue = existing ? existing.note : 'Jaarlijks onderhoud';

  app.innerHTML = `<section class="screen">
    <form class="form" id="appointmentForm">
      <article class="card">
        <p class="title">${esc(c.name)}</p>
        <p class="muted">${esc(s.brand)} ${esc(s.model)}</p>
        <p class="muted">📍 ${esc(fullAddress(c))}</p>
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
      existing.date=field(f,'date').value;
      existing.time=field(f,'time').value;
      existing.note=field(f,'note').value.trim();
    }else{
      state.appointments.push({id:uid(),type:'onderhoud',customerId:s.customerId,systemId,date:field(f,'date').value,time:field(f,'time').value,note:field(f,'note').value.trim()});
    }
    s.contactStatus='scheduled';
    save();
    selectedAgendaDate=field(f,'date').value;
    calendarMonth=new Date(field(f,'date').value+'T12:00:00');
    nav('agenda');
  };
}

function deleteAppointment(id, systemId){
  if(!confirm('Afspraak verwijderen?')) return;
  state.appointments = appointments().filter(a=>a.id!==id);
  const s=systemById(systemId);
  if(s && !appointmentForSystem(s.id)) s.contactStatus='contacted';
  save();
  nav('detail',{customerId:s?s.customerId:null,back:'customers'});
}

function markDone(id){
  const s=systemById(id);
  if(!s) return;
  const performed=prompt('Op welke datum is het onderhoud uitgevoerd?',todayKey());
  if(performed===null) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(performed)){ alert('Vul een geldige datum in als JJJJ-MM-DD.'); return; }
  s.lastService=performed;
  s.doneCount=(s.doneCount||0)+1;
  s.contactStatus='not_contacted';
  s.lastContactAt=null;
  state.appointments = appointments().filter(a=>a.systemId!==id);
  save();
  alert(`Onderhoud afgerond. Volgend onderhoud: ${fmt(nextDate(s))}.`);
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
  const lastUpdate=state.updatedAt ? new Date(state.updatedAt).toLocaleString('nl-NL') : 'Nog niet opgeslagen';
  const account=getAccountContext();
  const recoveryBackups=window.maintenanceCloud?.getRecoveryBackups?.() || [];
  app.innerHTML = `<section class="screen">
    <article class="card pilot-banner">
      <p class="title">${APP_VERSION}</p>
      <p class="muted">Klanten, installaties, afspraken en bedrijfsinstellingen worden beveiligd in Supabase opgeslagen en zijn op al je apparaten beschikbaar. De browser bewaart daarnaast een lokale cache voor korte offline momenten.</p>
    </article>

    <article class="card account-summary-card">
      <div class="row between">
        <div>
          <p class="title">${esc(account?.organization?.name || state.settings.companyName)}</p>
          <p class="muted">${esc(account?.user?.email || '')}</p>
        </div>
        <button class="smallbtn" type="button" onclick="nav('account')">Account</button>
      </div>
    </article>

    <form class="form" id="settingsForm">
      <article class="card form">
        <h2>Bedrijfsprofiel</h2>
        <div class="field"><label>Bedrijfsnaam</label><input name="companyName" value="${esc(state.settings.companyName)}" required></div>
        <div class="field"><label>Naam voor begroeting</label><input name="contactName" value="${esc(state.settings.contactName)}" placeholder="Bijv. Ike"></div>
        <div class="two">
          <div class="field"><label>Standaard onderhoudsprijs (€)</label><input name="maintenancePrice" type="number" min="0" step="1" value="${Number(state.settings.maintenancePrice)||0}"></div>
          <div class="field"><label>Actielijst vanaf</label><select name="leadDays">
            ${[30,45,60,90].map(v=>`<option value="${v}" ${Number(state.settings.leadDays)===v?'selected':''}>${v} dagen vooraf</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>Standaard onderhoudsinterval</label><select name="defaultInterval">${[6,12,18,24].map(v=>`<option value="${v}" ${Number(state.settings.defaultInterval)===v?'selected':''}>${v} maanden</option>`).join('')}</select></div>
        <div class="field"><label>WhatsApp-bericht</label><textarea name="whatsappTemplate" rows="5">${esc(state.settings.whatsappTemplate)}</textarea><p class="helper">Beschikbaar: {naam}, {bedrijf}, {datum} en {systeem}.</p></div>
        <button class="primary" type="submit">Instellingen opslaan</button>
      </article>
    </form>

    <article class="card">
      <h2>Klanten importeren</h2>
      <p class="muted">Importeer een Excel- of CSV-bestand met klanten en installaties. Download eerst het voorbeeldbestand voor de juiste kolommen.</p>
      <div class="settings-actions">
        <button class="secondary" onclick="downloadImportTemplate()">⬇ Voorbeeldbestand</button>
        <button class="secondary" onclick="document.getElementById('sheetImport').click()">⬆ Excel / CSV importeren</button>
      </div>
      <input id="sheetImport" class="hidden-input" type="file" accept=".xlsx,.xls,.csv,text/csv" onchange="importSpreadsheetFile(this.files[0]);this.value=''">
    </article>

    <article class="card">
      <h2>Cloud, back-up en overdracht</h2>
      <p class="muted">${state.customers.length} klanten · ${state.systems.length} systemen · ${appointments().length} afspraken</p>
      <p class="helper">Laatste lokale wijziging: ${lastUpdate}</p>
      <p class="helper cloud-settings-status">Cloudstatus: ${esc(window.maintenanceCloud?.getStatus?.().label || 'Cloud actief')}</p>
      <div class="settings-actions">
        <button class="secondary" onclick="exportBackup()">⬇ Volledige back-up</button>
        <button class="secondary" onclick="document.getElementById('backupImport').click()">⬆ Back-up terugzetten</button>
        <button class="secondary" onclick="exportOverviewExcel()">📊 Overzicht exporteren</button>
        ${recoveryBackups.length ? `<button class="secondary" onclick="window.maintenanceCloud.downloadLatestRecoveryBackup()">🛟 Noodback-up downloaden (${recoveryBackups.length})</button>` : ''}
      </div>
      <input id="backupImport" class="hidden-input" type="file" accept="application/json,.json" onchange="importBackupFile(this.files[0]);this.value=''">
    </article>

    <article class="card">
      <h2>App en meldingen</h2>
      <div class="settings-actions">
        <button class="secondary" onclick="enableNotifications()">🔔 Browsermeldingen inschakelen</button>
        <button class="secondary" id="installAppBtn" onclick="installApp()" ${deferredInstallPrompt?'':'disabled'}>📲 App installeren</button>
      </div>
      <p class="helper">Browsermeldingen worden gecontroleerd wanneer de app wordt geopend. Ze vervangen nog geen servergestuurde e-mail of WhatsApp.</p>
    </article>

    <article class="card danger-zone">
      <h2>Gevarenzone</h2>
      <button class="danger full-width" onclick="resetDemo()">Alle klanten en planning wissen</button>
    </article>
  </section>`;

  const f=$('#settingsForm');
  f.onsubmit=async(e)=>{
    e.preventDefault();
    state.settings.companyName=field(f,'companyName').value.trim()||'Onderhoudsbedrijf';
    state.settings.contactName=field(f,'contactName').value.trim();
    state.settings.maintenancePrice=Number(field(f,'maintenancePrice').value||0);
    state.settings.leadDays=Number(field(f,'leadDays').value||45);
    state.settings.defaultInterval=Number(field(f,'defaultInterval').value||12);
    state.settings.whatsappTemplate=field(f,'whatsappTemplate').value.trim()||DEFAULT_SETTINGS.whatsappTemplate;
    save();
    try{
      await window.maintenanceAccount?.updateOrganizationName?.(state.settings.companyName);
      await window.maintenanceAccount?.updateProfileName?.(state.settings.contactName);
      if(accountBtn){
        const initials=state.settings.companyName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
        accountBtn.textContent=initials||'OP';
      }
      await window.maintenanceCloud?.flush?.();
      alert('Instellingen en bedrijfsaccount zijn in de cloud opgeslagen.');
    }catch(error){
      console.error('Bedrijfsaccount bijwerken mislukt',error);
      alert('De instellingen zijn lokaal bewaard, maar konden nog niet volledig met het bedrijfsaccount worden gesynchroniseerd.');
    }
    render();
  };
}

function accountPage(){
  const account=getAccountContext();
  const roleLabels={owner:'Eigenaar',planner:'Planner',technician:'Monteur',viewer:'Alleen lezen'};
  const created=account?.organization?.created_at ? new Date(account.organization.created_at).toLocaleDateString('nl-NL') : '-';
  const confirmed=account?.user?.email_confirmed_at ? 'Bevestigd' : 'Niet bevestigd';
  app.innerHTML=`<section class="screen">
    <article class="card account-hero-card">
      <div class="account-avatar-large">${esc((account?.organization?.name||'OP').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase())}</div>
      <h2>${esc(account?.organization?.name||'Bedrijfsaccount')}</h2>
      <p class="muted">${esc(account?.user?.email||'')}</p>
      <span class="status-badge active">E-mail ${confirmed.toLowerCase()}</span>
    </article>

    <article class="card">
      <h2>Accountgegevens</h2>
      <div class="detail-grid">
        <div class="mini"><span>Contactpersoon</span><b>${esc(account?.profile?.full_name||'-')}</b></div>
        <div class="mini"><span>Rol</span><b>${esc(roleLabels[account?.membership?.role]||account?.membership?.role||'-')}</b></div>
        <div class="mini"><span>Bedrijfsomgeving sinds</span><b>${esc(created)}</b></div>
        <div class="mini"><span>Versie</span><b>${esc(APP_VERSION)}</b></div>
      </div>
    </article>

    <article class="card notice-card">
      <h2>Opslag in deze versie</h2>
      <p class="muted">Je account en bedrijfsomgeving staan online. De onderhoudsgegevens zijn nu per account afgescheiden, maar staan tot v0.8.2 nog alleen op dit apparaat. Gebruik daarom de back-upfunctie bij Instellingen.</p>
    </article>

    <article class="card">
      <button class="secondary full-width" type="button" onclick="nav('settings')">Bedrijfsinstellingen wijzigen</button>
      <button class="danger full-width block-gap" type="button" onclick="maintenanceAccount.signOut()">Uitloggen</button>
    </article>
  </section>`;
}

function downloadBlob(content,filename,type='application/octet-stream'){
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function fileDate(){ return todayKey().replaceAll('-',''); }
function exportBackup(){
  save();
  downloadBlob(JSON.stringify({app:'OnderhoudPlanner',version:APP_VERSION,exportedAt:new Date().toISOString(),data:state},null,2),`onderhoudplanner-backup-${fileDate()}.json`,'application/json');
}
async function importBackupFile(file){
  if(!file) return;
  try{
    const parsed=JSON.parse(await file.text());
    const incoming=parsed.data||parsed;
    if(!Array.isArray(incoming.customers)||!Array.isArray(incoming.systems)) throw new Error('Geen geldige OnderhoudPlanner-back-up');
    if(!confirm(`Deze back-up bevat ${incoming.customers.length} klanten en ${incoming.systems.length} systemen. Huidige gegevens vervangen?`)) return;
    state=normalizeState(incoming); save(); nav('dashboard'); alert('Back-up is teruggezet.');
  }catch(e){ alert(`Back-up importeren mislukt: ${e.message}`); }
}
function templateRows(){
  return [{
    klantnaam:'Fam. Jansen',straat:'Kerkstraat 12',postcode:'1234 AB',plaats:'Rotterdam',telefoon:'0612345678',email:'jansen@example.nl',memo:'Alleen in de ochtend',
    type:'airco',merk:'Daikin',model:'Perfera',serienummer:'ABC123',installatiedatum:todayKey(),interval_maanden:12,
    onderhoudsstatus:'actief',laatste_onderhoud:'',opvolgstatus:'nog benaderen',onderhoudsprijs:129
  }];
}
function downloadImportTemplate(){
  const rows=templateRows();
  const headers=Object.keys(rows[0]);
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[headers.join(';'),headers.map(h=>quote(rows[0][h])).join(';')].join('\n');
  downloadBlob('\ufeff'+csv,'onderhoudplanner-import-voorbeeld.csv','text/csv;charset=utf-8');
}

function normalizeHeader(v=''){
  return String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function normalizeRow(row){
  const out={}; Object.entries(row||{}).forEach(([k,v])=>out[normalizeHeader(k)]=v); return out;
}
function parseCsv(text){
  const delimiter=(text.split('\n')[0].match(/;/g)||[]).length >= (text.split('\n')[0].match(/,/g)||[]).length ? ';' : ',';
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"' && quoted && next==='"'){cell+='"';i++;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===delimiter&&!quoted){row.push(cell);cell='';continue;}
    if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&next==='\n') i++;
      row.push(cell);cell=''; if(row.some(v=>String(v).trim())) rows.push(row); row=[]; continue;
    }
    cell+=ch;
  }
  row.push(cell); if(row.some(v=>String(v).trim())) rows.push(row);
  if(!rows.length) return [];
  const headers=rows.shift().map(normalizeHeader);
  return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
async function inflateRaw(bytes){
  if(!('DecompressionStream' in globalThis)) throw new Error('Deze browser kan Excel-bestanden niet lokaal uitpakken. Gebruik CSV.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZipEntries(buffer){
  const bytes=new Uint8Array(buffer), view=new DataView(buffer);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error('Ongeldig Excel-bestand.');
  const total=view.getUint16(eocd+10,true), centralOffset=view.getUint32(eocd+16,true);
  const decoder=new TextDecoder('utf-8');
  const entries=new Map(); let p=centralOffset;
  for(let n=0;n<total;n++){
    if(view.getUint32(p,true)!==0x02014b50) break;
    const method=view.getUint16(p+10,true), compressedSize=view.getUint32(p+20,true);
    const nameLen=view.getUint16(p+28,true), extraLen=view.getUint16(p+30,true), commentLen=view.getUint16(p+32,true);
    const localOffset=view.getUint32(p+42,true);
    const name=decoder.decode(bytes.slice(p+46,p+46+nameLen));
    const localNameLen=view.getUint16(localOffset+26,true), localExtraLen=view.getUint16(localOffset+28,true);
    const dataStart=localOffset+30+localNameLen+localExtraLen;
    entries.set(name,{method,data:bytes.slice(dataStart,dataStart+compressedSize)});
    p+=46+nameLen+extraLen+commentLen;
  }
  const read=async name=>{
    const entry=entries.get(name); if(!entry) return null;
    if(entry.method===0) return entry.data;
    if(entry.method===8) return inflateRaw(entry.data);
    throw new Error(`Niet-ondersteunde Excel-compressie (${entry.method}).`);
  };
  return {entries,read};
}
function xmlText(node){ return [...node.querySelectorAll('t')].map(n=>n.textContent||'').join(''); }
function columnIndex(ref='A1'){
  const letters=(ref.match(/[A-Z]+/i)||['A'])[0].toUpperCase();
  let value=0; for(const ch of letters) value=value*26+ch.charCodeAt(0)-64; return value-1;
}
async function readXlsxRows(buffer){
  const zip=await readZipEntries(buffer);
  const decoder=new TextDecoder('utf-8');
  let shared=[];
  const sharedBytes=await zip.read('xl/sharedStrings.xml');
  if(sharedBytes){
    const doc=new DOMParser().parseFromString(decoder.decode(sharedBytes),'application/xml');
    shared=[...doc.querySelectorAll('si')].map(xmlText);
  }
  const sheets=[...zip.entries.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!sheets.length) throw new Error('Geen werkblad gevonden.');
  const sheetBytes=await zip.read(sheets[0]);
  const doc=new DOMParser().parseFromString(decoder.decode(sheetBytes),'application/xml');
  const matrix=[];
  [...doc.querySelectorAll('sheetData row')].forEach(rowNode=>{
    const row=[];
    [...rowNode.querySelectorAll(':scope > c')].forEach(cellNode=>{
      const index=columnIndex(cellNode.getAttribute('r')||'A1');
      const type=cellNode.getAttribute('t')||'';
      let value='';
      if(type==='inlineStr') value=xmlText(cellNode);
      else{
        value=cellNode.querySelector('v')?.textContent??'';
        if(type==='s') value=shared[Number(value)]??'';
        if(type==='b') value=value==='1'?'ja':'nee';
      }
      row[index]=value;
    });
    matrix.push(row);
  });
  if(!matrix.length) return [];
  const headers=matrix.shift().map(normalizeHeader);
  return matrix.filter(r=>r.some(v=>String(v??'').trim())).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}

function parseImportedDate(value){
  if(!value) return '';
  if(value instanceof Date && !isNaN(value)) return toDateKey(value);
  if(typeof value==='number'){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const text=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
  const m=text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d=new Date(text); return isNaN(d)?'':toDateKey(d);
}
function mapServiceStatus(value){
  const v=normalizeHeader(value); if(['geen_onderhoud','geweigerd','declined','nee'].includes(v)) return 'declined'; if(['later','pauze','paused'].includes(v)) return 'paused'; return 'active';
}
function mapContactStatus(value){
  const v=normalizeHeader(value);
  if(['bericht_verstuurd','verstuurd','contacted'].includes(v)) return 'contacted';
  if(['reactie_ontvangen','reactie','responded'].includes(v)) return 'responded';
  if(['ingepland','scheduled'].includes(v)) return 'scheduled';
  if(['afgerond','completed'].includes(v)) return 'completed';
  return 'not_contacted';
}
function cell(row,...keys){ for(const key of keys){ const value=row[normalizeHeader(key)]; if(value!==undefined&&String(value).trim()!=='') return value; } return ''; }
function importRows(rows){
  let customersAdded=0,systemsAdded=0,skipped=0;
  const customerIndex=new Map();
  state.customers.forEach(c=>{
    const key=(c.email||'').toLowerCase() || (c.phone||'').replace(/\D/g,'') || normalizeHeader(`${c.name}_${c.address}`);
    if(key) customerIndex.set(key,c);
  });
  rows.map(normalizeRow).forEach(row=>{
    const name=String(cell(row,'klantnaam','naam','customer','customer_name')).trim();
    if(!name){skipped++;return;}
    const address=String(cell(row,'straat','adres','address')).trim();
    const phone=String(cell(row,'telefoon','phone','mobiel')).trim();
    const email=String(cell(row,'email','e_mail')).trim();
    const key=email.toLowerCase() || phone.replace(/\D/g,'') || normalizeHeader(`${name}_${address}`);
    let c=customerIndex.get(key);
    if(!c){
      c={id:uid(),name,address,postalCode:String(cell(row,'postcode','postal_code')).trim(),city:String(cell(row,'plaats','woonplaats','city')).trim(),phone,email,memo:String(cell(row,'memo','notitie')).trim()};
      state.customers.push(c); customerIndex.set(key,c); customersAdded++;
    }
    const brand=String(cell(row,'merk','brand')).trim();
    const model=String(cell(row,'model')).trim();
    const serial=String(cell(row,'serienummer','serial','serial_number')).trim();
    if(!brand&&!model&&!serial) return;
    const installedAt=parseImportedDate(cell(row,'installatiedatum','installatie_datum','installed_at'))||todayKey();
    const duplicate=state.systems.some(s=>s.customerId===c.id && ((serial&&s.serial===serial)||(!serial&&s.brand===brand&&s.model===model&&s.installedAt===installedAt)));
    if(duplicate){skipped++;return;}
    const interval=Number(cell(row,'interval_maanden','interval','onderhoudsinterval'))||state.settings.defaultInterval||12;
    const sys=makeSystem(c.id,normalizeHeader(cell(row,'type'))==='warmtepomp'?'warmtepomp':'airco',brand||'Onbekend',model||'Onbekend',serial,installedAt,interval);
    sys.serviceStatus=mapServiceStatus(cell(row,'onderhoudsstatus','service_status'));
    sys.lastService=parseImportedDate(cell(row,'laatste_onderhoud','last_service'))||null;
    sys.contactStatus=mapContactStatus(cell(row,'opvolgstatus','contactstatus','contact_status'));
    const price=Number(String(cell(row,'onderhoudsprijs','prijs','maintenance_price')).replace(',','.'));
    sys.maintenancePrice=Number.isFinite(price)&&price>=0?price:null;
    state.systems.push(sys); systemsAdded++;
  });
  save(); return {customersAdded,systemsAdded,skipped};
}
async function importSpreadsheetFile(file){
  if(!file) return;
  try{
    let rows=[];
    if(/\.csv$/i.test(file.name)) rows=parseCsv(await file.text());
    else rows=await readXlsxRows(await file.arrayBuffer());
    if(!rows.length) throw new Error('Geen gegevensrijen gevonden.');
    const result=importRows(rows);
    alert(`Import klaar: ${result.customersAdded} klanten en ${result.systemsAdded} systemen toegevoegd. ${result.skipped} rijen overgeslagen of al aanwezig.`);
    nav('customers');
  }catch(e){ alert(`Importeren mislukt: ${e.message}`); }
}
function exportRows(){
  return state.systems.map(s=>{
    const c=customer(s.customerId)||{};
    return {klantnaam:c.name,straat:c.address,postcode:c.postalCode,plaats:c.city,telefoon:c.phone,email:c.email,memo:c.memo,type:s.type,merk:s.brand,model:s.model,serienummer:s.serial,installatiedatum:s.installedAt,laatste_onderhoud:s.lastService||'',volgend_onderhoud:nextDate(s),interval_maanden:s.interval,onderhoudsstatus:s.serviceStatus,opvolgstatus:contactStatusLabel(s.contactStatus),onderhoudsprijs:systemPrice(s)};
  });
}
function exportOverviewExcel(){
  const rows=exportRows();
  if(!rows.length){alert('Er zijn nog geen systemen om te exporteren.');return;}
  const headers=Object.keys(rows[0]);
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[headers.join(';'),...rows.map(r=>headers.map(h=>quote(r[h])).join(';'))].join('\n');
  downloadBlob('\ufeff'+csv,`onderhoudplanner-overzicht-${fileDate()}.csv`,'text/csv;charset=utf-8');
}

async function enableNotifications(){
  if(!('Notification' in window)){alert('Deze browser ondersteunt geen meldingen.');return;}
  const permission=await Notification.requestPermission();
  if(permission==='granted'){
    new Notification('OnderhoudPlanner',{body:`${actionSystems().length} onderhoudsmomenten vragen aandacht.`,icon:'/icon-192.png'});
  }else alert('Meldingen zijn niet toegestaan in de browserinstellingen.');
}
function checkDueNotification(){
  if('Notification' in window && Notification.permission==='granted'){
    const due=actionSystems().filter(s=>daysUntil(nextDate(s))<=0).length;
    const last=localRepository.getItem(`${KEY}_last_notification`);
    if(due>0 && last!==todayKey()){
      new Notification('OnderhoudPlanner',{body:`${due} onderhoudsmoment${due===1?'':'en'} zijn nu of eerder gepland.`,icon:'/icon-192.png'});
      localRepository.setItem(`${KEY}_last_notification`,todayKey());
    }
  }
}
async function installApp(){
  if(!deferredInstallPrompt){alert('Open de app via Chrome of Edge en gebruik zo nodig “App installeren” in het browsermenu.');return;}
  deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; render();
}
async function resetDemo(){
  if(!confirm('Alle klanten, installaties en afspraken uit deze bedrijfsomgeving verwijderen? De bedrijfsnaam en het account blijven bestaan.')) return;
  const account=getAccountContext();
  localRepository.removeItem(KEY);
  state = normalizeState({
    ...structuredClone(demoState),
    company: account?.organization?.name || state.settings.companyName || 'Onderhoudsbedrijf',
    settings:{
      ...DEFAULT_SETTINGS,
      companyName: account?.organization?.name || state.settings.companyName || 'Onderhoudsbedrijf',
      contactName: account?.profile?.full_name || state.settings.contactName || ''
    }
  });
  save();
  try{
    await window.maintenanceCloud?.flush?.();
    alert('Alle klanten, installaties en afspraken zijn uit de cloud verwijderd.');
  }catch(error){
    console.error('Cloudgegevens wissen nog niet gesynchroniseerd',error);
    alert('De gegevens zijn op dit apparaat gewist, maar de cloud kon nog niet worden bijgewerkt. Laat de app open en controleer de cloudstatus.');
  }
  nav('dashboard');
}


function deleteCustomer(id){
  if(!confirm('Klant verwijderen? Alle gekoppelde systemen en afspraken worden ook verwijderd.')) return;
  const systemIds = state.systems.filter(s=>s.customerId===id).map(s=>s.id);
  state.systems = state.systems.filter(s=>s.customerId!==id);
  state.appointments = appointments().filter(a=>a.customerId!==id && !systemIds.includes(a.systemId));
  state.customers = state.customers.filter(c=>c.id!==id);
  save();
  nav('customers');
}

Object.assign(window,{
  nav,changeMonth,selectAgendaDate,goToday,markDone,deleteSystem,deleteCustomer,resetDemo,
  deleteAppointment,deleteGenericAppointment,markContacted,setContactStatus,downloadImportTemplate,
  importSpreadsheetFile,exportBackup,importBackupFile,exportOverviewExcel,enableNotifications,installApp
});

notifyBtn.onclick=()=>nav('notifications');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;});
render();
setTimeout(checkDueNotification,800);
