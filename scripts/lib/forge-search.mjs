/**
 * Project Forge external web/image search + safe page fetch provider.
 * Node built-ins only. Secrets stay in forge-data/secrets via forge-secrets.mjs.
 *
 * Provider contract is intentionally configurable because the public GigaSearch
 * docs visible to the adapter audit document Rambler Proxy / Rambler Images Proxy
 * behavior, but the searchable documentation excerpt does not expose the full
 * OpenAPI request schema/auth contract. We do not guess credentials or silently
 * reuse the GigaChat Authorization Key.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getProviderSecret } from './forge-secrets.mjs';
import { getAccessToken } from './gigachat-api.mjs';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
const MAX_FETCH_BYTES = 3 * 1024 * 1024;

function boolEnv(name, fallback=false){
  const v=process.env[name];
  if(v==null) return fallback;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function intEnv(name, fallback){
  const n=Number(process.env[name]);
  return Number.isFinite(n)?n:fallback;
}
function cleanUrl(value){
  const s=String(value||'').trim();
  if(!s) return null;
  const u=new URL(s);
  if(!['http:','https:'].includes(u.protocol)) throw new Error(`Unsupported search URL protocol: ${u.protocol}`);
  return u.toString();
}
function envFirst(...names){
  for(const n of names){ const v=process.env[n]?.trim(); if(v) return v; }
  return null;
}
function getSearchSecret(project){
  const direct=envFirst('GIGASEARCH_ACCESS_TOKEN','FORGE_SEARCH_ACCESS_TOKEN');
  if(direct) return {value:direct,source:'env:access-token',kind:'access-token'};
  let provider=null;
  try{ provider=getProviderSecret('gigasearch',project); }catch{}
  if(provider?.value) return {value:provider.value,source:provider.source,kind:'provider-key'};
  const generic=envFirst('GIGASEARCH_API_KEY','FORGE_SEARCH_API_KEY');
  if(generic) return {value:generic,source:'env:api-key',kind:'provider-key'};
  return null;
}

export function applyDefaultSearchEnvironment(env=process.env){
  const hasExplicitProvider=Boolean(env.FORGE_SEARCH_PROVIDER?.trim()||env.GIGASEARCH_PROVIDER?.trim());
  const hasConfiguredEndpoint=Boolean(
    env.FORGE_SEARCH_WEB_URL?.trim()||env.GIGASEARCH_WEB_URL?.trim()||
    env.FORGE_SEARCH_IMAGES_URL?.trim()||env.GIGASEARCH_IMAGES_URL?.trim()
  );
  if(!hasExplicitProvider&&!hasConfiguredEndpoint){
    env.FORGE_SEARCH_PROVIDER='bing-html';
    return {applied:true,provider:'bing-html'};
  }
  return {applied:false,provider:(env.FORGE_SEARCH_PROVIDER||env.GIGASEARCH_PROVIDER||'gigasearch').trim().toLowerCase()};
}

export function getSearchConfig(project='.'){
  const provider=(envFirst('FORGE_SEARCH_PROVIDER','GIGASEARCH_PROVIDER')||'gigasearch').toLowerCase();
  const htmlProvider=provider==='bing-html';
  const webUrl=htmlProvider ? 'https://www.bing.com/search' : cleanUrl(envFirst('GIGASEARCH_WEB_URL','FORGE_SEARCH_WEB_URL'));
  const imageUrl=htmlProvider ? 'https://www.bing.com/images/search' : cleanUrl(envFirst('GIGASEARCH_IMAGES_URL','FORGE_SEARCH_IMAGES_URL'));
  const secret=htmlProvider ? null : getSearchSecret(project);
  const authMode=(envFirst('GIGASEARCH_AUTH_MODE','FORGE_SEARCH_AUTH_MODE') || (secret?.kind==='access-token'?'bearer':'')).toLowerCase();
  const authHeader=envFirst('GIGASEARCH_AUTH_HEADER','FORGE_SEARCH_AUTH_HEADER') || (authMode==='api-key'?'X-Api-Key':'Authorization');
  const authScheme=envFirst('GIGASEARCH_AUTH_SCHEME','FORGE_SEARCH_AUTH_SCHEME') || (authMode==='bearer'?'Bearer':'');
  const queryParam=envFirst('GIGASEARCH_QUERY_PARAM','FORGE_SEARCH_QUERY_PARAM') || 'query';
  const countParam=envFirst('GIGASEARCH_COUNT_PARAM','FORGE_SEARCH_COUNT_PARAM') || '';
  const webMethod=(envFirst('GIGASEARCH_WEB_METHOD','FORGE_SEARCH_WEB_METHOD')||'GET').toUpperCase();
  const imageMethod=(envFirst('GIGASEARCH_IMAGES_METHOD','FORGE_SEARCH_IMAGES_METHOD')||'GET').toUpperCase();
  const extraHeadersJson=envFirst('GIGASEARCH_HEADERS_JSON','FORGE_SEARCH_HEADERS_JSON');
  let extraHeaders={};
  if(extraHeadersJson){
    try{extraHeaders=JSON.parse(extraHeadersJson);}catch(e){throw new Error(`Invalid GIGASEARCH_HEADERS_JSON: ${e.message}`);}
  }
  const authReady=htmlProvider || authMode==='none' || authMode==='gigachat-token' || Boolean(secret?.value && authMode);
  const webReady=Boolean(webUrl && authReady);
  const imageReady=Boolean(imageUrl && authReady);
  return {
    provider,htmlProvider,webUrl,imageUrl,webMethod,imageMethod,queryParam,countParam,
    authMode,authHeader,authScheme,authReady,webReady,imageReady,
    secretSource:secret?.source||null,secretValue:secret?.value||null,extraHeaders,
    timeoutMs:Math.max(1000,Math.min(120000,intEnv('FORGE_SEARCH_TIMEOUT_MS',DEFAULT_TIMEOUT_MS))),
    allowInsecureHttp:boolEnv('FORGE_SEARCH_ALLOW_HTTP',false)
  };
}

export function getSearchCapabilities(project='.'){
  let cfg;
  try{cfg=getSearchConfig(project);}catch(e){return {provider:'gigasearch',web_search:false,image_search:false,web_fetch:true,configured:false,error:e.message};}
  return {
    provider:cfg.provider,
    web_search:cfg.webReady,
    image_search:cfg.imageReady,
    web_fetch:true,
    configured:cfg.webReady||cfg.imageReady,
    config:{
      web_url_configured:Boolean(cfg.webUrl),
      images_url_configured:Boolean(cfg.imageUrl),
      auth_ready:cfg.authReady,
      auth_mode:cfg.authMode||null,
      query_param:cfg.queryParam,
      secret_source:cfg.secretSource?String(cfg.secretSource).replace(/^.*[\\/]/,'<central>/'):null
    }
  };
}

async function authHeaders(cfg,project){
  const headers={'Accept':'application/json','User-Agent':'Project-Forge-GigaChat/6.3.1'};
  Object.assign(headers,cfg.extraHeaders||{});
  if(cfg.authMode==='none') return headers;
  if(cfg.authMode==='gigachat-token'){
    const access=await getAccessToken(project);
    headers[cfg.authHeader||'Authorization']=`Bearer ${access.token}`;
    return headers;
  }
  const secretValue=cfg.secretValue;
  if(!secretValue) throw new Error('Search credential missing. Set GIGASEARCH_ACCESS_TOKEN or store a dedicated gigasearch key in forge-data/secrets/gigasearch.key. Forge does not reuse the GigaChat key implicitly.');
  const value=cfg.authScheme?`${cfg.authScheme} ${secretValue}`:secretValue;
  headers[cfg.authHeader]=value;
  return headers;
}

async function readLimited(res,maxBytes){
  const reader=res.body?.getReader?.();
  if(!reader) return Buffer.from(await res.arrayBuffer());
  const chunks=[]; let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    total+=value.byteLength;
    if(total>maxBytes){ try{await reader.cancel();}catch{}; throw new Error(`HTTP response exceeds ${maxBytes} bytes`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function buildSearchRequest(url,method,query,count,cfg,project){
  const u=new URL(url);
  const headers=await authHeaders(cfg,project);
  let body;
  if(method==='GET'){
    u.searchParams.set(cfg.queryParam,query);
    if(cfg.countParam) u.searchParams.set(cfg.countParam,String(count));
  }else if(method==='POST'){
    headers['Content-Type']='application/json';
    body=JSON.stringify({[cfg.queryParam]:query,...(cfg.countParam?{[cfg.countParam]:count}:{})});
  }else throw new Error(`Unsupported search method: ${method}`);
  return {url:u.toString(),options:{method,headers,body}};
}

async function requestJson(url,method,query,count,cfg,project){
  if(!cfg.allowInsecureHttp && String(url).startsWith('http:')) throw new Error('Insecure HTTP search endpoint blocked. Use HTTPS or set FORGE_SEARCH_ALLOW_HTTP=1 only for a local test fixture.');
  const req=await buildSearchRequest(url,method,query,count,cfg,project);
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),cfg.timeoutMs);
  try{
    const res=await fetch(req.url,{...req.options,signal:ctrl.signal,redirect:'follow'});
    const buf=await readLimited(res,MAX_SEARCH_BYTES);
    const text=buf.toString('utf8');
    let data; try{data=JSON.parse(text);}catch{data={raw:text};}
    if(!res.ok) throw new Error(`Search HTTP ${res.status}: ${text.slice(0,500)}`);
    return {status:res.status,data,requestUrl:req.url};
  }catch(e){
    if(e?.name==='AbortError') throw new Error(`Search request timed out after ${cfg.timeoutMs} ms`);
    throw e;
  }finally{clearTimeout(timer);}
}

function pick(obj,keys){
  if(!obj||typeof obj!=='object') return '';
  for(const k of keys){ const v=obj[k]; if(typeof v==='string'&&v.trim()) return v.trim(); }
  return '';
}
function walkObjects(value,out=[],depth=0){
  if(depth>6||out.length>2000) return out;
  if(Array.isArray(value)){ for(const x of value) walkObjects(x,out,depth+1); return out; }
  if(value&&typeof value==='object'){
    out.push(value);
    for(const v of Object.values(value)) if(v&&typeof v==='object') walkObjects(v,out,depth+1);
  }
  return out;
}
function normalizeWeb(data,count){
  const candidates=walkObjects(data); const out=[]; const seen=new Set();
  for(const x of candidates){
    const url=pick(x,['url','link','href','source_url','sourceUrl','page_url','pageUrl']);
    if(!/^https?:\/\//i.test(url)||seen.has(url)) continue;
    seen.add(url);
    out.push({
      title:pick(x,['title','name','caption','header']),
      url,
      snippet:pick(x,['snippet','description','text','content','summary','body']).slice(0,2400),
      source:pick(x,['source','domain','host','site'])
    });
    if(out.length>=count) break;
  }
  return out;
}
function normalizeImages(data,count){
  const candidates=walkObjects(data); const out=[]; const seen=new Set();
  for(const x of candidates){
    const image=pick(x,['image_url','imageUrl','image','src','original','original_url','originalUrl','url']);
    if(!/^https?:\/\//i.test(image)||seen.has(image)) continue;
    seen.add(image);
    const page=pick(x,['page_url','pageUrl','source_url','sourceUrl','link','href']);
    out.push({
      title:pick(x,['title','name','caption','alt']),
      image_url:image,
      page_url:/^https?:\/\//i.test(page)?page:'',
      thumbnail_url:pick(x,['thumbnail_url','thumbnailUrl','thumbnail','thumb','preview'])
    });
    if(out.length>=count) break;
  }
  return out;
}


function decodeHtmlEntities(value=''){
  return String(value||'')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function stripTags(value=''){
  return decodeHtmlEntities(String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
async function fetchSearchHtml(url){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),30000);
  try{
    const res=await fetch(url,{
      signal:ctrl.signal,
      redirect:'follow',
      headers:{
        'Accept':'text/html,application/xhtml+xml',
        'Accept-Language':'ru-RU,ru;q=0.9,en;q=0.7',
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 ProjectForge/6.2.1'
      }
    });
    const buf=await readLimited(res,MAX_SEARCH_BYTES), html=buf.toString('utf8');
    if(!res.ok) throw new Error(`HTML search HTTP ${res.status}: ${html.slice(0,300)}`);
    return {status:res.status,html};
  }catch(e){
    if(e?.name==='AbortError') throw new Error('HTML search timed out after 30000 ms');
    throw e;
  }finally{clearTimeout(timer);}
}

function unwrapEngineRedirectUrl(raw=''){
  let url=decodeHtmlEntities(String(raw||'')).replace(/^\/\//,'https://');
  if(!url) return '';
  try{
    const u=new URL(url);
    if(/duckduckgo\.com$/i.test(u.hostname) && u.pathname==='/l/'){
      const target=u.searchParams.get('uddg');
      if(target) return decodeURIComponent(target);
    }
    return u.toString();
  }catch{
    return url;
  }
}

async function bingHtmlWebSearch(query,count){
  const u=new URL('https://www.bing.com/search');
  u.searchParams.set('q',String(query||'').trim());
  u.searchParams.set('count',String(Math.max(5,count)));
  u.searchParams.set('setlang','ru');
  const {status,html}=await fetchSearchHtml(u.toString());
  const results=[],seen=new Set();

  const blocks=[
    ...[...html.matchAll(/<li\b[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>m[1]),
    ...[...html.matchAll(/<div\b[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)].map(m=>m[1])
  ];
  for(const block of blocks){
    const am=block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if(!am) continue;
    const url=unwrapEngineRedirectUrl(am[1]);
    if(!/^https?:\/\//i.test(url) || /(^https?:\/\/)(www\.)?bing\.com\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const pm=block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    results.push({title:stripTags(am[2]),url,snippet:pm?stripTags(pm[1]).slice(0,2400):'',source:(()=>{try{return new URL(url).hostname}catch{return ''}})()});
    if(results.length>=count) break;
  }

  if(results.length===0) throw new Error('Bing HTML search returned HTTP 200 but no parseable organic results; markup may have changed or the request may be blocked.');
  return {ok:true,provider:'bing-html',status,query:String(query||''),results};
}
async function bingHtmlImageSearch(query,count){
  const u=new URL('https://www.bing.com/images/search');
  u.searchParams.set('q',String(query||'').trim());
  u.searchParams.set('form','HDRSC2');
  u.searchParams.set('first','1');
  const {status,html}=await fetchSearchHtml(u.toString());
  const results=[],seen=new Set();

  for(const m of html.matchAll(/<a\b[^>]*class="[^"]*\biusc\b[^"]*"[^>]*\bm="([^"]+)"[^>]*>/gi)){
    let meta;
    try{ meta=JSON.parse(decodeHtmlEntities(m[1])); }catch{ continue; }
    const image=String(meta.murl||meta.imgurl||'');
    if(!/^https?:\/\//i.test(image) || seen.has(image)) continue;
    seen.add(image);
    results.push({
      title:String(meta.t||meta.title||'').slice(0,500),
      image_url:image,
      page_url:/^https?:\/\//i.test(String(meta.purl||''))?String(meta.purl):'',
      thumbnail_url:/^https?:\/\//i.test(String(meta.turl||''))?String(meta.turl):''
    });
    if(results.length>=count) break;
  }

  if(results.length===0) throw new Error('Bing HTML image search returned HTTP 200 but no parseable image results; markup may have changed or the request may be blocked.');
  return {ok:true,provider:'bing-html',status,query:String(query||''),results};
}


async function duckHtmlWebSearch(query,count){
  const u=new URL('https://html.duckduckgo.com/html/');
  u.searchParams.set('q',String(query||'').trim());
  u.searchParams.set('kl','ru-ru');
  const {status,html}=await fetchSearchHtml(u.toString());
  const results=[],seen=new Set();
  const re=/<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html)) && results.length<count){
    const url=unwrapEngineRedirectUrl(m[1]);
    if(!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const tail=html.slice(m.index, Math.min(html.length, m.index+2500));
    const sm=tail.match(/<(?:a|div)\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    results.push({
      title:stripTags(m[2]),
      url,
      snippet:sm?stripTags(sm[1]).slice(0,2400):'',
      source:(()=>{try{return new URL(url).hostname}catch{return ''}})()
    });
  }
  if(results.length===0) throw new Error('DuckDuckGo HTML fallback returned HTTP 200 but no parseable organic results.');
  return {ok:true,provider:'duckduckgo-html-fallback',status,query:String(query||''),results};
}

export async function webSearch(project,query,count=5){
  const cfg=getSearchConfig(project);
  if(!cfg.webReady) throw new Error('web_search is not configured. Set FORGE_SEARCH_PROVIDER=bing-html for the no-key live fallback, or configure exact GigaSearch endpoint/auth.');
  const n=Math.max(1,Math.min(10,Number(count||5)));
  if(cfg.htmlProvider){
    try{return await bingHtmlWebSearch(query,n);}
    catch(e1){
      try{return await duckHtmlWebSearch(query,n);}
      catch(e2){
        throw new Error(`HTML web search failed. Bing: ${e1.message} | DuckDuckGo fallback: ${e2.message}`);
      }
    }
  }
  const {data,status}=await requestJson(cfg.webUrl,cfg.webMethod,String(query||'').trim(),n,cfg,project);
  const results=normalizeWeb(data,n);
  return {ok:true,provider:cfg.provider,status,query:String(query||''),results,raw_result_count:walkObjects(data).length,raw:results.length?undefined:JSON.stringify(data).slice(0,12000)};
}

export async function imageSearch(project,query,count=5){
  const cfg=getSearchConfig(project);
  if(!cfg.imageReady) throw new Error('image_search is not configured. Set FORGE_SEARCH_PROVIDER=bing-html for the no-key live fallback, or configure exact GigaSearch endpoint/auth.');
  const n=Math.max(1,Math.min(10,Number(count||5)));
  if(cfg.htmlProvider) return bingHtmlImageSearch(query,n);
  const {data,status}=await requestJson(cfg.imageUrl,cfg.imageMethod,String(query||'').trim(),n,cfg,project);
  const results=normalizeImages(data,n);
  return {ok:true,provider:cfg.provider,status,query:String(query||''),results,raw_result_count:walkObjects(data).length,raw:results.length?undefined:JSON.stringify(data).slice(0,12000)};
}

function privateIp(ip){
  if(!ip) return true;
  if(ip==='::1'||ip==='0.0.0.0'||ip==='127.0.0.1') return true;
  if(ip.startsWith('127.')||ip.startsWith('10.')||ip.startsWith('192.168.')||ip.startsWith('169.254.')) return true;
  const m=ip.match(/^172\.(\d+)\./); if(m && Number(m[1])>=16 && Number(m[1])<=31) return true;
  const low=ip.toLowerCase();
  if(low.startsWith('fc')||low.startsWith('fd')||low.startsWith('fe80:')) return true;
  return false;
}
async function assertPublicUrl(url){
  const u=new URL(url);
  if(!['http:','https:'].includes(u.protocol)) throw new Error(`web_fetch supports only http/https: ${u.protocol}`);
  if(['localhost','localhost.localdomain'].includes(u.hostname.toLowerCase())) throw new Error('web_fetch blocks localhost/private network targets');
  if(isIP(u.hostname)){ if(privateIp(u.hostname)) throw new Error('web_fetch blocks private IP targets'); return u; }
  const addrs=await lookup(u.hostname,{all:true,verbatim:true});
  if(!addrs.length||addrs.some(x=>privateIp(x.address))) throw new Error('web_fetch blocks hosts resolving to private/link-local addresses');
  return u;
}
function htmlToText(html){
  return String(html||'')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/\s+/g,' ').trim();
}
function htmlTitle(html){ const m=String(html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m?htmlToText(m[1]).slice(0,300):''; }

export async function webFetch(url,maxChars=30000){
  let current=String(url||'').trim();
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),Math.max(3000,Math.min(120000,intEnv('FORGE_WEB_FETCH_TIMEOUT_MS',30000))));
  try{
    for(let redirects=0;redirects<=5;redirects++){
      await assertPublicUrl(current);
      const res=await fetch(current,{method:'GET',headers:{'Accept':'text/html,text/plain,application/json;q=0.9,*/*;q=0.5','User-Agent':'Project-Forge-GigaChat/6.3.1'},redirect:'manual',signal:ctrl.signal});
      if([301,302,303,307,308].includes(res.status)){
        const loc=res.headers.get('location'); if(!loc) throw new Error(`Redirect ${res.status} without Location`);
        current=new URL(loc,current).toString(); continue;
      }
      const buf=await readLimited(res,MAX_FETCH_BYTES); const raw=buf.toString('utf8');
      if(!res.ok) throw new Error(`web_fetch HTTP ${res.status}: ${raw.slice(0,500)}`);
      const ct=res.headers.get('content-type')||'';
      let text=/html/i.test(ct)?htmlToText(raw):raw;
      const limit=Math.max(1000,Math.min(120000,Number(maxChars||30000))); if(text.length>limit) text=text.slice(0,limit)+`\n...[truncated ${text.length-limit} chars]`;
      return {ok:true,url:current,status:res.status,content_type:ct,title:/html/i.test(ct)?htmlTitle(raw):'',text};
    }
    throw new Error('web_fetch redirect limit exceeded');
  }catch(e){ if(e?.name==='AbortError') throw new Error('web_fetch timed out'); throw e; }
  finally{clearTimeout(timer);}
}

export function searchDoctor(project='.'){
  const caps=getSearchCapabilities(project);
  return {
    ok:true,
    provider:caps.provider,
    web_search:caps.web_search,
    image_search:caps.image_search,
    web_fetch:caps.web_fetch,
    configured:caps.configured,
    config:caps.config||{},
    error:caps.error||null,
    notes:[
      caps.provider==='bing-html'
        ? 'bing-html is the no-key live fallback used when no explicit provider or endpoint is configured. Web search tries Bing first and then DuckDuckGo HTML as a parser fallback; image search uses Bing Images. This is not the official GigaSearch API and may break if search-engine markup or anti-bot behavior changes.'
        : 'GigaSearch remains supported only when exact endpoint URLs and auth are configured; Forge does not silently reuse GigaChat credentials.',
      'Override the fallback with FORGE_SEARCH_PROVIDER or an exact GIGASEARCH_* endpoint/auth configuration.',
      'For production GigaSearch: configure its exact project/OpenAPI endpoint and dedicated auth outside the managed project.'
    ]
  };
}
