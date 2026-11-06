const luminance=hex=>{const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722};
export function onAccentColor(hex){const bg=luminance(hex),navy=luminance('#08142a');return (bg+.05)/(navy+.05)>=4.5?'#08142a':1.05/(bg+.05)>=4.5?'#ffffff':'#000000'}
