const MICROSOFT_SCOPES = ['openid','profile','email','offline_access','User.Read','Mail.Read'];
const GOOGLE_SCOPES = ['openid','email','profile','https://www.googleapis.com/auth/gmail.readonly'];

export function oauthRedirectUri(req) {
  const configured = String(process.env.VITE_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return `${configured}/api/mailbox/oauth-callback`;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/mailbox/oauth-callback`;
}

export function oauthAuthorizationUrl(provider, state, redirectUri) {
  if (provider === 'microsoft') {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) throw new Error('MICROSOFT_CLIENT_ID ontbreekt in Vercel.');
    const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID ontbreekt in Vercel.');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    return url.toString();
  }
  throw new Error('Onbekende mailboxprovider.');
}

async function formPost(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || 'OAuth-token kon niet worden opgehaald.');
  return data;
}

export async function exchangeAuthorizationCode(provider, code, redirectUri) {
  if (provider === 'microsoft') {
    return formPost('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: MICROSOFT_SCOPES.join(' ')
    });
  }
  if (provider === 'google') {
    return formPost('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });
  }
  throw new Error('Onbekende mailboxprovider.');
}

export async function refreshAccessToken(provider, refreshToken) {
  if (provider === 'microsoft') {
    return formPost('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' ')
    });
  }
  if (provider === 'google') {
    return formPost('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
  }
  throw new Error('Onbekende mailboxprovider.');
}

async function jsonGet(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error_description || 'Mailboxgegevens konden niet worden opgehaald.');
  return data;
}

export async function mailboxProfile(provider, accessToken) {
  if (provider === 'microsoft') {
    const data = await jsonGet('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', accessToken);
    return { email: data.mail || data.userPrincipalName || '', displayName: data.displayName || '' };
  }
  if (provider === 'google') {
    const data = await jsonGet('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken);
    return { email: data.emailAddress || '', displayName: '' };
  }
  throw new Error('Onbekende mailboxprovider.');
}

function headerValue(headers, name) {
  const row = (headers || []).find((item) => String(item.name || '').toLowerCase() === name.toLowerCase());
  return row?.value || '';
}

function parseFrom(value) {
  const text = String(value || '').trim();
  const match = /^(.*)<([^>]+)>$/.exec(text);
  if (!match) return { name: '', email: text.replace(/^"|"$/g, '').trim().toLowerCase() };
  return { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2].trim().toLowerCase() };
}

export async function fetchInboxMessages(provider, accessToken) {
  if (provider === 'microsoft') {
    const params = new URLSearchParams({
      '$top': '40',
      '$select': 'id,subject,from,receivedDateTime,bodyPreview,internetMessageId',
      '$orderby': 'receivedDateTime desc'
    });
    const data = await jsonGet(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${params}`, accessToken);
    return (data.value || []).map((message) => ({
      id: message.internetMessageId || message.id,
      providerId: message.id,
      subject: message.subject || '',
      fromName: message.from?.emailAddress?.name || '',
      fromEmail: String(message.from?.emailAddress?.address || '').toLowerCase(),
      receivedAt: message.receivedDateTime || new Date().toISOString(),
      snippet: message.bodyPreview || ''
    }));
  }
  if (provider === 'google') {
    const list = await jsonGet('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=newer_than%3A30d', accessToken);
    const ids = (list.messages || []).slice(0, 40);
    const messages = [];
    for (const item of ids) {
      const data = await jsonGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`, accessToken);
      const headers = data.payload?.headers || [];
      const from = parseFrom(headerValue(headers, 'From'));
      messages.push({
        id: headerValue(headers, 'Message-ID') || item.id,
        providerId: item.id,
        subject: headerValue(headers, 'Subject'),
        fromName: from.name,
        fromEmail: from.email,
        receivedAt: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : new Date().toISOString(),
        snippet: data.snippet || ''
      });
    }
    return messages;
  }
  throw new Error('Onbekende mailboxprovider.');
}
