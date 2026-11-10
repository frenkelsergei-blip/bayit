import React from 'react';
import {Sun,CheckCircle,CalendarDots,ShoppingCart,LockSimple,BookOpen,ChartBar,FileText,ShieldCheck,Ticket,Wrench,Package,ForkKnife,UsersThree,Sparkle,TelegramLogo,Buildings,SquaresFour} from '@phosphor-icons/react';
import {featureById} from '../../shared/features.mjs';

// Phosphor components for the icon names in shared/features.mjs.
const ICONS={Sun,CheckCircle,CalendarDots,ShoppingCart,LockSimple,BookOpen,ChartBar,FileText,ShieldCheck,Ticket,Wrench,Package,ForkKnife,UsersThree,Sparkle,TelegramLogo,Buildings,SquaresFour};
export function FeatureIcon({id,size=24,...rest}){
 const Icon=id==='household'?Buildings:ICONS[featureById(id)?.icon]||SquaresFour;
 return <Icon size={size} {...rest}/>;
}
