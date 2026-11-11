// Puzzle pictures are full scenes (2026-11-10 user report: the island picture showed a transparent background).
// Every puzzle picture and its thumbnail must be a PNG that cannot carry transparency: greyscale or RGB without a
// tRNS chunk, or a palette without tRNS. RGBA / grey+alpha files fail even when every pixel happens to be opaque.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {HERO_PUZZLE_ART,heroPuzzleThumbnail} from '../shared/hero-games.mjs';

const pub=fileURLToPath(new URL('../app/public',import.meta.url));
const pngInfo=file=>{const b=readFileSync(file);assert.equal(b.toString('latin1',1,4),'PNG',file+' is not a PNG');
 let at=8,type=null,width=0,height=0,trns=false;
 while(at<b.length){const len=b.readUInt32BE(at),name=b.toString('latin1',at+4,at+8);
  if(name==='IHDR'){width=b.readUInt32BE(at+8);height=b.readUInt32BE(at+12);type=b[at+17]}
  if(name==='tRNS')trns=true;if(name==='IEND')break;at+=12+len}
 return {type,width,height,trns}};

test('every puzzle picture and thumbnail is a full picture with no transparency',()=>{
 assert.equal(HERO_PUZZLE_ART.length,12);
 for(const [id,,,image] of HERO_PUZZLE_ART)for(const path of [image,heroPuzzleThumbnail(id)]){
  const info=pngInfo(pub+path);
  assert.ok([0,2,3].includes(info.type),`${id}: ${path} has an alpha channel (PNG colour type ${info.type})`);
  assert.equal(info.trns,false,`${id}: ${path} has a transparent colour (tRNS)`);
  assert.ok(Math.abs(info.width/info.height-1.5)<.01,`${id}: ${path} is ${info.width}×${info.height}, not 3:2`);
 }
});
