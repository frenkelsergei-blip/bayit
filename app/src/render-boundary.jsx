import React from 'react';
export class RenderBoundary extends React.Component{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(){console.error('Bayit could not render this view. Record content was not logged.')}
 render(){if(!this.state.failed)return this.props.children;const he=document.documentElement.lang==='he';return <main className="cloud-loading" role="alert"><h1>{he?'לא הצלחנו להציג את התצוגה הזו.':'This view could not be displayed.'}</h1><p>{he?'אפשר לטעון מחדש ולנסות שוב. המידע שבשרת נשמר.':'Reload and try again. Your saved server data is kept.'}</p><button className="button" onClick={()=>location.reload()}>{he?'טעינה מחדש':'Reload'}</button></main>}
}
