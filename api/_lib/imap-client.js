import tls from 'node:tls';

function quote(value=''){
  return `"${String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;
}

function monthName(index){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][index]; }
function imapSinceDate(days=30){
  const date=new Date(Date.now()-days*86400000);
  return `${date.getUTCDate()}-${monthName(date.getUTCMonth())}-${date.getUTCFullYear()}`;
}

function decodeQuotedPrintable(value=''){
  return String(value).replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function decodeMimeWords(value=''){
  return String(value).replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi,(_,charset,mode,data)=>{
    try{
      let buffer;
      if(mode.toLowerCase()==='b') buffer=Buffer.from(data,'base64');
      else buffer=Buffer.from(decodeQuotedPrintable(data.replaceAll('_',' ')),'binary');
      return buffer.toString(/iso-8859-1|latin1/i.test(charset)?'latin1':'utf8');
    }catch{return data;}
  });
}
function unfoldHeaders(text=''){ return String(text).replace(/\r?\n[ \t]+/g,' '); }
function headerValue(raw,name){
  const headers=unfoldHeaders(raw.split(/\r?\n\r?\n/,1)[0]||'');
  const match=new RegExp(`^${name}:\\s*(.*)$`,'im').exec(headers);
  return decodeMimeWords(match?.[1]?.trim()||'');
}
function parseFrom(value=''){
  const text=decodeMimeWords(value).trim();
  const match=/^(.*)<([^>]+)>$/.exec(text);
  if(!match) return {name:'',email:text.replace(/^"|"$/g,'').trim().toLowerCase()};
  return {name:match[1].replace(/^"|"$/g,'').trim(),email:match[2].trim().toLowerCase()};
}
function bodySnippet(raw=''){
  const parts=String(raw).split(/\r?\n\r?\n/);
  const headers=parts.shift()||'';
  let body=parts.join('\n\n').slice(0,5000);
  const encoding=headerValue(`${headers}\r\n\r\n`,'Content-Transfer-Encoding').toLowerCase();
  if(encoding==='base64'){
    try{ body=Buffer.from(body.replace(/\s+/g,''),'base64').toString('utf8'); }catch{}
  }else if(encoding==='quoted-printable') body=decodeQuotedPrintable(body);
  return body
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/^--[-=_A-Za-z0-9.]+$/gm,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/\s+/g,' ').trim().slice(0,2500);
}
function extractLiteral(response=''){
  const match=/\{\d+\}\r?\n([\s\S]*)\r?\n\)\r?\nA\d+\s+(?:OK|NO|BAD)/i.exec(response);
  return match?.[1]||response;
}

class SimpleImapClient{
  constructor({host,port=993,username,password}){
    this.options={host,port:Number(port)||993,username,password};
    this.socket=null; this.counter=0; this.pending=null; this.greeting=''; this.connectReject=null; this.lastError=null;
  }
  connect(){
    return new Promise((resolve,reject)=>{
      const socket=tls.connect({host:this.options.host,port:this.options.port,servername:this.options.host,rejectUnauthorized:true});
      this.socket=socket; this.connectReject=reject;
      const timer=setTimeout(()=>{
        this.connectReject=null; socket.destroy(); reject(new Error('IMAP-verbinding duurt te lang.'));
      },12000);
      socket.on('error',(error)=>this.onError(error));
      socket.on('data',(chunk)=>this.onData(chunk));
      const wait=()=>{
        if(this.lastError){ clearTimeout(timer); this.connectReject=null; return; }
        if(/^\*\s+(?:OK|PREAUTH)/im.test(this.greeting)){
          clearTimeout(timer); this.connectReject=null; resolve();
        }else if(!socket.destroyed) setTimeout(wait,25);
      };
      wait();
    });
  }
  onError(error){
    this.lastError=error;
    if(this.pending){
      const pending=this.pending; this.pending=null; pending.reject(error); return;
    }
    if(this.connectReject){ const reject=this.connectReject; this.connectReject=null; reject(error); }
  }
  onData(chunk){
    const text=chunk.toString('utf8');
    if(!this.pending){ this.greeting+=text; return; }
    this.pending.buffer+=text;
    const pattern=new RegExp(`(?:^|\\r?\\n)${this.pending.tag}\\s+(OK|NO|BAD)\\b[^\\r\\n]*`,'i');
    const match=pattern.exec(this.pending.buffer);
    if(match){
      const pending=this.pending; this.pending=null;
      if(match[1].toUpperCase()==='OK') pending.resolve(pending.buffer);
      else pending.reject(new Error(`IMAP-server weigerde opdracht: ${match[0].trim()}`));
    }
  }
  command(command){
    if(this.pending) return Promise.reject(new Error('IMAP-opdrachten moeten na elkaar worden uitgevoerd.'));
    if(!this.socket || this.socket.destroyed) return Promise.reject(this.lastError || new Error('IMAP-verbinding is gesloten.'));
    const tag=`A${String(++this.counter).padStart(4,'0')}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{ if(this.pending?.tag===tag) this.pending=null; reject(new Error('IMAP-opdracht duurt te lang.')); },15000);
      this.pending={tag,buffer:'',resolve:(value)=>{clearTimeout(timer);resolve(value);},reject:(error)=>{clearTimeout(timer);reject(error);}};
      this.socket.write(`${tag} ${command}\r\n`);
    });
  }
  async login(){ await this.command(`LOGIN ${quote(this.options.username)} ${quote(this.options.password)}`); }
  async selectInbox(){ await this.command('SELECT "INBOX"'); }
  async logout(){ try{if(this.socket&&!this.socket.destroyed) await this.command('LOGOUT');}catch{} this.socket?.end(); }
}

export async function verifyImapConnection(options){
  const client=new SimpleImapClient(options);
  try{ await client.connect(); await client.login(); await client.selectInbox(); return true; }
  finally{ await client.logout(); }
}

export async function fetchRecentImapMessages(options,{limit=40,days=30}={}){
  const client=new SimpleImapClient(options);
  try{
    await client.connect(); await client.login(); await client.selectInbox();
    const search=await client.command(`UID SEARCH SINCE ${imapSinceDate(days)}`);
    const match=/\*\s+SEARCH\s+([^\r\n]*)/i.exec(search);
    const uids=(match?.[1]||'').trim().split(/\s+/).filter(v=>/^\d+$/.test(v)).slice(-limit);
    const messages=[];
    for(const uid of uids.reverse()){
      const response=await client.command(`UID FETCH ${uid} (BODY.PEEK[]<0.4096>)`);
      const raw=extractLiteral(response);
      const from=parseFrom(headerValue(raw,'From'));
      const dateText=headerValue(raw,'Date');
      const received=new Date(dateText);
      messages.push({
        id:headerValue(raw,'Message-ID')||`imap:${options.username}:${uid}`,
        providerId:uid,
        subject:headerValue(raw,'Subject')||'',
        fromName:from.name,
        fromEmail:from.email,
        receivedAt:Number.isNaN(received.getTime())?new Date().toISOString():received.toISOString(),
        snippet:bodySnippet(raw)
      });
    }
    return messages;
  }finally{ await client.logout(); }
}
