import { APP_VERSION, STORAGE_KEY as KEY, LEGACY_STORAGE_KEYS as LEGACY_KEYS } from './config.js';
import { localRepository } from './data/local-repository.js';
import { getAccountContext } from './account-context.js';
import { listTeamMembers, listPendingInvitations, inviteTeamMember, getAppointmentAssignments, setAppointmentAssignments } from './team/team-service.js';
import { flushCloudSync, verifyCloudAppointment, deleteCloudAppointments, deleteCloudInstallation, deleteCloudCustomer, clearCloudOperationalData } from './data/cloud-repository.js';
import { getSurvey, saveSurvey, listSurveyPhotos, uploadSurveyPhotos, deleteSurveyPhoto } from './surveys/survey-service.js';

const $ = (s) => document.querySelector(s);
const field = (form, name) => form?.elements?.namedItem(name) || null;
const app = $('#app');
const pageTitle = $('#pageTitle');
const backBtn = $('#backBtn');
const fabAdd = $('#fabAdd');
const notifyBtn = $('#notifyBtn');
const accountBtn = $('#accountBtn');
const syncStatusBtn = $('#syncStatus');

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

const SURVEY_ROOM_OPTIONS = [
  'Woonkamer','Slaapkamer','Keuken','Kantoor','Zolder','Serre','Garage','Praktijkruimte','Winkelruimte','Anders...'
];
const SURVEY_CAPACITY_OPTIONS = ['2.0','2.5','3.5','4.2','5.0','6.0','7.1','8.0','10.0','Anders...'];

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
const currentRole = getAccountContext()?.membership?.role || 'owner';
let route = {name: currentRole === 'technician' ? 'myDay' : 'dashboard'};
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
  if(type==='opname') return '📋';
  return '❄️';
}
function appointmentTitle(type){
  if(type==='plaatsing') return 'Plaatsing';
  if(type==='storing') return 'Storing';
  if(type==='controle') return 'Controle';
  if(type==='opname') return 'Opname';
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

const ROLE_ROUTE_ACCESS = Object.freeze({
  owner: new Set(['dashboard','customers','agenda','settings','account','team','myDay','new','detail','editCustomer','editSystem','planAppointment','newAppointment','dayPlan','appointmentDetail','notifications','surveyDetail','surveyEdit']),
  planner: new Set(['dashboard','customers','agenda','account','myDay','new','detail','editCustomer','editSystem','planAppointment','newAppointment','dayPlan','appointmentDetail','notifications','surveyDetail','surveyEdit']),
  technician: new Set(['myDay','account','appointmentDetail','surveyDetail','surveyEdit']),
  viewer: new Set(['account'])
});

function defaultRouteForRole(){
  if(currentRole === 'technician') return 'myDay';
  if(currentRole === 'viewer') return 'account';
  return 'dashboard';
}

function canAccessRoute(name){
  return Boolean(ROLE_ROUTE_ACCESS[currentRole]?.has(name));
}
function nav(name, params={}){
  const safeName = canAccessRoute(name) ? name : defaultRouteForRole();
  route = {name:safeName, ...(safeName===name ? params : {})};
  render();
}

function updateFab(){
  const show = currentRole !== 'technician' && ['dashboard','customers'].includes(route.name);
  fabAdd.style.display = show ? 'block' : 'none';
  fabAdd.onclick = () => nav('new',{back:route.name});
}

function render(){
  if(!canAccessRoute(route.name)) route = {name:defaultRouteForRole()};
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===route.name));
  backBtn.hidden = ['dashboard','customers','agenda','settings','myDay'].includes(route.name);
  backBtn.onclick = () => navBack();

  const titles = {
    dashboard:'Dashboard', customers:'Klanten', agenda:'Agenda', settings:'Instellingen', account:currentRole === 'technician' ? 'Mijn account' : 'Bedrijfsaccount', team:'Medewerkers', myDay:'Mijn dag',
    new:'Nieuwe installatie', detail:'Klantdetail', editCustomer:'Klant bewerken',
    editSystem:'Systeem bewerken', planAppointment:'Afspraak plannen', newAppointment:'Afspraak inplannen', dayPlan:'Dagplanning', appointmentDetail:'Afspraakdetails', notifications:'Actielijst', surveyDetail:'Opnamedossier', surveyEdit:'Opname invullen'
  };
  pageTitle.textContent = titles[route.name] || 'Optero';

  if(route.name==='dashboard') dashboard();
  if(route.name==='customers') customers();
  if(route.name==='agenda') agenda();
  if(route.name==='settings') settings();
  if(route.name==='team') teamPage();
  if(route.name==='myDay') myDayPage();
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
  if(route.name==='surveyDetail') void surveyDetailPage(route.appointmentId);
  if(route.name==='surveyEdit') void surveyEditPage(route.appointmentId);

  updateFab();
}

function navBack(){
  if(route.name==='surveyDetail' || route.name==='surveyEdit') return nav('appointmentDetail',{appointmentId:route.appointmentId,back:currentRole==='technician'?'myDay':'agenda'});
  if(route.name==='appointmentDetail') return nav(currentRole==='technician' ? 'myDay' : 'dayPlan',{date:route.date || todayKey(),back:'agenda'});
  if(route.name==='notifications' || route.name==='account' || route.name==='team') return nav(currentRole === 'technician' ? 'myDay' : 'dashboard');
  if(route.name==='detail') return nav(route.back || 'dashboard');
  if(route.name==='editCustomer') return nav('detail',{customerId:route.customerId,back:'customers'});
  if(route.name==='editSystem' || route.name==='planAppointment'){
    const s = systemById(route.systemId);
    return nav('detail',{customerId:s ? s.customerId : null,back:'customers'});
  }
  return nav(route.back || 'dashboard');
}

