import {voucherBarcodeTypes} from '../../shared/vouchers.mjs';

function loadImage(url) {
 return new Promise((resolve,reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(Error('VOUCHER_INVALID_PHOTO'));
  image.src = url;
 });
}

export async function readVoucherPhoto(file) {
 if (!file || file.size > 15*1024*1024) throw Error('VOUCHER_INVALID_PHOTO');
 const url = URL.createObjectURL(file);
 try {
  const image = await loadImage(url);
  if (!image.width || !image.height || image.width*image.height > 40_000_000) throw Error('VOUCHER_INVALID_PHOTO');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1,1800/Math.max(image.width,image.height));
  canvas.width = Math.max(1,Math.round(image.width*scale));
  canvas.height = Math.max(1,Math.round(image.height*scale));
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle = 'white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let decoded = {};
  try {
   const {BrowserMultiFormatReader,BarcodeFormat} = await import('@zxing/library');
   const reader = new BrowserMultiFormatReader();
   const result = await reader.decodeFromImageUrl(canvas.toDataURL('image/png'));
   const format = BarcodeFormat[result.getBarcodeFormat()], code = result.getText();
   if (Object.hasOwn(voucherBarcodeTypes,format) && code.length <= 200 && !/[\u0000-\u001f\u007f]/.test(code)) decoded={code,format};
  } catch { /* The review can still show the photo when a barcode cannot be decoded. */ }
  for (const quality of [0.88,0.75,0.6,0.45,0.3]) {
   const photo = canvas.toDataURL('image/jpeg',quality);
   if (photo.length <= 245_000) return {...decoded,photo};
  }
  throw Error('VOUCHER_INVALID_PHOTO');
 } finally { URL.revokeObjectURL(url); }
}

export async function renderVoucherBarcode(canvas,format,code) {
 const bcid = voucherBarcodeTypes[format];
 if (!bcid) return false;
 try {
  const {default:bwipjs} = await import('bwip-js/browser');
  bwipjs.toCanvas(canvas,{bcid,text:code,scale:3,paddingwidth:16,paddingheight:12,backgroundcolor:'FFFFFF'});
  return true;
 } catch { return false; }
}
