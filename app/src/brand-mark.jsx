import React from 'react';
import './brand-mark.css';
import {BRAND_ASSETS} from './brand-assets';

// Preserve the actual selected raster mark. The measured viewports contain the
// supplied lettering and folded-house artwork, without a drawn logo substitute.
export function BrandMark({className=''}){
 return <span className={'bayit-brandmark '+className} role="img" aria-label="Bayit">
  <span className="bayit-brandmark-light"><img src={BRAND_ASSETS.light} alt="" draggable="false"/></span>
  <span className="bayit-brandmark-dark"><img src={BRAND_ASSETS.dark} alt="" draggable="false"/></span>
 </span>;
}
