const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'dist');
const fileTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"};
const allowHeaders=['user-agent','accept','accept-language','sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','sec-fetch-site','sec-fetch-mode','sec-fetch-dest','dnt','sec-gpc','referer'];
const server=http.createServer((req,res)=>{
  let requestPath;
  try{requestPath=new URL(req.url,'http://localhost:5173').pathname;}catch{res.writeHead(400,headers);res.end('Bad request');return;}
  // Visitor statistics are hosted-only; preview never changes live totals.
  if(requestPath==='/api/visit.php'&&req.method==='POST'){req.resume();res.writeHead(204,headers);res.end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end('Method not allowed');return;}
  if(requestPath==='/api/context'||requestPath==='/api/context.php'){
    if(req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403,headers);res.end('Same-origin request required');return;}
    const selectedHeaders={};for(const name of allowHeaders)if(req.headers[name])selectedHeaders[name]=String(req.headers[name]).slice(0,2048);
    res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});
    res.end(req.method==='HEAD'?'':JSON.stringify({local:true,address:req.socket.remoteAddress,family:req.socket.remoteFamily,headers:selectedHeaders,cookiePresent:!!req.headers.cookie,location:{status:'local',note:'Localhost has no public IP location. Open the hosted edition to see the offline IP-location estimate.'}}));return;
  }
  const name=requestPath==='/'?'index.html':requestPath.slice(1);
  if(!/^[a-zA-Z0-9-]+\.(html|css|js|svg)$/.test(name)){res.writeHead(404,headers);res.end('Not found');return;}
  fs.readFile(path.join(root,name),(error,data)=>{if(error){res.writeHead(404,headers);res.end('Not found');return;}res.writeHead(200,{...headers,'Content-Type':fileTypes[path.extname(name)]});res.end(req.method==='HEAD'?'':data);});
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(5173,'127.0.0.1',()=>console.log('Observatory: http://localhost:5173'));
