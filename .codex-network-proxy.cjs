const http = require('http');

let requests = [];
http.createServer((request, response) => {
  if (request.url === '/__metrics') return response.end(JSON.stringify(requests));
  if (request.url === '/__reset') { requests = []; return response.end('ok'); }
  const startedAt = Date.now();
  const upstream = http.request({
    hostname: '127.0.0.1', port: 3004, method: request.method, path: request.url,
    headers: { ...request.headers, host: 'localhost:3005', 'x-forwarded-host': 'localhost:3005', 'x-forwarded-proto': 'http' },
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 500, upstreamResponse.headers);
    let bytes = 0;
    upstreamResponse.on('data', chunk => { bytes += chunk.length; });
    upstreamResponse.on('end', () => requests.push({
      method: request.method, url: request.url, status: upstreamResponse.statusCode, bytes,
      contentType: upstreamResponse.headers['content-type'], durationMs: Date.now() - startedAt,
    }));
    upstreamResponse.pipe(response);
  });
  upstream.on('error', error => { response.statusCode = 502; response.end(error.message); });
  request.pipe(upstream);
}).listen(3005, '127.0.0.1', () => console.log('network proxy ready'));
