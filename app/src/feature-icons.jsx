import React from 'react';
import {Sun,CheckCircle,CalendarDots,ShoppingCart,LockSimple,BookOpen,ChartBar,FileText,ShieldCheck,Ticket,Wrench,Package,ForkKnife,UsersThree,Sparkle,TelegramLogo,Buildings,SquaresFour} from '@phosphor-icons/react';
import {featureById} from '../../shared/features.mjs';
import {EXTRA_SCREENS} from './extensions/screens.jsx';

// Phosphor components for the icon names in shared/features.mjs.
const ICONS={Sun,CheckCircle,CalendarDots,ShoppingCart,LockSimple,BookOpen,ChartBar,FileText,ShieldCheck,Ticket,Wrench,Package,ForkKnife,UsersThree,Sparkle,TelegramLogo,Buildings,SquaresFour};
export function FeatureIcon({id,size=24,...rest}){
 // A feature module brings its own Phosphor component in its screen entry (app/src/extensions/screens.jsx).
 const Icon=id==='household'?Buildings:EXTRA_SCREENS.find(s=>s.id===id)?.Icon||ICONS[featureById(id)?.icon]||SquaresFour;
 return <Icon size={size} {...rest}/>;
}
