import { RAW, SD, clamp } from '../util.js';

const FREE_AGENCY = 'FA'; // make sure data.js knows about this brand label

function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
function addDays(d, n){ const c=new Date(d.getTime()); c.setDate(c.getDate()+n); return c; }

export function processRetirements(state, brand){
  const start = (()=>{ // sim date today
    const s = state.startDate || '01-04-2001';
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    return m ? new Date(Number(m[3]), Number(m[2])-1, Number(m[1])) : new Date(2001,3,1);
  })();
  const today = addDays(start, ((state.week||1)-1)*7);

  const moved = [];

  // Vacate titles helper
  const vacateIfHolding = (name)=>{
    for (const b of [RAW, SD]) {
      for (const t in (state.champs[b]||{})) {
        const holder = state.champs[b][t];
        if (!holder) continue;
        if (Array.isArray(holder)) {
          if (holder.includes(name)) state.champs[b][t] = null;
        } else if (holder === name) {
          state.champs[b][t] = null;
        }
      }
    }
  };

  state.roster.forEach(w=>{
    if (brand && w.brand !== brand) return;

    // compute sim age
    let age=null;
    const dob = parseDDMMYYYY(w.birthday);
    if (dob) {
      age = today.getFullYear() - dob.getFullYear();
      const pre = (today.getMonth() < dob.getMonth()) ||
                  (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
      if(pre) age -= 1;
    }

    const hardRule = (age != null && age >= 51);
    const criticalPhys = (w.stamina ?? 100) < 10 || (w.durability ?? 100) < 10;

    if (hardRule || criticalPhys) {
      if (w.brand !== FREE_AGENCY) {
        vacateIfHolding(w.name);
        w.brand = FREE_AGENCY;
        w.championOf = null;
      }
      w.retired = true;
      moved.push(w.name);
    }
  });

  return moved;
}
