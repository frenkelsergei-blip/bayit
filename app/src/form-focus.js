// A phone/tablet form opens for review. The keyboard starts only after a field
// is chosen. Fine-pointer desktop forms retain their existing typing shortcut.
export const allowInitialTextFocus=()=>typeof window!=='undefined'&&!window.matchMedia('(pointer: coarse), (max-width:700px), (max-height:520px) and (orientation:landscape)').matches;
