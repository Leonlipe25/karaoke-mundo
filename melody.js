// Comparação de afinação contra uma referência de notas cronometrada.
// O player do YouTube permanece oficial: não capturamos seu áudio.
// A referência é uma sequência compacta de notas cantadas pelo próprio usuário.
export const GUIDE_STEP_SEC = 0.30;
export const GUIDE_WINDOW_SEC = 0.40;
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
const hzMidi = hz => 69+12*Math.log2(hz/440);

export function buildMelodyGuide(samples) {
  if (!Array.isArray(samples)) return null;
  const bins=new Map();
  for(const m of samples.slice(0,28000)) {
    if(!Number.isFinite(m?.t)||m.t<0||m.t>14400||
       !Number.isFinite(m?.hz)||m.hz<75||m.hz>950||
       !Number.isFinite(m?.clarity)||m.clarity<0.70) continue;
    const bin=Math.round(m.t/GUIDE_STEP_SEC);
    const items=bins.get(bin)||[];
    if(items.length<10)items.push(hzMidi(m.hz));
    bins.set(bin,items);
  }
  const notes=[...bins].sort((a,b)=>a[0]-b[0]).map(([bin,values])=>{
    const x=values.sort((a,b)=>a-b);
    return { t:Number((bin*GUIDE_STEP_SEC).toFixed(2)), midi:Number(x[Math.floor(x.length/2)].toFixed(2)) };
  });
  // ~6s de voz distribuída: pouco material gera comparações pouco úteis.
  return notes.length>=20 ? notes.slice(0,15000) : null;
}
export function validMelodyGuide(notes) {
  return Array.isArray(notes)&&notes.length>=20&&notes.length<=15000
    &&notes.every((n,i)=>Number.isFinite(n.t)&&n.t>=0&&n.t<=14400
      &&Number.isFinite(n.midi)&&n.midi>=25&&n.midi<=110
      &&(i===0||n.t>notes[i-1].t));
}
export function newMelodyAttempt() {return {matches:new Map()};}
function nearestNoteIndex(notes, timeSec) {
  let low=0,high=notes.length;
  while(low<high){const mid=(low+high)>>1;if(notes[mid].t<timeSec)low=mid+1;else high=mid;}
  const a=low<notes.length?low:-1, b=low>0?low-1:-1;
  if(a<0)return b;
  if(b<0)return a;
  return Math.abs(notes[a].t-timeSec)<Math.abs(notes[b].t-timeSec)?a:b;
}
export function addMelodyMeasurement(state, notes, timeSec, measurement) {
  if(!state?.matches||!validMelodyGuide(notes)||!Number.isFinite(timeSec))return;
  if(measurement?.voice!==true||!Number.isFinite(measurement.hz)||
     measurement.hz<75||measurement.hz>950||measurement.clarity<0.70)return;
  const i=nearestNoteIndex(notes,timeSec);
  if(i<0||Math.abs(notes[i].t-timeSec)>GUIDE_WINDOW_SEC)return;
  const diff=Math.abs(hzMidi(measurement.hz)-notes[i].midi);
  // A oitava é tolerada parcialmente em vozes de tessituras diferentes.
  const octave=Math.min(Math.abs(diff-12),Math.abs(diff-24));
  const error=octave<diff ? octave : diff;
  const octavePenalty=octave<diff?.88:1;
  const quality=error<=.5?1:error<=1?.8:error<=2?.5:error<=3?.2:0;
  const result=quality*octavePenalty;
  state.matches.set(i,Math.max(result,state.matches.get(i)||0));
}
export function calculateMelodyAccuracy(state,notes,atTime) {
  if(!state?.matches||!validMelodyGuide(notes)||!Number.isFinite(atTime))return null;
  let expected=0,sum=0;
  for(let i=0;i<notes.length&&notes[i].t<=atTime+GUIDE_WINDOW_SEC;i++){
    expected++;
    sum+=state.matches.get(i)||0;
  }
  if(expected<10)return null;
  return {
    points:Math.round(clamp(100*sum/expected,0,100)),
    compared:expected,
    voiced:[...state.matches.keys()].filter(i=>i<expected).length,
  };
}
export function blendFunAndMelody(funPoints, melodyResult) {
  if(!melodyResult||!Number.isFinite(funPoints))return funPoints;
  return Math.round(clamp(funPoints*.3+melodyResult.points*.7,0,100));
}
