const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Track total bytes
  let totalBytes = 0;
  let htmlBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let imgBytes = 0;
  let fetchBytes = 0;

  // CDPSession to get exact network metrics including compression
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  client.on('Network.dataReceived', (e) => {
    totalBytes += e.dataLength;
  });

  client.on('Network.responseReceived', (e) => {
    const res = e.response;
    const type = res.mimeType;
    if (type.includes('text/html')) htmlBytes += e.response.encodedDataLength || 0;
    else if (type.includes('javascript')) jsBytes += e.response.encodedDataLength || 0;
    else if (type.includes('css')) cssBytes += e.response.encodedDataLength || 0;
    else if (type.includes('image')) imgBytes += e.response.encodedDataLength || 0;
    else if (type.includes('json')) fetchBytes += e.response.encodedDataLength || 0;
  });

  console.log('Logging in...');
  await page.goto('http://localhost:3003/auth/login');
  // Adjust these selectors if needed based on the CRM's login page
  try {
    await page.type('input[type="email"]', 'admin@weglobal.com');
    await page.type('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
  } catch (e) {
    console.log('Login form not found, maybe already logged in or different UI', e.message);
  }

  console.log('Navigating to Pipeline Workspace...');
  
  // Reset counters for the actual page load
  totalBytes = 0;
  htmlBytes = 0;
  jsBytes = 0;
  cssBytes = 0;
  imgBytes = 0;
  fetchBytes = 0;

  await page.goto('http://localhost:3003/pipeline?tab=workspace', { waitUntil: 'networkidle0' });

  console.log('\n--- Network Transfer Size ---');
  console.log(`Total Download: ${(totalBytes / 1024 / 1024).toFixed(3)} MB`);
  // Note: CDPSession Network.dataReceived gives the exact transferred bytes over the wire
  console.log(`HTML: ${(htmlBytes / 1024).toFixed(2)} KB`);
  console.log(`JS: ${(jsBytes / 1024).toFixed(2)} KB`);
  console.log(`CSS: ${(cssBytes / 1024).toFixed(2)} KB`);
  console.log(`Images: ${(imgBytes / 1024).toFixed(2)} KB`);
  console.log(`JSON/API: ${(fetchBytes / 1024).toFixed(2)} KB`);

  await browser.close();
})();
