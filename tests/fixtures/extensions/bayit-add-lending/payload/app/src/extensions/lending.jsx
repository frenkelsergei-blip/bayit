// Screen entry of the "Lent & borrowed" module: its icon and a lazily loaded screen (own chunk, precached offline).
import {HandArrowUp} from '@phosphor-icons/react';
export const LENDING_SCREEN={id:'lending',Icon:HandArrowUp,load:()=>import('./lending/lending-screen.jsx')};
