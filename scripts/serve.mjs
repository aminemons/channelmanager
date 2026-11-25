import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const files={
 '/':'index.html','/app':'index.html','/app/':'index.html',
 '/workspace.js':'workspace.js','/workspace-core.mjs':'workspace-core.mjs',
 '/calendar-exchange.mjs':'calendar-exchange.mjs','/decision-engine.mjs':'decision-engine.mjs','/hotel.mjs':'hotel.mjs',
 '/distribution.mjs':'distribution.mjs','/workspace-connection.mjs':'workspace-connection.mjs',
 '/workspace.css':'workspace.css','/favicon.svg':'favicon.svg'
};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PORT)||4173;
createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if (path==='/api/channel-sync'||path==='/api/channel-webhook') {
    const {default:handler}=await import('../api/channel-sync.js');
    await handler(req,res);return;
  }
  const file=files[path];
  if(!file){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}
  const body=await readFile(join(root,file));
  const ext=file.slice(file.lastIndexOf('.'));
  res.writeHead(200,{'content-type':types[ext],'x-content-type-options':'nosniff'});
  res.end(body);
 }catch(e){res.writeHead(500,{'content-type':'text/plain'});res.end('Unable to serve asset');}
}).listen(port,()=>console.log('HOMA running at http://localhost:'+port));