if(currentRole === 'technician'){
  document.querySelectorAll('.bottom-nav button').forEach(button=>{ button.hidden = true; });
  fabAdd.hidden = true;
  if(syncStatusBtn) syncStatusBtn.hidden = true;
  if(notifyBtn) notifyBtn.hidden = true;
}else if(currentRole === 'planner'){
  document.querySelectorAll('.bottom-nav button[data-route="settings"]').forEach(button=>{ button.hidden = true; });
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
      <button class="secondary" onclick="nav('newAppointment',{systemId:'${s.id}',customerId:'${s.customerId}',type:'onderhoud',date:'${nextDate(s)}',scheduleSource:'maintenance',back:'dashboard'})">📅 Afspraak maken</button>
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
    ${currentRole==='technician'?'':`<article class="card survey-dashboard-card"><div class="row between"><div><p class="title">📋 Opnames</p><p class="muted">Plan een opname en leg bevindingen, technische notities en foto's vast.</p></div><button class="smallbtn" onclick="nav('newAppointment',{type:'opname',date:'${todayKey()}',back:'dashboard'})">+ Opname</button></div></article>`}
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
      <button class="secondary" onclick="nav('newAppointment',{systemId:'${s.id}',customerId:'${s.customerId}',type:'onderhoud',date:'${nextDate(s)}',scheduleSource:'maintenance',back:'agenda'})">📅 Onderhoud plannen</button>
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
      ${currentRole==='technician'?`<button class="edit-btn" aria-label="Open opdracht" onclick="nav('appointmentDetail',{appointmentId:'${a.id}',back:'myDay'})">›</button>`:`<button class="edit-btn" onclick="nav('newAppointment',{appointmentId:'${a.id}',back:'agenda'})">✏️</button>`}
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

    ${a.type==='opname'?`<button class="primary" onclick="nav('surveyDetail',{appointmentId:'${a.id}'})">📋 Open opnamedossier</button>`:''}
    ${currentRole==='technician'?'':`<button class="secondary" style="width:100%;margin-top:10px" onclick="nav('newAppointment',{appointmentId:'${a.id}',back:'appointmentDetail'})">✏️ Afspraak bewerken</button><button class="danger" style="width:100%;margin-top:10px" onclick="deleteGenericAppointment('${a.id}')">🗑 Afspraak verwijderen</button>`}
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
  if(!a) return '<div class="notice appointment-empty" style="margin-top:12px">Geen echte klus ingepland voor dit systeem.</div>';
  return `<div class="notice appointment-set" style="margin-top:12px"><b>Echte geplande klus</b><br>${appointmentTitle(a.type||'onderhoud')} · ${fmt(a.date)} om ${a.time||'tijd onbekend'}<br>${esc(a.note||'')}</div>`;
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
        <div class="mini"><span>Plaatsingsdatum</span><b>${fmt(s.installedAt)}</b></div>
        <div class="mini"><span>Interval</span><b>Elke ${s.interval} maanden</b></div>
        <div class="mini"><span>Onderhoudsadvies</span><b>${fmt(nextDate(s))}</b></div>
        <div class="mini"><span>Onderhoudsprijs</span><b>${euro(systemPrice(s))}</b></div>
        <div class="mini"><span>Uitgevoerd</span><b>${Number(s.doneCount)||0} keer</b></div>
      </div>
      ${appointmentInfo(s)}
      <div class="notice status-note block-gap"><b>Onderhoudsstatus</b><br>${statusBadge(s)}${s.statusNote ? '<br>'+esc(s.statusNote) : ''}</div>
      <div class="status-row">${contactStatusSelect(s)}${s.lastContactAt?`<small>Laatst: ${fmtShort(s.lastContactAt)}</small>`:''}</div>
      <div class="actions">
        <a class="secondary whatsapp ${hasPhone?'':'disabled'}" ${hasPhone?`href="${whatsappLink(c,s)}" onclick="markContacted('${s.id}')"`:'aria-disabled="true"'}>💬 Herinner klant</a>
      </div>
      <div class="planning-choice">
        <p class="planning-choice-title">Werk inplannen</p>
        <p class="helper">Plaatsingsdatum en onderhoudsadvies zijn gegevens. Een klus verschijnt pas in de agenda nadat je hieronder een echte afspraak maakt.</p>
        <div class="planning-choice-actions">
          <button class="secondary" onclick="nav('newAppointment',{systemId:'${s.id}',customerId:'${s.customerId}',type:'plaatsing',date:'${s.installedAt||todayKey()}',scheduleSource:'installation',back:'detail'})">🛠 Plaatsing inplannen</button>
          <button class="secondary" onclick="nav('newAppointment',{systemId:'${s.id}',customerId:'${s.customerId}',type:'onderhoud',date:'${nextDate(s)}',scheduleSource:'maintenance',back:'detail'})">🔧 Onderhoud plannen</button>
        </div>
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
    <div class="field"><label>Plaatsingsdatum</label><input name="installedAt" type="date" value="${s.installedAt||todayKey()}" required><p class="helper">Dit registreert wanneer het systeem is of wordt geplaatst. Dit maakt nog geen afspraak in de agenda.</p></div>
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
  f.onsubmit=async (e)=>{
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
  f.onsubmit=async (e)=>{
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
      const appointmentIds=appointments().filter(a=>a.systemId===s.id).map(a=>a.id);
      try{ await deleteCloudAppointments(appointmentIds); }
      catch(error){ alert(`De gekoppelde afspraken konden niet veilig uit de cloud worden verwijderd. Er is niets lokaal verwijderd.\n\n${error?.message||'Onbekende fout'}`); return; }
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



async function assignmentEditorData(appointmentId='', {preselectSoleTechnician=false}={}){
  if(currentRole === 'technician') return {members:[],selected:new Set()};
  try{
    const [members, assignments] = await Promise.all([
      listTeamMembers(),
      appointmentId ? getAppointmentAssignments(appointmentId) : Promise.resolve([])
    ]);
    const active=(members||[])
      .filter(m=>m.status==='active' && ['technician','planner','owner'].includes(m.role))
      .sort((a,b)=>{
        const rank={technician:0,planner:1,owner:2};
        return (rank[a.role]??9)-(rank[b.role]??9) || String(a.display_name||a.email||'').localeCompare(String(b.display_name||b.email||''),'nl');
      });
    const selected=new Set((assignments||[]).map(a=>a.user_id));
    if(preselectSoleTechnician && !selected.size){
      const technicians=active.filter(m=>m.role==='technician');
      if(technicians.length===1) selected.add(technicians[0].user_id);
    }
    return {members:active,selected};
  }catch(error){
    console.warn('Werktoewijzing laden mislukt', error);
    return {members:[],selected:new Set()};
  }
}

function assignmentEditorHtml(members=[], selected=new Set()){
  if(!members.length) return `<div class="field assignment-field"><label>Monteur / uitvoerder</label><p class="helper">Nog geen actieve medewerkers beschikbaar. Je kunt de afspraak wel opslaan en later iemand toewijzen.</p></div>`;
  return `<div class="field assignment-field">
    <div class="row between assignment-heading"><label>Monteur / uitvoerder</label><span class="assignment-count">${selected.size ? `${selected.size} geselecteerd` : 'Nog niemand'}</span></div>
    <p class="helper">Tik op een naam om de klus toe te wijzen. Je kunt ook meerdere monteurs selecteren.</p>
    <div class="assignment-list">${members.map(m=>`<label class="assignment-option"><input type="checkbox" name="assignedUsers" value="${esc(m.user_id)}" ${selected.has(m.user_id)?'checked':''}><span class="assignment-person"><b>${esc(m.display_name||m.email||'Gebruiker')}</b><small>${m.role==='technician'?'Monteur':m.role==='planner'?'Planner':'Eigenaar'}</small></span><span class="assignment-check">✓</span></label>`).join('')}</div>
  </div>`;
}

function bindAssignmentSelection(form){
  const count=form?.querySelector('.assignment-count');
  const update=()=>{
    const selected=[...form.querySelectorAll('input[name="assignedUsers"]:checked')];
    if(count) count.textContent=selected.length ? `${selected.length} geselecteerd` : 'Nog niemand';
  };
  form?.querySelectorAll('input[name="assignedUsers"]').forEach(input=>input.addEventListener('change',update));
  update();
}

function selectedAssignmentUserIds(form){
  return [...form.querySelectorAll('input[name="assignedUsers"]:checked')].map(input=>input.value);
}

async function persistAssignments(appointmentId, form){
  // Eerst moet de afspraak aantoonbaar in Supabase staan. Pas daarna mag de
  // medewerkerstoewijzing worden geschreven, omdat die via een foreign key/RPC
  // naar de cloudafspraak verwijst. Fouten worden bewust doorgegeven: de UI mag
  // nooit doen alsof een opdracht is opgeslagen wanneer de cloudwrite faalde.
  await flushCloudSync();
  // Niet alleen vertrouwen op het groene sync-badge: lees de zojuist gemaakte
  // afspraak terug uit Supabase. Pas daarna wordt de klus aan medewerkers
  // gekoppeld en mag de UI naar de agenda navigeren.
  await verifyCloudAppointment(appointmentId);
  await setAppointmentAssignments(appointmentId, selectedAssignmentUserIds(form));
}

async function persistAppointmentForm(appointmentId, form){
  try{
    await persistAssignments(appointmentId, form);
    return true;
  }catch(error){
    console.error('Afspraak of werktoewijzing opslaan mislukt', error);
    alert(`Opslaan naar de cloud is niet gelukt. De afspraak blijft op dit apparaat bewaard en wordt niet verwijderd. Probeer opnieuw voordat je uitlogt.\n\n${error?.message || 'Onbekende fout'}`);
    return false;
  }
}

async function newAppointment(){
  const existing = route.appointmentId ? appointments().find(a=>a.id===route.appointmentId) : null;
  const routedSystem = route.systemId ? systemById(route.systemId) : null;
  const customerId = existing?.customerId || route.customerId || routedSystem?.customerId || state.customers[0]?.id || '';
  const systemId = existing?.systemId || route.systemId || '';
  const dateValue = existing?.date || route.date || selectedAgendaDate || todayKey();
  const timeValue = existing?.time || '09:00';
  const typeValue = existing?.type || route.type || 'plaatsing';
  const defaultNote = route.scheduleSource==='installation' && routedSystem
    ? `Plaatsing ${routedSystem.brand||''} ${routedSystem.model||''}`.trim()
    : route.scheduleSource==='maintenance' && routedSystem
      ? `Onderhoud ${routedSystem.brand||''} ${routedSystem.model||''}`.trim()
      : '';
  const noteValue = existing?.note || defaultNote;
  const assignmentData = await assignmentEditorData(existing?.id || '', {preselectSoleTechnician:!existing});

  const schedulingNotice = !existing && route.scheduleSource==='installation' && routedSystem
    ? `<div class="planning-context installation"><b>🛠 Plaatsing inplannen</b><span>Geregistreerde plaatsingsdatum: ${fmt(routedSystem.installedAt)}. Kies hieronder de echte datum en tijd waarop de monteur de klus uitvoert.</span></div>`
    : !existing && route.scheduleSource==='maintenance' && routedSystem
      ? `<div class="planning-context maintenance"><b>🔧 Onderhoud plannen</b><span>Optero adviseert onderhoud rond ${fmt(nextDate(routedSystem))}. Dit is alleen een adviesdatum; jij kiest hieronder de echte afspraak.</span></div>`
      : `<div class="planning-context"><b>📅 Echte afspraak</b><span>Alleen afspraken die je hier opslaat verschijnen in de agenda van kantoor en de toegewezen monteur.</span></div>`;

  function systemOptionsFor(cid, selected=''){
    const systems=systemsForCustomer(cid);
    return `<option value="">Geen systeem gekoppeld</option>${systems.map(sys=>`<option value="${sys.id}" ${sys.id===selected?'selected':''}>${sys.type==='warmtepomp'?'Warmtepomp':'Airco'} · ${esc(sys.brand)} ${esc(sys.model)}</option>`).join('')}`;
  }

  app.innerHTML = `<section class="screen planning-screen">
    <form class="form" id="genericAppointmentForm">
      ${schedulingNotice}
      <article class="card form planning-form-card">
        <div class="row between planning-form-title"><div><p class="eyebrow">PLANNING</p><h2>${existing?'Afspraak bewerken':'Nieuwe afspraak'}</h2></div>${existing?`<span class="pill">Bewerken</span>`:''}</div>
        <div class="field">
          <label>Soort klus</label>
          <select name="type">
            <option value="plaatsing" ${typeValue==='plaatsing'?'selected':''}>Plaatsing</option>
            <option value="onderhoud" ${typeValue==='onderhoud'?'selected':''}>Onderhoud</option>
            <option value="storing" ${typeValue==='storing'?'selected':''}>Storing</option>
            <option value="controle" ${typeValue==='controle'?'selected':''}>Controle / inspectie</option>
            <option value="opname" ${typeValue==='opname'?'selected':''}>Opname</option>
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
        <div class="field system-picker-wrap">
          <label>Systeem / installatie <span class="optional">optioneel</span></label>
          <select name="systemId">${systemOptionsFor(customerId,systemId)}</select>
          <p class="helper">Koppel het systeem zodat de monteur direct de juiste installatiegegevens bij de klus ziet.</p>
        </div>
        <div class="two planning-date-time">
          <div class="field"><label>Datum</label><input name="date" type="date" value="${dateValue}" required></div>
          <div class="field"><label>Starttijd</label><input name="time" type="time" value="${timeValue}"></div>
        </div>
        ${assignmentEditorHtml(assignmentData.members, assignmentData.selected)}
        <div class="field"><label>Werkinstructie / notitie <span class="optional">optioneel</span></label><textarea name="note" rows="3" placeholder="Bijv. buitenunit op plat dak, klant bellen bij aankomst">${esc(noteValue)}</textarea></div>
      </article>
      <button class="primary planning-submit" type="submit">${existing?'Wijzigingen opslaan':'Afspraak inplannen'}</button>
      ${existing?`<button class="danger" type="button" onclick="deleteGenericAppointment('${existing.id}')">Afspraak verwijderen</button>`:''}
    </form>
  </section>`;

  const f=$('#genericAppointmentForm');
  bindAssignmentSelection(f);
  const toggleNewCustomerFields=()=>{
    const wrap=f.querySelector('.new-customer-fields');
    const isNew=field(f,'customerId').value==='__new__';
    if(wrap) wrap.classList.toggle('show',isNew);
    const sys=field(f,'systemId');
    if(sys && !isNew) sys.innerHTML=systemOptionsFor(field(f,'customerId').value,sys.value);
    if(sys && isNew) sys.innerHTML='<option value="">Eerst klant opslaan</option>';
  };
  field(f,'customerId').onchange=toggleNewCustomerFields;
  toggleNewCustomerFields();

  f.onsubmit=async (e)=>{
    e.preventDefault();
    const submit=f.querySelector('.planning-submit');
    if(submit){ submit.disabled=true; submit.textContent='Opslaan…'; }
    let appointmentCustomerId=field(f,'customerId').value;
    try{
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
      const selectedSystemId=field(f,'systemId')?.value || null;
      let savedAppointmentId='';
      if(existing){
        existing.type=field(f,'type').value;
        existing.customerId=appointmentCustomerId;
        existing.systemId=selectedSystemId;
        existing.date=field(f,'date').value;
        existing.time=field(f,'time').value;
        existing.note=field(f,'note').value.trim();
        savedAppointmentId=existing.id;
      }else{
        const created={
          id:uid(),
          type:field(f,'type').value,
          customerId:appointmentCustomerId,
          systemId:selectedSystemId,
          date:field(f,'date').value,
          time:field(f,'time').value,
          note:field(f,'note').value.trim()
        };
        state.appointments.push(created);
        savedAppointmentId=created.id;
      }
      const selectedSystem=selectedSystemId ? systemById(selectedSystemId) : null;
      if(selectedSystem && field(f,'type').value==='onderhoud') selectedSystem.contactStatus='scheduled';
      save();
      if(!(await persistAppointmentForm(savedAppointmentId, f))) return;
      selectedAgendaDate=field(f,'date').value;
      calendarMonth=new Date(field(f,'date').value+'T12:00:00');
      nav('dayPlan',{date:selectedAgendaDate,back:'agenda'});
    }finally{
      if(submit && document.body.contains(submit)){ submit.disabled=false; submit.textContent=existing?'Wijzigingen opslaan':'Afspraak inplannen'; }
    }
  };
}

function surveyPurposeLabel(value){
  return ({nieuwe_installatie:'Nieuwe installatie',vervanging:'Vervanging',uitbreiding:'Uitbreiding',storing_onderzoek:'Storing / onderzoek',onderhoud:'Onderhoud',anders:'Anders'})[value] || 'Nieuwe installatie';
}
function surveyStatusLabel(value){ return ({planned:'Gepland',in_progress:'Bezig',completed:'Afgerond'})[value] || 'Gepland'; }
function ynSelect(name,label,value='unknown'){
  return `<div class="field"><label>${label}</label><select name="${name}"><option value="unknown" ${value==='unknown'?'selected':''}>Onbekend / nog controleren</option><option value="yes" ${value==='yes'?'selected':''}>Ja</option><option value="no" ${value==='no'?'selected':''}>Nee</option></select></div>`;
}
function surveyField(name,label,value='',placeholder='',type='text'){
  if(type==='textarea') return `<div class="field"><label>${label}</label><textarea name="${name}" rows="3" placeholder="${esc(placeholder)}">${esc(value||'')}</textarea></div>`;
  if(type==='number') return `<div class="field"><label>${label}</label><input name="${name}" type="number" min="0" step="0.1" value="${esc(value??'')}" placeholder="${esc(placeholder)}"></div>`;
  return `<div class="field"><label>${label}</label><input name="${name}" type="text" value="${esc(value||'')}" placeholder="${esc(placeholder)}"></div>`;
}
function surveySelect(name,label,value,options){
  return `<div class="field"><label>${label}</label><select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${String(value??'')===String(v)?'selected':''}>${l}</option>`).join('')}</select></div>`;
}
function surveyOptionSelect(name,label,value,options){
  return surveySelect(name,label,value,options.map(v=>[v,v]));
}
function surveyInstallUnitCount(systemType){
  if(systemType==='multi_split') return 2;
  if(systemType==='triple_split') return 3;
  return 1;
}
function normalizedSurveyInstallUnits(details={},count=1){
  const saved=Array.isArray(details.units)?details.units:[];
  return Array.from({length:count},(_,i)=>({
    room:saved[i]?.room || '',
    capacityKw:saved[i]?.capacityKw || ''
  }));
}
function surveyBrandModelFields(details={}){
  const brand=details.brandPreference || 'Daikin';
  const brandKnown=BRAND_OPTIONS.includes(brand);
  const selectedBrand=brandKnown?brand:'Anders...';
  const modelList=MODEL_OPTIONS[selectedBrand] || ['Anders...'];
  const model=details.modelPreference || '';
  const modelKnown=modelList.includes(model);
  return `<div class="form-grid-2">
    ${surveySelect('brandPreference','Merk',selectedBrand,BRAND_OPTIONS.map(v=>[v,v]))}
    ${surveySelect('modelPreference','Model / serie',modelKnown?model:'Anders...',modelList.map(v=>[v,v]))}
  </div>
  <div class="form-grid-2">
    <div class="field survey-brand-other ${selectedBrand==='Anders...'?'show':''}"><label>Ander merk</label><input name="brandOther" value="${esc(details.brandOther || (!brandKnown?brand:''))}" placeholder="Vul merk in"></div>
    <div class="field survey-model-other ${(model==='Anders...' || (!modelKnown && model))?'show':''}"><label>Ander model</label><input name="modelOther" value="${esc(details.modelOther || (!modelKnown?model:''))}" placeholder="Vul model in"></div>
  </div>`;
}
function surveyInstallUnitCard(unit,index){
  const room=unit.room || 'Woonkamer';
  const roomKnown=SURVEY_ROOM_OPTIONS.includes(room);
  const capacity=String(unit.capacityKw || '2.5');
  const capacityKnown=SURVEY_CAPACITY_OPTIONS.includes(capacity);
  return `<div class="survey-unit-card">
    <div class="survey-unit-title"><b>Binnenunit ${index+1}</b><span>Ruimte en vermogen</span></div>
    <div class="form-grid-2">
      ${surveyOptionSelect(`unitRoom${index+1}`,'Ruimte',roomKnown?room:'Anders...',SURVEY_ROOM_OPTIONS)}
      ${surveySelect(`unitCapacity${index+1}`,'Vermogen',capacityKnown?capacity:'Anders...',SURVEY_CAPACITY_OPTIONS.map(v=>[v,v==='Anders...'?'Anders...':`${v} kW`]))}
    </div>
    <div class="form-grid-2">
      <div class="field survey-room-other ${room==='Anders...' || !roomKnown?'show':''}"><label>Andere ruimte</label><input name="unitRoomOther${index+1}" value="${esc(!roomKnown?room:'')}" placeholder="Bijv. hobbykamer"></div>
      <div class="field survey-capacity-other ${capacity==='Anders...' || !capacityKnown?'show':''}"><label>Ander vermogen (kW)</label><input name="unitCapacityOther${index+1}" type="number" min="0" step="0.1" value="${esc(!capacityKnown?capacity:'')}" placeholder="Bijv. 3.0"></div>
    </div>
  </div>`;
}
function dynamicSurveyFields(purpose,details={}){
  if(purpose==='nieuwe_installatie'){
    const systemType=details.systemType || 'single_split';
    const unitCount=surveyInstallUnitCount(systemType);
    const units=normalizedSurveyInstallUnits(details,unitCount);
    return `
      <div class="survey-section-head"><b>Gewenste installatie</b><span>Kies wat nodig is; Optero vult het aantal binnenunits automatisch in.</span></div>
      ${surveySelect('systemType','Type systeem',systemType,[['single_split','Single split · 1 binnenunit'],['multi_split','Multi split · 2 binnenunits'],['triple_split','Triple split · 3 binnenunits'],['warmtepomp','Warmtepomp'],['anders','Anders']])}
      <div class="survey-auto-units"><span>Aantal binnenunits</span><b>${unitCount}</b><input type="hidden" name="unitCount" value="${unitCount}"></div>
      ${surveyBrandModelFields(details)}
      <div class="survey-units-grid">${units.map((u,i)=>surveyInstallUnitCard(u,i)).join('')}</div>
      ${surveyField('installationNotes','Wensen / bijzonderheden',details.installationNotes||details.capacityNotes||'','Bijv. stille uitvoering, kleurwens of plaatsingsvoorkeur','textarea')}
      <div class="survey-section-head"><b>Montagesituatie</b><span>Voorbereiding voor de uiteindelijke installatie.</span></div>
      ${surveyField('indoorLocation','Gewenste plek binnenunit(s)',details.indoorLocation||'','Bijv. boven deur, vrije wand slaapkamer','textarea')}
      ${surveyField('outdoorLocation','Gewenste plek buitenunit',details.outdoorLocation||'','Plat dak, gevel, balkon…','textarea')}
      <div class="form-grid-2">${surveyField('estimatedLineLengthM','Geschatte leidinglengte (m)',details.estimatedLineLengthM||'','Bijv. 8','number')}${surveyField('heightAccess','Hoogte / bereikbaarheid',details.heightAccess||'','Begane grond, steiger nodig…')}</div>
      <div class="form-grid-2">${ynSelect('electricalPresent','Geschikte elektra aanwezig?',details.electricalPresent||'unknown')}${ynSelect('condensatePossible','Condensafvoer mogelijk?',details.condensatePossible||'unknown')}</div>
      ${surveyField('installationMaterials','Benodigde materialen / voorbereiding',details.installationMaterials||'','Dakdoorvoer, pomp, goot, beugels…','textarea')}`;
  }
  if(purpose==='vervanging') return `
    <div class="survey-section-head"><b>Bestaande installatie</b><span>Leg vast wat er nu aanwezig is en waarom het wordt vervangen.</span></div>
    <div class="form-grid-2">${surveyField('existingBrand','Merk',details.existingBrand||'','Bijv. Daikin')}${surveyField('existingModel','Model',details.existingModel||'','Type/model')}</div>
    <div class="form-grid-2">${surveyField('existingRefrigerant','Koudemiddel',details.existingRefrigerant||'','R32 / R410A')}${surveyField('existingAge','Leeftijd / bouwjaar',details.existingAge||'','Bijv. 2015')}</div>
    ${surveyField('replacementReason','Reden van vervanging',details.replacementReason||'','Defect, verouderd, te weinig vermogen…','textarea')}
    <div class="survey-section-head"><b>Nieuwe situatie</b><span>Wat moet ervoor terugkomen?</span></div>
    ${surveySelect('desiredSystemType','Gewenst type',details.desiredSystemType||'single_split',[['single_split','Single split airco'],['multi_split','Multi split airco'],['warmtepomp','Warmtepomp'],['anders','Anders']])}
    <div class="form-grid-2">${surveyField('desiredUnits','Aantal binnenunits',details.desiredUnits||1,'1','number')}${surveyField('brandPreference','Merkvoorkeur',details.brandPreference||'','Geen voorkeur')}</div>
    <div class="form-grid-2">${ynSelect('reusePipework','Bestaand leidingwerk hergebruiken?',details.reusePipework||'unknown')}${ynSelect('electricalPresent','Elektra geschikt?',details.electricalPresent||'unknown')}</div>
    ${surveyField('replacementNotes','Aanpassingen / bijzonderheden',details.replacementNotes||'','','textarea')}`;
  if(purpose==='uitbreiding') return `
    <div class="survey-section-head"><b>Uitbreiding bestaande installatie</b><span>Welke uitbreiding wil de klant?</span></div>
    <div class="form-grid-2">${surveyField('existingBrandModel','Bestaand merk / model',details.existingBrandModel||'','Merk + buitendeel')}${surveyField('additionalUnits','Extra binnenunits',details.additionalUnits||1,'1','number')}</div>
    ${surveyField('newRooms','Nieuwe ruimtes / zones',details.newRooms||'','','textarea')}
    ${surveyField('brandPreference','Merkvoorkeur',details.brandPreference||'','Zelfde merk indien mogelijk')}
    ${surveyField('compatibilityNotes','Compatibiliteit / technische beoordeling',details.compatibilityNotes||'','Kan bestaand buitendeel worden uitgebreid?','textarea')}
    <div class="form-grid-2">${surveyField('estimatedLineLengthM','Extra leidinglengte (m)',details.estimatedLineLengthM||'','','number')}${ynSelect('electricalPresent','Elektra toereikend?',details.electricalPresent||'unknown')}</div>`;
  if(purpose==='storing_onderzoek') return `
    <div class="survey-section-head"><b>Storing onderzoeken</b><span>Werk van klacht naar diagnose en vervolgactie.</span></div>
    ${surveyField('customerComplaint','Klacht van de klant',details.customerComplaint||'','Wat merkt de klant precies?','textarea')}
    <div class="form-grid-2">${surveyField('sinceWhen','Sinds wanneer?',details.sinceWhen||'','Vandaag / sinds vorige week…')}${surveyField('errorCode','Foutcode',details.errorCode||'','Bijv. U4')}</div>
    ${surveyField('existingBrandModel','Merk / model installatie',details.existingBrandModel||'','Merk + model indien bekend')}
    ${surveyField('stillWorking','Wat werkt nog wel / niet?',details.stillWorking||'','','textarea')}
    ${surveyField('measurements','Metingen / testresultaten',details.measurements||'','Druk, temperatuur, stroom, spanning…','textarea')}
    ${surveyField('suspectedCause','Vermoedelijke oorzaak',details.suspectedCause||'','','textarea')}
    ${surveyField('partsNeeded','Benodigde onderdelen / materialen',details.partsNeeded||'','','textarea')}
    ${surveySelect('followUp','Vervolgactie',details.followUp||'nader_onderzoek',[['nader_onderzoek','Nader onderzoek nodig'],['reparatie','Reparatie inplannen'],['onderdeel_bestellen','Onderdeel bestellen'],['offerte','Offerte maken'],['opgelost','Storing opgelost']])}`;
  if(purpose==='onderhoud') return `
    <div class="survey-section-head"><b>Onderhoudsopname</b><span>Beoordeel de huidige staat en het benodigde onderhoud.</span></div>
    ${surveyField('systemCondition','Staat van de installatie',details.systemCondition||'','','textarea')}
    ${surveyField('maintenanceNeeded','Benodigd onderhoud',details.maintenanceNeeded||'','','textarea')}
    ${surveyField('anomalies','Afwijkingen / aandachtspunten',details.anomalies||'','','textarea')}
    ${surveyField('partsNeeded','Onderdelen / materialen nodig',details.partsNeeded||'','','textarea')}`;
  return `
    <div class="survey-section-head"><b>Opnamegegevens</b><span>Leg alleen vast wat voor deze situatie relevant is.</span></div>
    ${surveyField('customSituation','Situatie / vraag',details.customSituation||'','','textarea')}
    ${surveyField('customRequirements','Benodigdheden / vervolg',details.customRequirements||'','','textarea')}`;
}
function collectDynamicSurveyDetails(form,purpose){
  if(purpose==='nieuwe_installatie'){
    const systemType=field(form,'systemType')?.value || 'single_split';
    const count=surveyInstallUnitCount(systemType);
    const brandChoice=field(form,'brandPreference')?.value || 'Daikin';
    const modelChoice=field(form,'modelPreference')?.value || '';
    const brand=brandChoice==='Anders...' ? (field(form,'brandOther')?.value.trim() || 'Anders') : brandChoice;
    const model=modelChoice==='Anders...' ? (field(form,'modelOther')?.value.trim() || 'Anders') : modelChoice;
    const units=Array.from({length:count},(_,i)=>{
      const n=i+1;
      const roomChoice=field(form,`unitRoom${n}`)?.value || '';
      const capacityChoice=field(form,`unitCapacity${n}`)?.value || '';
      return {
        room:roomChoice==='Anders...' ? (field(form,`unitRoomOther${n}`)?.value.trim() || 'Anders') : roomChoice,
        capacityKw:capacityChoice==='Anders...' ? (field(form,`unitCapacityOther${n}`)?.value.trim() || 'Anders') : capacityChoice
      };
    });
    return {
      systemType, unitCount:count, brandPreference:brand, modelPreference:model, units,
      installationNotes:field(form,'installationNotes')?.value.trim() || '',
      indoorLocation:field(form,'indoorLocation')?.value.trim() || '',
      outdoorLocation:field(form,'outdoorLocation')?.value.trim() || '',
      estimatedLineLengthM:field(form,'estimatedLineLengthM')?.value || '',
      heightAccess:field(form,'heightAccess')?.value.trim() || '',
      electricalPresent:field(form,'electricalPresent')?.value || 'unknown',
      condensatePossible:field(form,'condensatePossible')?.value || 'unknown',
      installationMaterials:field(form,'installationMaterials')?.value.trim() || ''
    };
  }
  const names={
    nieuwe_installatie:[],
    vervanging:['existingBrand','existingModel','existingRefrigerant','existingAge','replacementReason','desiredSystemType','desiredUnits','brandPreference','reusePipework','electricalPresent','replacementNotes'],
    uitbreiding:['existingBrandModel','additionalUnits','newRooms','brandPreference','compatibilityNotes','estimatedLineLengthM','electricalPresent'],
    storing_onderzoek:['customerComplaint','sinceWhen','errorCode','existingBrandModel','stillWorking','measurements','suspectedCause','partsNeeded','followUp'],
    onderhoud:['systemCondition','maintenanceNeeded','anomalies','partsNeeded'],
    anders:['customSituation','customRequirements']
  }[purpose]||[];
  return Object.fromEntries(names.map(name=>[name,field(form,name)?.value?.trim?.() ?? field(form,name)?.value ?? '']));
}
function detailValueLabel(key,value){
  const bool={yes:'Ja',no:'Nee',unknown:'Nog controleren'};
  if(bool[value]) return bool[value];
  const maps={systemType:{single_split:'Single split airco',multi_split:'Multi split airco',triple_split:'Triple split airco',warmtepomp:'Warmtepomp',air_air_heatpump:'Lucht-lucht warmtepomp',anders:'Anders'},desiredSystemType:{single_split:'Single split airco',multi_split:'Multi split airco',triple_split:'Triple split airco',warmtepomp:'Warmtepomp',anders:'Anders'},followUp:{nader_onderzoek:'Nader onderzoek',reparatie:'Reparatie inplannen',onderdeel_bestellen:'Onderdeel bestellen',offerte:'Offerte maken',opgelost:'Storing opgelost'}};
  return maps[key]?.[value] || value;
}
function renderSurveyDetails(purpose,details={}){
  if(purpose==='nieuwe_installatie'){
    const type=detailValueLabel('systemType',details.systemType||'single_split');
    const units=Array.isArray(details.units)?details.units:[];
    const main=[
      ['Type systeem',type],['Aantal binnenunits',details.unitCount||surveyInstallUnitCount(details.systemType)],
      ['Merk',details.brandPreference],['Model / serie',details.modelPreference]
    ].filter(([,v])=>String(v??'').trim()!=='').map(([l,v])=>`<div class="survey-detail-row"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`).join('');
    const unitRows=units.map((u,i)=>`<div class="survey-detail-row"><span>Binnenunit ${i+1}</span><b>${esc(u.room||'-')} · ${esc(u.capacityKw||'-')}${u.capacityKw && u.capacityKw!=='Anders'?' kW':''}</b></div>`).join('');
    const extraLabels={installationNotes:'Wensen / bijzonderheden',indoorLocation:'Plek binnenunit(s)',outdoorLocation:'Plek buitenunit',estimatedLineLengthM:'Geschatte leidinglengte (m)',heightAccess:'Hoogte / bereikbaarheid',electricalPresent:'Elektra aanwezig / geschikt',condensatePossible:'Condensafvoer mogelijk',installationMaterials:'Materialen / voorbereiding'};
    const extras=Object.entries(extraLabels).filter(([k])=>String(details[k]??'').trim()!=='').map(([k,l])=>`<div class="survey-detail-row"><span>${esc(l)}</span><b>${esc(detailValueLabel(k,String(details[k])))}</b></div>`).join('');
    return `<div class="survey-detail-list">${main}${unitRows}${extras}</div>`;
  }
  const labels={systemType:'Type systeem',indoorUnits:'Aantal binnenunits',brandPreference:'Merkvoorkeur',rooms:'Ruimtes / zones',capacityNotes:'Vermogen / bijzonderheden',indoorLocation:'Plek binnenunit(s)',outdoorLocation:'Plek buitenunit',estimatedLineLengthM:'Geschatte leidinglengte (m)',heightAccess:'Hoogte / bereikbaarheid',electricalPresent:'Elektra aanwezig / geschikt',condensatePossible:'Condensafvoer mogelijk',installationMaterials:'Materialen / voorbereiding',existingBrand:'Bestaand merk',existingModel:'Bestaand model',existingRefrigerant:'Koudemiddel',existingAge:'Leeftijd / bouwjaar',replacementReason:'Reden vervanging',desiredSystemType:'Gewenst type',desiredUnits:'Aantal binnenunits',reusePipework:'Leidingwerk hergebruiken',replacementNotes:'Aanpassingen / bijzonderheden',existingBrandModel:'Bestaand merk / model',additionalUnits:'Extra binnenunits',newRooms:'Nieuwe ruimtes',compatibilityNotes:'Compatibiliteit',customerComplaint:'Klacht klant',sinceWhen:'Sinds wanneer',errorCode:'Foutcode',stillWorking:'Werkt wel / niet',measurements:'Metingen',suspectedCause:'Vermoedelijke oorzaak',partsNeeded:'Onderdelen / materialen',followUp:'Vervolgactie',systemCondition:'Staat installatie',maintenanceNeeded:'Benodigd onderhoud',anomalies:'Aandachtspunten',customSituation:'Situatie / vraag',customRequirements:'Benodigdheden / vervolg'};
  const rows=Object.entries(details||{}).filter(([,v])=>String(v??'').trim()!=='').map(([k,v])=>`<div class="survey-detail-row"><span>${esc(labels[k]||k)}</span><b>${esc(detailValueLabel(k,String(v)))}</b></div>`).join('');
  return rows?`<div class="survey-detail-list">${rows}</div>`:'';
}

async function surveyDetailPage(appointmentId){
  const a=appointments().find(x=>x.id===appointmentId);
  if(!a || a.type!=='opname') return nav('agenda');
  app.innerHTML='<section class="screen"><article class="card"><p class="title">Opnamedossier laden…</p></article></section>';
  try{
    const [survey,photos]=await Promise.all([getSurvey(appointmentId),listSurveyPhotos(appointmentId)]);
    const c=customer(a.customerId)||{};
    app.innerHTML=`<section class="screen survey-detail-screen">
      <article class="card"><div class="row between"><div><p class="eyebrow">OPNAMEDOSSIER</p><h2>${esc(c.name||'Klant')}</h2><p class="muted">${fmt(a.date)} · ${a.time||'Tijd onbekend'} · ${esc(fullAddress(c))}</p></div><span class="pill">${surveyStatusLabel(survey?.status)}</span></div></article>
      <article class="card"><div class="row between"><div><p class="eyebrow">TYPE OPNAME</p><p class="title">${surveyPurposeLabel(survey?.purpose)}</p></div></div>${renderSurveyDetails(survey?.purpose,survey?.details||{})}${survey?.scope?`<div class="notice survey-note"><b>Klantwens / omschrijving</b><br>${esc(survey.scope)}</div>`:''}${survey?.findings?`<div class="notice survey-note"><b>Constateringen</b><br>${esc(survey.findings)}</div>`:''}${survey?.technical_notes?`<div class="notice survey-note"><b>Technische notities</b><br>${esc(survey.technical_notes)}</div>`:''}</article>
      <article class="card"><div class="row between"><p class="title">Foto's</p><span class="muted">${photos.length}</span></div><div class="survey-photo-grid">${photos.map(p=>`<a href="${p.url}" target="_blank"><img src="${p.url}" alt="Opnamefoto"></a>`).join('') || '<p class="muted">Nog geen foto’s toegevoegd.</p>'}</div></article>
      <button class="primary" onclick="nav('surveyEdit',{appointmentId:'${appointmentId}'})">${survey?'✏️ Opname bijwerken':'📋 Opname invullen'}</button>
    </section>`;
  }catch(error){ app.innerHTML=`<section class="screen"><article class="card"><p class="title">Opnamedossier kan niet worden geladen</p><p class="muted">${esc(error?.message||'Onbekende fout')}</p></article></section>`; }
}

async function surveyEditPage(appointmentId){
  const a=appointments().find(x=>x.id===appointmentId);
  if(!a || a.type!=='opname') return nav('agenda');
  app.innerHTML='<section class="screen"><article class="card"><p class="title">Opname laden…</p></article></section>';
  try{
    const [survey,photos]=await Promise.all([getSurvey(appointmentId),listSurveyPhotos(appointmentId)]);
    const value=survey||{purpose:'nieuwe_installatie',scope:'',findings:'',technical_notes:'',status:'planned',details:{}};
    app.innerHTML=`<section class="screen survey-edit-screen"><form id="surveyForm" class="form">
      <article class="card"><p class="eyebrow">OPNAME</p><h2>Situatie vastleggen</h2><p class="muted">Kies eerst het soort opname. Optero toont daarna alleen de vragen die bij deze situatie horen.</p>
        <div class="field"><label>Waarvoor is de opname?</label><select name="purpose">${[['nieuwe_installatie','Nieuwe installatie'],['vervanging','Vervanging'],['uitbreiding','Uitbreiding'],['storing_onderzoek','Storing / onderzoek'],['onderhoud','Onderhoud'],['anders','Anders']].map(([v,l])=>`<option value="${v}" ${value.purpose===v?'selected':''}>${l}</option>`).join('')}</select></div>
      </article>
      <article class="card survey-dynamic-card"><div id="surveyDynamicFields">${dynamicSurveyFields(value.purpose,value.details||{})}</div></article>
      <article class="card"><p class="title">Afronding opname</p>
        <div class="field"><label>Klantwens / algemene omschrijving</label><textarea name="scope" rows="3" placeholder="Wat wil de klant bereiken?">${esc(value.scope||'')}</textarea></div>
        <div class="field"><label>Constateringen medewerker</label><textarea name="findings" rows="4" placeholder="Wat is ter plaatse vastgesteld?">${esc(value.findings||'')}</textarea></div>
        <div class="field"><label>Overige technische notities</label><textarea name="technicalNotes" rows="3" placeholder="Alleen aanvullende informatie die nog niet hierboven staat">${esc(value.technical_notes||'')}</textarea></div>
        <div class="field"><label>Status</label><select name="status"><option value="planned" ${value.status==='planned'?'selected':''}>Gepland</option><option value="in_progress" ${value.status==='in_progress'?'selected':''}>Bezig</option><option value="completed" ${value.status==='completed'?'selected':''}>Afgerond</option></select></div>
      </article>
      <article class="card"><p class="title">Foto's toevoegen</p><p class="muted">Maak foto's van de situatie, typeplaatjes, leidingroute, meterkast en andere relevante details. Maximaal 8 MB per foto.</p><input id="surveyPhotos" type="file" accept="image/*" capture="environment" multiple><div class="survey-photo-grid" style="margin-top:12px">${photos.map(p=>`<div class="survey-photo-item"><a href="${p.url}" target="_blank"><img src="${p.url}" alt="Opnamefoto"></a><button type="button" class="smallbtn" data-photo-id="${p.id}" data-photo-path="${p.storage_path}">Verwijder</button></div>`).join('')}</div></article>
      <button class="primary" type="submit">Opname opslaan</button>
    </form></section>`;
    document.querySelectorAll('[data-photo-id]').forEach(btn=>btn.onclick=async()=>{ if(!confirm('Foto verwijderen?')) return; try{ await deleteSurveyPhoto(btn.dataset.photoId,btn.dataset.photoPath); await surveyEditPage(appointmentId); }catch(e){alert(e.message||'Foto verwijderen mislukt.');} });
    const f=$('#surveyForm');
    const purposeField=field(f,'purpose');
    const wireSurveyDynamic=()=>{
      const box=$('#surveyDynamicFields');
      if(!box) return;
      const rerender=()=>{ const details=collectDynamicSurveyDetails(f,purposeField.value); box.innerHTML=dynamicSurveyFields(purposeField.value,details); wireSurveyDynamic(); };
      const systemType=field(f,'systemType'); if(systemType) systemType.onchange=rerender;
      const brand=field(f,'brandPreference'); if(brand) brand.onchange=rerender;
      const model=field(f,'modelPreference'); if(model) model.onchange=()=>{ box.querySelector('.survey-model-other')?.classList.toggle('show',model.value==='Anders...'); };
      box.querySelectorAll('select[name^="unitRoom"]').forEach(sel=>sel.onchange=()=>sel.closest('.survey-unit-card')?.querySelector('.survey-room-other')?.classList.toggle('show',sel.value==='Anders...'));
      box.querySelectorAll('select[name^="unitCapacity"]').forEach(sel=>sel.onchange=()=>sel.closest('.survey-unit-card')?.querySelector('.survey-capacity-other')?.classList.toggle('show',sel.value==='Anders...'));
    };
    purposeField.onchange=()=>{ $('#surveyDynamicFields').innerHTML=dynamicSurveyFields(purposeField.value,{}); wireSurveyDynamic(); };
    wireSurveyDynamic();
    f.onsubmit=async e=>{ e.preventDefault(); const submit=f.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent='Opslaan…'; try{ const purpose=field(f,'purpose').value; await saveSurvey(appointmentId,{purpose,scope:field(f,'scope').value.trim(),findings:field(f,'findings').value.trim(),technicalNotes:field(f,'technicalNotes').value.trim(),status:field(f,'status').value,details:collectDynamicSurveyDetails(f,purpose)}); const files=$('#surveyPhotos')?.files; if(files?.length) await uploadSurveyPhotos(appointmentId,files); nav('surveyDetail',{appointmentId}); }catch(error){ alert(`Opname opslaan lukt niet.\n\n${error?.message||'Onbekende fout'}`); submit.disabled=false; submit.textContent='Opname opslaan'; } };
  }catch(error){ app.innerHTML=`<section class="screen"><article class="card"><p class="title">Opname kan niet worden geopend</p><p class="muted">${esc(error?.message||'Onbekende fout')}</p></article></section>`; }
}

async function deleteGenericAppointment(id){
  if(!confirm('Afspraak verwijderen?')) return;
  try{ await deleteCloudAppointments([id]); }
  catch(error){ alert(`Verwijderen is niet gelukt. De afspraak blijft bestaan.

${error?.message||'Onbekende fout'}`); return; }
  state.appointments=appointments().filter(a=>a.id!==id);
  save();
  nav('agenda');
}

async function planAppointment(systemId){
  const s=systemById(systemId);
  if(!s) return nav('agenda');
  if(s.serviceStatus==='declined'){
    alert('Deze klant wil geen onderhoud. Zet de onderhoudsstatus eerst terug op actief.');
    return nav('detail',{customerId:s.customerId,back:'customers'});
  }
  return nav('newAppointment',{
    systemId:s.id,
    customerId:s.customerId,
    type:'onderhoud',
    date:nextDate(s),
    scheduleSource:'maintenance',
    back:route.back || 'detail'
  });
}

async function deleteAppointment(id, systemId){
  if(!confirm('Afspraak verwijderen?')) return;
  try{ await deleteCloudAppointments([id]); }
  catch(error){ alert(`Verwijderen is niet gelukt. De afspraak blijft bestaan.

${error?.message||'Onbekende fout'}`); return; }
  state.appointments = appointments().filter(a=>a.id!==id);
  const s=systemById(systemId);
  if(s && !appointmentForSystem(s.id)) s.contactStatus='contacted';
  save();
  nav('detail',{customerId:s?s.customerId:null,back:'customers'});
}

async function markDone(id){
  const s=systemById(id);
  if(!s) return;
  const performed=prompt('Op welke datum is het onderhoud uitgevoerd?',todayKey());
  if(performed===null) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(performed)){ alert('Vul een geldige datum in als JJJJ-MM-DD.'); return; }
  const completedAppointmentIds=appointments().filter(a=>a.systemId===id).map(a=>a.id);
  try{ await deleteCloudAppointments(completedAppointmentIds); }
  catch(error){ alert(`Onderhoud kan nog niet worden afgerond omdat de gekoppelde afspraak niet veilig uit de cloud kon worden verwijderd.\n\n${error?.message||'Onbekende fout'}`); return; }
  s.lastService=performed;
  s.doneCount=(s.doneCount||0)+1;
  s.contactStatus='not_contacted';
  s.lastContactAt=null;
  state.appointments = appointments().filter(a=>a.systemId!==id);
  save();
  alert(`Onderhoud afgerond. Volgend onderhoud: ${fmt(nextDate(s))}.`);
  render();
}

async function deleteSystem(id){
  if(!confirm('Systeem verwijderen?')) return;
  try{ await deleteCloudInstallation(id); }
  catch(error){ alert(`Verwijderen is niet gelukt. De installatie blijft bestaan.

${error?.message||'Onbekende fout'}`); return; }
  state.systems=state.systems.filter(s=>s.id!==id);
  state.appointments=appointments().filter(a=>a.systemId!==id);
  save();
  render();
}

function settings(){
  if(currentRole !== 'owner') return nav(defaultRouteForRole());
  const lastUpdate=state.updatedAt ? new Date(state.updatedAt).toLocaleString('nl-NL') : 'Nog niet opgeslagen';
  const account=getAccountContext();
  const recoveryBackups=window.maintenanceCloud?.getRecoveryBackups?.() || [];
  app.innerHTML = `<section class="screen settings-screen">
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
        <div class="settings-subsection">
          <div class="settings-subsection-heading">
            <h3>Onderhoudsplanning</h3>
            <p>Deze waarden worden automatisch gebruikt bij nieuwe installaties.</p>
          </div>
          <div class="settings-option-grid">
            <div class="field setting-tile">
              <div class="setting-label-row">
                <label for="maintenancePrice">Onderhoudsprijs</label>
                <span>Per beurt</span>
              </div>
              <div class="input-affix">
                <span aria-hidden="true">€</span>
                <input id="maintenancePrice" name="maintenancePrice" type="number" min="0" step="1" inputmode="decimal" value="${Number(state.settings.maintenancePrice)||0}">
              </div>
            </div>
            <div class="field setting-tile">
              <div class="setting-label-row">
                <label for="leadDays">Actielijst</label>
                <span>Vooraf tonen</span>
              </div>
              <select id="leadDays" name="leadDays">
                ${[30,45,60,90].map(v=>`<option value="${v}" ${Number(state.settings.leadDays)===v?'selected':''}>${v} dagen vooraf</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field setting-tile setting-tile-wide">
            <div class="setting-label-row">
              <label for="defaultInterval">Onderhoudsinterval</label>
              <span>Na afronding</span>
            </div>
            <select id="defaultInterval" name="defaultInterval">${[6,12,18,24].map(v=>`<option value="${v}" ${Number(state.settings.defaultInterval)===v?'selected':''}>Elke ${v} maanden</option>`).join('')}</select>
          </div>
        </div>
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

    ${currentRole === 'owner' ? `<article class="card">
      <div class="row between">
        <div><h2>Medewerkers</h2><p class="muted">Nodig planners en monteurs uit voor hun eigen mobiele account.</p></div>
        <button class="smallbtn" type="button" onclick="nav('team')">Beheren</button>
      </div>
    </article>` : ''}

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


async function teamPage(){
  if(currentRole !== 'owner') return nav(defaultRouteForRole());
  app.innerHTML = `<section class="screen"><article class="card"><h2>Medewerkers laden…</h2><p class="muted">Even geduld.</p></article></section>`;
  try{
    const [members, invitations] = await Promise.all([listTeamMembers(), listPendingInvitations()]);
    app.innerHTML = `<section class="screen team-screen">
      <article class="card">
        <div class="row between"><div><h2>Team</h2><p class="muted">${members.length} van maximaal 5 gebruikers actief.</p></div><span class="status-badge active">Team</span></div>
        <div class="team-list">${members.map(m=>`<div class="team-member-row"><div class="team-avatar">${esc((m.display_name||m.email||'?').slice(0,1).toUpperCase())}</div><div class="team-member-copy"><b>${esc(m.display_name||m.email)}</b><span>${esc(m.email||'')}</span></div><span class="status-badge ${m.status==='active'?'active':'neutral'}">${({owner:'Eigenaar',planner:'Planner',technician:'Monteur'})[m.role]||m.role}</span></div>`).join('')}</div>
      </article>
      <article class="card form">
        <h2>Medewerker uitnodigen</h2>
        <p class="muted">De medewerker ontvangt een e-mail en logt daarna in op dezelfde app.</p>
        <form id="inviteMemberForm" class="form">
          <div class="field"><label>E-mailadres</label><input name="email" type="email" required placeholder="monteur@bedrijf.nl"></div>
          <div class="field"><label>Rol</label><select name="role"><option value="technician">Monteur</option><option value="planner">Planner</option></select></div>
          <button class="primary" type="submit" ${members.length>=5?'disabled':''}>Uitnodiging versturen</button>
        </form>
      </article>
      ${invitations.length?`<article class="card"><h2>Openstaande uitnodigingen</h2><div class="team-list">${invitations.map(i=>`<div class="team-member-row"><div class="team-avatar">✉</div><div class="team-member-copy"><b>${esc(i.email)}</b><span>${i.delivery_status==='mail_failed'?'E-mail niet verzonden':i.delivery_status==='sent'?'E-mail verzonden':'Wordt verwerkt'} · verloopt ${new Date(i.expires_at).toLocaleDateString('nl-NL')}</span>${i.delivery_status==='mail_failed'&&i.last_email_error?`<small>${esc(i.last_email_error)}</small>`:''}</div><div class="team-invite-actions"><span class="status-badge paused">${i.role==='planner'?'Planner':'Monteur'}</span><button class="smallbtn" type="button" onclick="resendTeamInvitation('${esc(i.email)}','${esc(i.role)}')">Opnieuw sturen</button></div></div>`).join('')}</div></article>`:''}
    </section>`;
    const form=$('#inviteMemberForm');
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Versturen…';
      try{ await inviteTeamMember(field(form,'email').value,field(form,'role').value); alert('Uitnodiging is verstuurd.'); teamPage(); }
      catch(error){ alert(error.message||'Uitnodigen mislukt.'); btn.disabled=false; btn.textContent='Uitnodiging versturen'; }
    };
  }catch(error){ app.innerHTML=`<section class="screen"><article class="card"><h2>Medewerkers konden niet laden</h2><p>${esc(error.message||error)}</p><p class="helper">Voer eerst supabase/team_schema_v090.sql uit en voeg SUPABASE_SERVICE_ROLE_KEY toe in Vercel.</p></article></section>`; }
}

async function resendTeamInvitation(email, role){
  if(currentRole !== 'owner') return;
  try{
    await inviteTeamMember(email, role);
    alert('Uitnodiging is opnieuw verstuurd.');
    await teamPage();
  }catch(error){
    alert(error.message || 'Opnieuw versturen mislukt.');
  }
}

function technicianCalendarGrid(){
  const y=calendarMonth.getFullYear();
  const m=calendarMonth.getMonth();
  const first=new Date(y,m,1);
  const daysInMonth=new Date(y,m+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const weekdays=['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const eventDates=new Set(appointments().map(a=>a.date));
  let cells='';
  for(let i=0;i<offset;i++) cells += '<button class="calendar-day blank" disabled></button>';
  for(let day=1;day<=daysInMonth;day++){
    const key=toDateKey(new Date(y,m,day));
    const has=eventDates.has(key);
    const active=selectedAgendaDate===key;
    const today=todayKey()===key;
    cells += `<button class="calendar-day ${has?'has-event':''} ${active?'active':''} ${today?'today':''}" onclick="selectTechnicianDate('${key}')"><span>${day}</span>${has?'<i></i>':''}</button>`;
  }
  return `<div class="calendar-weekdays">${weekdays.map(w=>`<span>${w}</span>`).join('')}</div><div class="calendar-grid">${cells}</div>`;
}

function selectTechnicianDate(key){
  selectedAgendaDate=key;
  myDayPage();
}

function technicianChangeMonth(dir){
  calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+dir,1);
  const today=new Date();
  const isCurrentMonth=calendarMonth.getFullYear()===today.getFullYear() && calendarMonth.getMonth()===today.getMonth();
  selectedAgendaDate=isCurrentMonth ? todayKey() : toDateKey(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1));
  myDayPage();
}

function technicianGoToday(){
  calendarMonth=new Date();
  selectedAgendaDate=todayKey();
  myDayPage();
}

function myDayPage(){
  const selected=selectedAgendaDate || todayKey();
  const items=appointmentsOnDate(selected);
  const isToday=selected===todayKey();
  app.innerHTML=`<section class="screen my-day-screen">
    <article class="card calendar-card technician-calendar">
      <div class="calendar-head">
        <button class="smallbtn" aria-label="Vorige maand" onclick="technicianChangeMonth(-1)">‹</button>
        <strong>${monthLabel(calendarMonth)}</strong>
        <button class="smallbtn" aria-label="Volgende maand" onclick="technicianChangeMonth(1)">›</button>
      </div>
      ${technicianCalendarGrid()}
      ${!isToday?'<button class="smallbtn wide technician-today-btn" onclick="technicianGoToday()">Naar vandaag</button>':''}
    </article>
    <div class="technician-day-heading"><div><p class="eyebrow">${isToday?'Vandaag':'Mijn planning'}</p><h2>${fmt(selected)}</h2></div><span>${items.length} ${items.length===1?'opdracht':'opdrachten'}</span></div>
    ${items.length?items.map(appointmentCard).join(''):`<article class="card empty">Geen opdrachten gepland op ${isToday?'vandaag':fmt(selected)}.</article>`}
  </section>`;
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

    <article class="card cloud-account-card">
      <div class="cloud-account-icon" aria-hidden="true">✓</div>
      <div>
        <p class="title">Cloudopslag actief</p>
        <p class="muted">${currentRole === 'technician' ? 'Je medewerkersaccount is veilig gekoppeld aan de bedrijfsomgeving. Alleen gegevens waarvoor je bevoegd bent worden in Optero getoond.' : 'Je account en bedrijfsgegevens worden veilig online opgeslagen en automatisch tussen je apparaten gesynchroniseerd.'}</p>
      </div>
    </article>

    <article class="card">
      ${currentRole === 'owner' ? `<button class="secondary full-width" type="button" onclick="nav('settings')">Bedrijfsinstellingen wijzigen</button>` : ''}
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
  downloadBlob(JSON.stringify({app:'Optero',version:APP_VERSION,exportedAt:new Date().toISOString(),data:state},null,2),`optero-backup-${fileDate()}.json`,'application/json');
}
async function importBackupFile(file){
  if(!file) return;
  try{
    const parsed=JSON.parse(await file.text());
    const incoming=parsed.data||parsed;
    if(!Array.isArray(incoming.customers)||!Array.isArray(incoming.systems)) throw new Error('Geen geldige Optero-back-up');
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
  downloadBlob('\ufeff'+csv,'optero-import-voorbeeld.csv','text/csv;charset=utf-8');
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
  downloadBlob('\ufeff'+csv,`optero-overzicht-${fileDate()}.csv`,'text/csv;charset=utf-8');
}

async function enableNotifications(){
  if(!('Notification' in window)){alert('Deze browser ondersteunt geen meldingen.');return;}
  const permission=await Notification.requestPermission();
  if(permission==='granted'){
    new Notification('Optero',{body:`${actionSystems().length} onderhoudsmomenten vragen aandacht.`,icon:'/icon-192.png'});
  }else alert('Meldingen zijn niet toegestaan in de browserinstellingen.');
}
function checkDueNotification(){
  if('Notification' in window && Notification.permission==='granted'){
    const due=actionSystems().filter(s=>daysUntil(nextDate(s))<=0).length;
    const last=localRepository.getItem(`${KEY}_last_notification`);
    if(due>0 && last!==todayKey()){
      new Notification('Optero',{body:`${due} onderhoudsmoment${due===1?'':'en'} zijn nu of eerder gepland.`,icon:'/icon-192.png'});
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
  try{ await clearCloudOperationalData(); }
  catch(error){ alert(`Wissen is gestopt omdat de cloudopslag niet veilig kon worden bijgewerkt. Er is lokaal niets verwijderd.\n\n${error?.message||'Onbekende fout'}`); return; }
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
  alert('Alle klanten, installaties en afspraken zijn veilig uit de cloud verwijderd.');
  nav('dashboard');
}


async function deleteCustomer(id){
  if(!confirm('Klant verwijderen? Alle gekoppelde systemen en afspraken worden ook verwijderd.')) return;
  try{ await deleteCloudCustomer(id); }
  catch(error){ alert(`Verwijderen is niet gelukt. De klant en gekoppelde gegevens blijven bestaan.

${error?.message||'Onbekende fout'}`); return; }
  const systemIds = state.systems.filter(s=>s.customerId===id).map(s=>s.id);
  state.systems = state.systems.filter(s=>s.customerId!==id);
  state.appointments = appointments().filter(a=>a.customerId!==id && !systemIds.includes(a.systemId));
  state.customers = state.customers.filter(c=>c.id!==id);
  save();
  nav('customers');
}

const exposedApi = { nav, installApp };
if(currentRole === 'owner' || currentRole === 'planner'){
  Object.assign(exposedApi,{changeMonth,selectAgendaDate,goToday,markDone,deleteSystem,deleteCustomer,
    deleteAppointment,deleteGenericAppointment,markContacted,setContactStatus,downloadImportTemplate,
    importSpreadsheetFile,exportBackup,importBackupFile,exportOverviewExcel,enableNotifications});
}
if(currentRole === 'owner') Object.assign(exposedApi,{resetDemo,resendTeamInvitation});
if(currentRole === 'technician') Object.assign(exposedApi,{selectTechnicianDate,technicianChangeMonth,technicianGoToday});
Object.assign(window,exposedApi);

if(notifyBtn) notifyBtn.onclick=()=>nav('notifications');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;});
window.addEventListener('optero-technician-data-updated',()=>{
  if(currentRole==='technician'){ state=load(); render(); }
});
render();
if(currentRole !== 'technician') setTimeout(checkDueNotification,800);
