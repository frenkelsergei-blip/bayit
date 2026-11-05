import React,{useState,useEffect,useRef,useId} from 'react';
import {createPortal} from 'react-dom';
import {CaretDown,Check} from '@phosphor-icons/react';

const plain=(value)=>React.Children.toArray(value).map(v=>typeof v==='string'||typeof v==='number'?v:React.isValidElement(v)?plain(v.props.children):'').join('');
export function Select({children,value,defaultValue,onChange,disabled=false,className='',name,...props}){
  const options=React.Children.toArray(children).filter(React.isValidElement).map(child=>({value:String(child.props.value??plain(child.props.children)),label:child.props.children,text:plain(child.props.children),disabled:!!child.props.disabled}));
  const [internal,setInternal]=useState(String(defaultValue??options[0]?.value??''));
  const selected=String(value??internal),index=Math.max(0,options.findIndex(o=>o.value===selected));
  const [open,setOpen]=useState(false),[active,setActive]=useState(index),[position,setPosition]=useState({}),[label,setLabel]=useState('');
  const trigger=useRef(null),popup=useRef(null),search=useRef({text:'',time:0});
  const uid=useId(),listId=uid+'-list';
  useEffect(()=>{const wrapper=trigger.current?.closest('label');if(wrapper){const text=[...wrapper.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();setLabel(text)}},[children]);
  useEffect(()=>{if(disabled)setOpen(false)},[disabled]);
  useEffect(()=>{
    if(!open)return;
    const rect=trigger.current.getBoundingClientRect(),space=window.innerHeight-rect.bottom;
    const maxHeight=Math.min(300,Math.max(140,space<180?rect.top-20:space-20));
    setPosition({position:'fixed',left:Math.max(8,Math.min(rect.left,window.innerWidth-rect.width-8)),width:Math.min(rect.width,window.innerWidth-16),maxHeight,...(space<180?{bottom:window.innerHeight-rect.top+6}:{top:rect.bottom+6})});
    const outside=(e)=>{if(!trigger.current?.contains(e.target)&&!popup.current?.contains(e.target))setOpen(false)};
    const resize=()=>setOpen(false);
    const scroll=(e)=>{if(!popup.current?.contains(e.target))setOpen(false)};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);/* popup keeps its position while open */;
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);/* no scroll listener */};
  },[open]);
  useEffect(()=>{if(open){const option=document.getElementById(uid+'-option-'+active),list=popup.current;if(option&&list){const top=option.offsetTop,bottom=top+option.offsetHeight;if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight}}},[active,open,uid]);
  const choose=(option)=>{if(!option||option.disabled)return;setInternal(option.value);onChange?.({target:{value:option.value,name},currentTarget:{value:option.value,name}});setOpen(false);trigger.current?.focus()};
  const move=(direction)=>{let next=active;for(let i=0;i<options.length;i++){next=(next+direction+options.length)%options.length;if(!options[next].disabled){setActive(next);break}}};
  const keydown=(event)=>{
    if(disabled)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);return}
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();
      if(!open){setActive(index);setOpen(true);return}
      if(event.key==='ArrowDown')move(1);else if(event.key==='ArrowUp')move(-1);else if(event.key==='Home')setActive(0);else if(event.key==='End')setActive(options.length-1);else choose(options[active]);
    }else if(event.key==='Tab')setOpen(false);
    else if(event.key.length===1){const now=Date.now();search.current.text=now-search.current.time<600?search.current.text+event.key:event.key;search.current.time=now;const found=options.findIndex(o=>!o.disabled&&o.text.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));if(found>=0){setActive(found);if(!open)choose(options[found])}}
  };
  return <div className={'select-control '+className}>
    <button type="button" ref={trigger} className="select-button" role="combobox" aria-label={props['aria-label']||label||props.title||'Select option'} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?listId:undefined} aria-activedescendant={open?uid+'-option-'+active:undefined} disabled={disabled} onKeyDown={keydown} onClick={event=>{event.preventDefault();event.stopPropagation();setActive(index);setOpen(previous=>!previous)}}>
      <span>{options[index]?.label}</span><CaretDown size={20}/>
    </button>
    {name&&<input type="hidden" name={name} value={selected}/>}
    {open&&createPortal(<div ref={popup} role="listbox" id={listId} aria-label={props['aria-label']||label||'Options'} className="select-menu" style={position}>
      {options.map((option,i)=><button type="button" tabIndex={-1} id={uid+'-option-'+i} key={option.value} role="option" aria-selected={selected===option.value} disabled={option.disabled} className={'select-option '+(active===i?'highlighted':'')} onMouseMove={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option)}><span>{option.label}</span>{selected===option.value&&<Check size={19}/>}</button>)}
    </div>,document.body)}
  </div>
}
