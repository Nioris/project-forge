#!/usr/bin/env node
import http from 'node:http';

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  res.setHeader('content-type','application/json');
  if(u.pathname==='/web'){
    res.end(JSON.stringify({results:[
      {title:'Alpha',url:'https://example.com/a',snippet:'alpha snippet'},
      {title:'Beta',link:'https://example.com/b',description:'beta snippet'}
    ]}));
    return;
  }
  if(u.pathname==='/images'){
    res.end(JSON.stringify({items:[
      {title:'Image A',image_url:'https://images.example.com/a.png',page_url:'https://example.com/a'},
      {caption:'Image B',src:'https://images.example.com/b.jpg',source_url:'https://example.com/b'}
    ]}));
    return;
  }
  res.statusCode=404; res.end(JSON.stringify({error:'not found'}));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
process.env.FORGE_SEARCH_PROVIDER='mock';
process.env.FORGE_SEARCH_WEB_URL=`http://127.0.0.1:${port}/web`;
process.env.FORGE_SEARCH_IMAGES_URL=`http://127.0.0.1:${port}/images`;
process.env.FORGE_SEARCH_AUTH_MODE='none';
process.env.FORGE_SEARCH_ALLOW_HTTP='1';
const mod=await import('./lib/forge-search.mjs?test='+Date.now());
let failed=false;
const check=(name,ok)=>{console.log(`${ok?'[OK]':'[FAIL]'} ${name}`); if(!ok) failed=true;};
try{
  const caps=mod.getSearchCapabilities(process.cwd());
  check('mock web capability',caps.web_search===true);
  check('mock image capability',caps.image_search===true);
  check('direct web_fetch implemented',caps.web_fetch===true);
  const w=await mod.webSearch(process.cwd(),'factory clicker',2);
  check('web results normalized',w.results.length===2 && w.results[0].url==='https://example.com/a');
  const i=await mod.imageSearch(process.cwd(),'factory game ui',2);
  check('image results normalized',i.results.length===2 && i.results[0].image_url.endsWith('/a.png'));
  let blocked=false; try{await mod.webFetch('http://127.0.0.1:1/private');}catch{blocked=true;}
  check('web_fetch blocks localhost/private targets',blocked);
}finally{server.close();}
process.exit(failed?1:0);
