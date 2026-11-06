import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {contentSecurityPolicy} from '../cloud/security-headers.mjs';
export async function buildPolicy(file='dist/client/index.html'){
 const html=await readFile(file,'utf8'),hashes=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(match[1])&&match[2].trim())hashes.push("'sha256-"+createHash('sha256').update(match[2]).digest('base64')+"'");
 return contentSecurityPolicy(hashes);
}
