const http = require('http');
const https = require('https');

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve({
        headers: res.headers,
        status: res.statusCode,
        body: Buffer.concat(data)
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  // 1. Get CSRF token
  const csrfRes = await request('http://localhost:3003/api/auth/csrf');
  const csrfBody = JSON.parse(csrfRes.body.toString());
  const csrfToken = csrfBody.csrfToken;
  const setCookie = csrfRes.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find(c => c.includes('next-auth.csrf-token')).split(';')[0];

  // 2. Login
  const loginBody = new URLSearchParams({
    email: 'admin@weglobal.com',
    password: 'password',
    csrfToken: csrfToken,
    json: 'true'
  }).toString();

  const loginRes = await request('http://localhost:3003/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': csrfCookie
    },
    body: loginBody
  });

  const sessionCookie = (loginRes.headers['set-cookie'] || []).find(c => c.includes('next-auth.session-token'))?.split(';')[0];
  
  if (!sessionCookie) {
    console.log('Failed to login, using unauthenticated size (redirects).');
  }

  const cookieHeader = [csrfCookie, sessionCookie].filter(Boolean).join('; ');

  // 3. Fetch Pipeline Page
  console.log('Fetching Pipeline...');
  const pageRes = await request('http://localhost:3003/pipeline?tab=workspace', {
    headers: { 'Cookie': cookieHeader }
  });

  const html = pageRes.body.toString();
  let totalBytes = pageRes.body.length;
  console.log(`HTML size: ${(pageRes.body.length / 1024).toFixed(2)} KB`);

  // 4. Find all JS and CSS
  const scriptRegex = /<script[^>]+src="([^">]+)"/g;
  const linkRegex = /<link[^>]+href="([^">]+\.css)"/g;
  
  let match;
  const urlsToFetch = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    if (match[1].startsWith('/')) urlsToFetch.push(`http://localhost:3003${match[1]}`);
  }
  while ((match = linkRegex.exec(html)) !== null) {
    if (match[1].startsWith('/')) urlsToFetch.push(`http://localhost:3003${match[1]}`);
  }

  let jsBytes = 0;
  let cssBytes = 0;

  for (const assetUrl of [...new Set(urlsToFetch)]) {
    try {
      const assetRes = await request(assetUrl);
      totalBytes += assetRes.body.length;
      if (assetUrl.endsWith('.css')) cssBytes += assetRes.body.length;
      else jsBytes += assetRes.body.length;
    } catch (e) {
      console.log(`Failed to fetch ${assetUrl}`);
    }
  }

  console.log(`JS size: ${(jsBytes / 1024).toFixed(2)} KB`);
  console.log(`CSS size: ${(cssBytes / 1024).toFixed(2)} KB`);
  
  const totalMB = (totalBytes / 1024 / 1024).toFixed(3);
  console.log(`\nTotal Network Transfer (Uncompressed): ${totalMB} MB`);
  
  // Estimate gzipped (Next.js typically gzips assets to about 30%)
  const gzippedMB = (totalBytes * 0.3 / 1024 / 1024).toFixed(3);
  console.log(`Estimated Transfer (Gzipped - Production): ${gzippedMB} MB`);

})();
