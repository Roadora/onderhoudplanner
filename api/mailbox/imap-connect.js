import { authenticatedContext, sendError } from '../_lib/optera-auth.js';
import { encryptSecret } from '../_lib/mailbox-crypto.js';
import { verifyImapConnection } from '../_lib/imap-client.js';

function clean(value,max=240){return String(value||'').trim().slice(0,max);}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Alleen POST toegestaan.'});
  try{
    const {user,membership,admin}=await authenticatedContext(req,['owner']);
    const host=clean(req.body?.host,240);
    const port=Math.max(1,Math.min(65535,Number(req.body?.port)||993));
    const username=clean(req.body?.username,240);
    const password=String(req.body?.password||'');
    const mailboxEmail=clean(req.body?.mailboxEmail||username,240).toLowerCase();
    if(!host||!username||!password||!mailboxEmail) return res.status(400).json({error:'Vul host, gebruikersnaam, wachtwoord en mailboxadres in.'});
    await verifyImapConnection({host,port,username,password});
    const {data,error}=await admin.from('mailbox_connections').upsert({
      organization_id:membership.organization_id,
      provider:'imap',mailbox_email:mailboxEmail,display_name:'',status:'connected',
      refresh_token_enc:encryptSecret(password),imap_host:host,imap_port:port,imap_username:username,
      scopes:[],connected_by:user.id,last_sync_error:null,updated_at:new Date().toISOString()
    },{onConflict:'organization_id,provider,mailbox_email'}).select('id,mailbox_email').single();
    if(error) throw error;
    return res.status(200).json({ok:true,id:data.id,mailboxEmail:data.mailbox_email});
  }catch(error){return sendError(res,error,'IMAP-mailbox koppelen mislukt.');}
}
