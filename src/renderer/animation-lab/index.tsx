import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayIcon, StopIcon, StarIcon, StarFilledIcon, ArrowRightIcon } from '@radix-ui/react-icons';
import CursorSpine from '../ui/CursorSpine';
import { getThemeCssVariables, WIDGET_THEME_OPTIONS, type WidgetTheme } from '../../shared/widget-themes';
import { MOTIONS, animateMotion, type Phase, type Motion } from './motions';
import '../ui/hud.css';
import '../ui/quiet-index.css';
import './lab.css';

const labels: Record<Phase,string> = { idle:'Ready', listening:'Listening', transcribing:'Transcribing', polishing:'Polishing', done:'Text inserted' };
function Stage({motion, phase, speed, reduced, theme, edge, baseline=false, begin, release}: {motion:Motion;phase:Phase;speed:number;reduced:boolean;theme:WidgetTheme;edge:'left'|'right';baseline?:boolean;begin:()=>void;release:()=>void}) {
  const ref=useRef<HTMLDivElement>(null); const toggle=useRef<HTMLButtonElement>(null); const previous=useRef<Phase>('idle');
  useEffect(()=>{
    if(!ref.current || baseline) return;
    animateMotion(ref.current,motion,phase,speed,reduced,previous.current);
    previous.current=phase;
  },[motion,phase,speed,reduced,baseline]);
  useEffect(()=>{if(toggle.current){toggle.current.setAttribute('aria-label','Hold widget to try');toggle.current.title='Hold to try';toggle.current.removeAttribute('aria-expanded');toggle.current.removeAttribute('aria-controls');}const el=ref.current; return ()=>el?.getAnimations({subtree:true}).forEach(a=>a.cancel());},[]);
  return <div className={`desktop ${baseline?'baseline':'motion-candidate'}`} data-phase={phase} data-reduced={reduced} style={getThemeCssVariables(theme) as CSSProperties}>
    <div className="desktop-top"><span>{baseline?'App · Afterglow':motion.name}</span><span>Desktop preview · 1× widget</span></div>
    <div className="writing"><span className="writing-label">A LITTLE SPACE TO THINK</span><h3>Let the words come.</h3><p>The best ideas arrive when<br/>you have room to speak.</p><div className={`sentence ${phase==='done'?'landed':''}`}>{phase==='done'?'Let’s make a little more room for good ideas.':<span className="text-cursor"/>}</div></div>
    <div className="widget-plane hud-root" ref={ref} data-widget-size="medium" onPointerDown={e=>{if((e.target as HTMLElement).closest('.spine-settings-trigger')){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);begin();}}} onPointerUp={release} onPointerCancel={release} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();begin();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();release();}}} onBlur={release}>
      <CursorSpine motion={baseline?'afterglow':'preview'} reduceMotion={reduced||theme==='high-contrast'} edge={edge} bookmarkOffset={{x:0,y:75}} status={phase==='done'?'polishing':phase} statusLabel={labels[phase]} opacity={100} settingsOpen={false} onToggleSettings={()=>{}} toggleRef={toggle}>{null}</CursorSpine>
    </div>
    <div className="desktop-bottom"><span>Hold. Speak. Release.</span><span className="status-readout">{labels[phase]}</span></div>
  </div>;
}

function App(){
  const [selected,setSelected]=useState(9);const [phase,setPhase]=useState<Phase>('idle');const [speed,setSpeed]=useState(1);const [compare,setCompare]=useState(false);
  const [theme,setTheme]=useState<WidgetTheme>('paper-ink');const [edge,setEdge]=useState<'left'|'right'>('right');
  const [systemReduced,setSystemReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches); const [reduce,setReduce]=useState(false);
  const [loop,setLoop]=useState(false); const [favorites,setFavorites]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('speakeasy-motion-shortlist')??'[]');return Array.isArray(saved)?saved.filter(x=>MOTIONS.some(m=>m.id===x)):[];}catch{return [];}});
  const timers=useRef<number[]>([]);const held=useRef(false);const motion=MOTIONS[selected];const reduced=systemReduced||reduce;
  const change=(value:Phase)=>{setPhase(value);};
  const clear=()=>{timers.current.forEach(window.clearTimeout);timers.current=[];};
  const later=(fn:()=>void,ms:number)=>{timers.current.push(window.setTimeout(fn,ms/speed));};
  const stop=()=>{clear();held.current=false;change('idle');};
  const finish=()=>{change('transcribing');later(()=>change('polishing'),2000);later(()=>change('done'),3400);later(()=>change('idle'),4800);};
  const replay=()=>{clear();held.current=false;change('idle');later(()=>change('listening'),250);later(finish,2950);};
  const begin=()=>{clear();held.current=true;change('listening');};
  const release=()=>{if(!held.current)return;held.current=false;clear();finish();};
  useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setSystemReduced(q.matches);q.addEventListener('change',sync);return()=>q.removeEventListener('change',sync);},[]);
  useEffect(()=>{stop();if(!reduced)replay();return clear;},[selected,speed,reduce,systemReduced]);
  useEffect(()=>{if(loop&&phase==='idle'){const timer=window.setTimeout(replay,1400/speed);return()=>clearTimeout(timer);}},[loop,phase,selected,speed]);
  useEffect(()=>{const blur=()=>{if(held.current){held.current=false;clear();change('idle');}};window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);clear();};},[]);
  useEffect(()=>{try{localStorage.setItem('speakeasy-motion-shortlist',JSON.stringify(favorites));}catch{/* The lab remains usable without storage. */}},[favorites]);
  const favorite=()=>setFavorites(list=>list.includes(motion.id)?list.filter(id=>id!==motion.id):[...list,motion.id]);
  const phaseStep=phase==='idle'?0:phase==='listening'?1:phase==='transcribing'?2:phase==='polishing'?3:4;
  return <main className="motion-lab">
    <header className="lab-heading"><a className="wordmark" href="../theme-lab/index.html">speakeasy<span>.</span></a><span className="edition">EXPLORATIONS / 02</span></header>
    <section className="intro"><div><p className="eyebrow">TEN STUDIES / AFTERGLOW SELECTED</p><h1>A little more <em>fluid.</em></h1></div><p>Press, speak, let go.<br/>Find the motion that feels like speakeasy.</p></section>
    <div className="lab-toolbar"><span className="lab-title">Animation lab <span>01—10</span></span><div className="toolbar-options">
      <label>Speed<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="1">1× · Natural</option><option value="0.5">0.5× · Slow</option><option value="0.25">0.25× · Study</option></select></label>
      <label>Theme<select value={theme} onChange={e=>setTheme(e.target.value as WidgetTheme)}>{WIDGET_THEME_OPTIONS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      <label>Edge<select value={edge} onChange={e=>setEdge(e.target.value as 'left'|'right')}><option value="right">Right</option><option value="left">Left</option></select></label>
    </div></div>
    <div className="workbench"><nav className="directions" aria-label="Animation directions">{MOTIONS.map((m,i)=><button key={m.id} className={i===selected?'chosen':''} aria-pressed={i===selected} onClick={()=>i===selected?replay():setSelected(i)}><span className="number">{String(i+1).padStart(2,'0')}</span><span><strong>{m.name}</strong><small>{m.character}</small></span>{favorites.includes(m.id)?<StarFilledIcon aria-label="Shortlisted"/>:<ArrowRightIcon className="direction-arrow"/>}</button>)}</nav>
      <section className="inspector" aria-label="Motion preview"><div className="preview-heading"><div><span className="eyebrow">STUDY {String(selected+1).padStart(2,'0')}</span><h2>{motion.name}</h2></div><button className="favorite" onClick={favorite} aria-pressed={favorites.includes(motion.id)}>{favorites.includes(motion.id)?<StarFilledIcon/>:<StarIcon/>}{favorites.includes(motion.id)?'Shortlisted':'Shortlist'}</button></div>

        <div className="transport"><button className={`hold ${phase==='listening'?'held':''}`} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);begin();}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();begin();}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();release();}}} onBlur={release}><span className="keycap">⌥</span>{phase==='listening'?'Release to transcribe':'Hold to try'}</button>
          <button onClick={replay}><PlayIcon/>Replay cycle</button><button className="stop" onClick={()=>{setLoop(false);stop();}} aria-label="Reset preview"><StopIcon/></button><label className="check"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>Loop</label>
        </div>
        <div className={`stages ${compare?'compare':''}`}><Stage key={motion.id} {...{motion,phase,speed,reduced,theme,edge,begin,release}}/>{compare&&<Stage {...{motion,phase,speed,reduced,theme,edge,begin,release}} baseline/>}</div>
        <div className="phase-track" aria-label="Dictation phase">{['Ready','Listening','Transcribing','Polishing','Inserted'].map((name,i)=><span key={name} className={i===phaseStep?'active':i<phaseStep?'past':''}>{name}</span>)}</div>
        <div className="motion-notes"><div><span className="eyebrow">ON PRESS · {motion.duration} MS</span><p>{motion.press}</p></div><div><span className="eyebrow">ON RELEASE</span><p>{motion.release}</p></div></div>
        <div className="preview-options"><label className="check"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>Compare with app Afterglow</label><label className="check"><input type="checkbox" checked={reduced} disabled={systemReduced} onChange={e=>setReduce(e.target.checked)}/>{systemReduced?'Reduced motion · system preference':'Reduced motion'}</label><span>Try the button with Space, too.</span></div>
      </section>
    </div>
    <section className="shortlist"><span className="eyebrow">YOUR SHORTLIST</span>{favorites.length?<p>{MOTIONS.filter(m=>favorites.includes(m.id)).map(m=><button key={m.id} onClick={()=>setSelected(MOTIONS.indexOf(m))}>{String(MOTIONS.indexOf(m)+1).padStart(2,'0')} / {m.name}<ArrowRightIcon/></button>)}</p>:<p>Save the ones you like, then tell me their numbers. We can mix a press from one with a release from another.</p>}</section>
    <footer>Interactive motion sketches using the current widget. Simulated speech and insertion; no microphone or service calls. Afterglow (10) is the selected app direction. The other studies remain here to explore.</footer>
  </main>;
}
const root=createRoot(document.getElementById('animation-lab')!);root.render(<App/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
