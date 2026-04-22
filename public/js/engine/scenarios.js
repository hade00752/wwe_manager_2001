// public/js/engine/scenarios.js
// Rich, context-driven weekly scenarios for the Inbox.
// Emits mail objects {from,title,body,names,actions?} and NEVER mutates state.inbox.
// Brand-scoped, appearance-aware, with dedup + per-category throttling and smarter "left off" logic.

import { clamp } from '../util.js';
import {
  getPair, transitionState, REL_STATES,
  collectPairsFor, REL,
} from './relationships.js';

/* ------------------------------ helpers ------------------------------ */

const R = Math.random;
const pick = a => (a && a.length) ? a[Math.floor(R()*a.length)] : null;
function sample(arr, n){ if(!arr||!arr.length) return []; const a=arr.slice(),o=[]; while(o.length<n && a.length){ o.push(a.splice(Math.floor(R()*a.length),1)[0]); } return o; }

function W(state, name){ return (state.roster||[]).find(w => w.name === name) || null; }
const hasCore   = (w, k)=> !!w?.traits?.core?.includes(k);
const hasStatus = (w, k)=> !!w?.traits?.status?.includes(k);
const hasRare   = (w, k)=> !!w?.traits?.rare?.includes(k);

function onBrand(state, brand){ return (state.roster||[]).filter(w => w.brand === brand); }
function appearedSetFrom(ctx){ return new Set(Array.isArray(ctx?.appeared) ? ctx.appeared : []); }

function addMorale(state, name, delta){
  const w = W(state, name); if (!w) return 0;
  const before = Number(w.morale ?? 70);
  const after  = clamp(before + Number(delta||0), 0, 100);
  w.morale = after; return after - before;
}
function nudgePair(state, a, b, { trust=0, pressure=0, chem=0 }){
  if(!a||!b||a===b) return;
  const p = getPair(state, a, b);
  if(trust)    p.trust     = clamp((p.trust||0)+trust,   -50,+50);
  if(pressure) p.pressure  = clamp((p.pressure||0)+pressure, 0,100);
  if(chem)     p.chemistry = clamp((p.chemistry||0)+chem, -10,+10);
  transitionState(p);
}

function mail({ from='Backstage Report', title, body, names=[], actions=[], effects=[] }){
  return {
    from,
    title: String(title||'').trim(),
    body:  String(body||'').trim(),
    names: Array.isArray(names)?names.filter(Boolean):[],
    actions: Array.isArray(actions)?actions.map(a=>({ key:a.key, label:a.label, effects:a.effects||[] })):[],
    effects: Array.isArray(effects) ? effects : []
  };
}

/* -------------------------- light context --------------------------- */

function lastShowSegments(state){
  const h = Array.isArray(state.history) ? state.history[state.history.length-1] : null;
  return (h?.myShow?.segments || []).concat(h?.oppShow?.segments || []);
}
function recentWinners(state){
  const segs = lastShowSegments(state), winners=[];
  for(const seg of segs){
    (seg?.details?.winners || seg?.explain?.winners || seg?.debug?.winners || []).forEach(n=>{
      if (typeof n === 'string') winners.push(n);
    });
  }
  return winners;
}
function recentLosers(state){
  const segs = lastShowSegments(state), losers=[];
  for(const seg of segs){
    (seg?.details?.losers || seg?.explain?.losers || seg?.debug?.losers || []).forEach(n=>{
      if (typeof n === 'string') losers.push(n);
    });
  }
  return losers;
}
function titleChangesHappened(state){
  const segs = lastShowSegments(state);
  return segs.some(s => (s?.tags||[]).some(t => /title\s*change!?/i.test(t)));
}
function appearedInTagThisWeek(ctx, name){
  const segs = Array.isArray(ctx?.results) ? ctx.results : [];
  return segs.some(s => s.type==='tag' && Array.isArray(s.names) && s.names.includes(name));
}

/* ------------------- smartest "left off" bookkeeping ------------------- */
function getSCN(state){
  state._scn = state._scn || { absences:{}, cool:{}, weekSeen:0 };
  return state._scn;
}
function markAppearances(state, brand, ctx){
  const scn = getSCN(state);
  scn.absences[brand] = scn.absences[brand] || {};
  const seen = appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if (w.injuryWeeks > 0) { scn.absences[brand][w.name] = 0; return; }
    if (seen.has(w.name)) scn.absences[brand][w.name] = 0;
    else scn.absences[brand][w.name] = (scn.absences[brand][w.name]||0) + 1;
  });
  scn.weekSeen = state.week;
}
function canComplain(state, brand, name){
  const scn = getSCN(state);
  scn.cool[brand] = scn.cool[brand] || {};
  const nextOk = scn.cool[brand][name] || 0;
  return state.week >= nextOk;
}
function setComplaintCooldown(state, brand, name, cooldownWks=3){
  const scn = getSCN(state);
  scn.cool[brand] = scn.cool[brand] || {};
  scn.cool[brand][name] = (state.week|0) + cooldownWks;
}
/* ----------------------- scenario emitters ----------------------- */
/* All emitters accept (state, brand, ctx, out) and are brand-scoped.  */

function evLeftOffShowComplaints(state, brand, ctx, out, limit=3){
  const appeared = appearedSetFrom(ctx);
  const scn = getSCN(state);
  const abs = scn.absences[brand] || {};
  let count=0;

  onBrand(state, brand).forEach(w=>{
    if (count >= limit) return;
    if (w.injuryWeeks > 0) return;                // injured: no complaint
    if (hasStatus(w,'AuthorityFigure')) return;   // non-wrestler role: ignore
    if (appeared.has(w.name)) return;             // they worked: no complaint
    if (!canComplain(state, brand, w.name)) return;

    const weeksMissed = abs[w.name] || 0;

    // Only complain if:
    //  1) missed 2+ weeks, OR
    //  2) missed 1 week AND is a star (star power 85+) OR high momentum (70+).
    // And gate by morale/probability so low-carders with cold momentum rarely whine.
    const star = (w.starpower|0) >= 85;
    const hot  = (w.momentum|0)  >= 70;
    const gate =
      (weeksMissed >= 2) ||
      (weeksMissed >= 1 && (star || hot));

    if (!gate) return;

    // probability scaled by status/morale:
    const m = Number(w.morale ?? 70);
    let p = 0.10 + (weeksMissed * 0.07);
    if (star) p += 0.10;
    if (hot)  p += 0.05;
    if (m < 35) p += 0.08;
    if (R() >= p) return;

    out.push(mail({
      from: w.name,
      title: 'Left Off The Show',
      body: `I wasn’t used on this week’s show. I need TV time.`,
      names: [w.name],
      actions: [
        { key:'promise', label:'PROMISE A MATCH NEXT WEEK', effects:[{kind:'w', name:w.name, stat:'morale', delta:+6}] },
        { key:'explain', label:'EXPLAIN ROTATION', effects:[{kind:'w', name:w.name, stat:'morale', delta:+1}] },
      ]
    }));
    setComplaintCooldown(state, brand, w.name, 3);
    count++;
  });
}

function evWorkhorsePraise(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx), wins=new Set(recentWinners(state));
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Workhorse')) return;
    const saw = appeared.has(w.name) || wins.has(w.name);
    if (saw && R()<0.12){
      out.push(mail({ from:'Coaches Room', title:'Work Ethic Praised', body:`Coaches praised ${w.name}'s work ethic this week.`, names:[w.name], effects:[{ kind:'w', name:w.name, stat:'morale', delta:+3 }] }));
    }
  });
}

function evPolitickerManeuver(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Politicker')) return;
    if(R()<0.12){
      const pool=onBrand(state,brand).filter(x=>x.name!==w.name);
      const target=pick(pool); if(!target) return;
      out.push(mail({ from:'Agent Note', title:'Backstage Politics', body:`${w.name} lobbied backstage against ${target.name}'s push.`, names:[w.name, target.name]}));
      nudgePair(state, w.name, target.name, { trust:-3, pressure:+6 });
      addMorale(state, target.name, -2);
    }
  });
}

function evHotheadAltercation(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Hothead')) return;
    if(R()<0.08){
      const other=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!other) return;
      out.push(mail({ title:'Heated Altercation', body:`A heated argument between ${w.name} and ${other.name} nearly turned physical.`, names:[w.name, other.name]}));
      nudgePair(state, w.name, other.name, { trust:-4, pressure:+8 });
      addMorale(state, w.name, -2); addMorale(state, other.name, -2);
    }
  });
}

function evLockerRoomLeaderSpeech(state, brand, ctx, out){
  onBrand(state, brand).filter(w=>hasCore(w,'LockerRoomLeader')).forEach(cap=>{
    if(R()<0.20){
      const crew=sample(onBrand(state,brand).filter(x=>x.name!==cap.name),5);
      if(!crew.length) return;
      out.push(mail({ title:'Locker Room Address', body:`${cap.name} rallied the locker room with a speech about professionalism.`, names:[cap.name, ...crew.map(c=>c.name)] }));
      crew.forEach(c=>addMorale(state,c.name,+2));
    }
  });
}

function evChampionJealousy(state, brand, ctx, out){
  onBrand(state, brand).forEach(ch=>{
    if(!hasStatus(ch,'Champion')) return;
    if(R()<0.12){
      const jealous=pick(onBrand(state,brand).filter(x=>!hasStatus(x,'Champion') && x.name!==ch.name));
      if(!jealous) return;
      out.push(mail({ title:'Title Spotlight Jealousy', body:`${jealous.name} is jealous of ${ch.name}'s title spotlight.`, names:[ch.name, jealous.name] }));
      nudgePair(state, jealous.name, ch.name, { trust:-3, pressure:+10 });
      addMorale(state, jealous.name, -2);
    }
  });
}

function evFanFavoritePop(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx), wins=new Set(recentWinners(state));
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'FanFavorite')) return;
    const saw = appeared.has(w.name) || wins.has(w.name);
    if (saw && R()<0.14){
      out.push(mail({ from:'Fan Desk', title:'Fan Buzz', body:`Fans are buzzing about ${w.name} after that performance.`, names:[w.name] }));
      addMorale(state, w.name, +3);
    }
  });
}

function evHeatMagnetBacklash(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'HeatMagnet')) return;
    if(R()<0.10){
      out.push(mail({ title:'Online Backlash', body:`${w.name} drew heavy backlash online this week.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}

function evUnsafeWorkerIncident(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'UnsafeWorker')) return;
    if(R()<0.08){
      const victim=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!victim) return;
      out.push(mail({ title:'Safety Concern', body:`Safety concern raised: ${w.name}'s stiffness worried ${victim.name}.`, names:[w.name, victim.name] }));
      nudgePair(state, w.name, victim.name, { trust:-5, pressure:+6 });
      addMorale(state, victim.name, -3);
    }
  });
}

function evSafeWorkerTrustBump(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'SafeWorker')) return;
    if(R()<0.10){
      const partner=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!partner) return;
      out.push(mail({ title:'Ring Safety Praised', body:`${partner.name} praised ${w.name}'s ring safety.`, names:[w.name, partner.name] }));
      nudgePair(state, w.name, partner.name, { trust:+3 });
      addMorale(state, w.name, +1);
    }
  });
}

function evTrainerSession(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Trainer')) return;
    if(R()<0.14){
      const rook=pick(onBrand(state,brand).filter(x=>hasCore(x,'Rookie'))); if(!rook) return;
      out.push(mail({ title:'Extra Ring Session', body:`${w.name} ran an extra session with ${rook.name}.`, names:[w.name, rook.name] }));
      nudgePair(state, w.name, rook.name, { trust:+4, chem:+1 });
      addMorale(state, rook.name, +2);
    }
  });
}
function evMentorVeteran(state, brand, ctx, out){
  onBrand(state, brand).filter(w=>hasCore(w,'Veteran')).forEach(v=>{
    if(R()<0.10){
      const rook=pick(onBrand(state,brand).filter(x=>hasCore(x,'Rookie'))); if(!rook) return;
      out.push(mail({ title:'Veteran Advice', body:`${v.name} offered advice to ${rook.name} — good vibes.`, names:[v.name, rook.name] }));
      nudgePair(state, v.name, rook.name, { trust:+3 });
      addMorale(state, rook.name, +2);
    }
  });
}

function evRookieWobbles(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Rookie')) return;
    if(R()<0.10){
      out.push(mail({ title:'Rookie Wobbles', body:`${w.name} is struggling with the weekly grind.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}
function evBatteredBodyNiggle(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'BatteredBody')) return;
    if(R()<0.10){
      out.push(mail({ title:'Nagging Aches', body:`${w.name} reported nagging aches after the long match.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}

function evWalkoutThreat(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'WalkoutRisk')) return;
    if((w.morale|0) < 35 && R()<0.10){
      out.push(mail({ from:w.name, title:'Walkout Threat', body:`If things don't improve, I might walk.`, names:[w.name] }));
    }
  });
}
function evCompanyGuyPraise(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'CompanyGuy')) return;
    if(R()<0.10){
      out.push(mail({ title:'Dependability Praised', body:`Management praised ${w.name} for being dependable.`, names:[w.name] }));
      addMorale(state, w.name, +3);
    }
  });
}
function evCourtFavoriteResentment(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'CourtFavorite')) return;
    if(R()<0.14){
      const peer=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!peer) return;
      out.push(mail({ title:'Resentment Brews', body:`${peer.name} resents the preferential treatment ${w.name} receives.`, names:[peer.name, w.name] }));
      nudgePair(state, peer.name, w.name, { trust:-3, pressure:+4 });
    }
  });
}

function evCreativeFreedomPitch(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(hasRare(w,'CreativeFreedom') && R()<0.15)
      out.push(mail({ title:'Creative Pitch', body:`${w.name} pitched a creative idea they want to try on TV.`, names:[w.name] }));
  });
}
function evCreativePunishmentGrumble(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(hasRare(w,'CreativePunishment') && R()<0.12){
      out.push(mail({ title:'Creative Grumble', body:`${w.name} is unhappy with recent creative direction.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}
function evOverachieverBuzz(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(hasRare(w,'Overachiever') && R()<0.12){
      out.push(mail({ title:'Overachiever Buzz', body:`${w.name} is getting buzz for punching above their weight.`, names:[w.name] }));
      addMorale(state, w.name, +2);
    }
  });
}
function evUnderachieverConcern(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(hasRare(w,'Underachiever') && R()<0.10){
      out.push(mail({ title:'Producer Concern', body:`Producers are concerned ${w.name} isn't hitting expectations.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}

function evTagPartnerDrift(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    const rows = collectPairsFor(state, w.name).slice(0,6);
    for(const r of rows){
      if((r.pair?.state||'')==='CloseFriends' && R()<0.05){
        out.push(mail({ title:'Bond Fading', body:`${w.name} and ${r.other} haven't teamed in a while — bond fading.`, names:[w.name, r.other] }));
        nudgePair(state, w.name, r.other, { trust:-2 });
      }
    }
  });
}
function evStableErosion(state, brand, ctx, out){
  if(!Array.isArray(state.relationships)) return;
  for(const e of state.relationships){
    if (e?.type!==REL.STABLE || (e.level||0)<=20) continue;
    const a=W(state,e.a), b=W(state,e.b);
    if(!a || !b) continue;
    if(a.brand!==brand && b.brand!==brand) continue; // brand-scope
    if(R()<0.05){
      out.push(mail({ title:'Stable Rapport Cooling', body:`The ${e.a}/${e.b} stable rapport is cooling off.`, names:[e.a,e.b] }));
      e.level = Math.max(0, (e.level|0) - 4);
    }
  }
}

function evApologyAttempt(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'ProfessionalRivalSeeker') && !hasCore(w,'CompanyGuy')) return;
    if(R()<0.08){
      const rows = collectPairsFor(state, w.name).filter(r => r.pair?.state===REL_STATES.TenseRivals || r.pair?.state===REL_STATES.Dislike);
      const t = pick(rows); if (!t) return;
      out.push(mail({ title:'Apology Attempt', body:`${w.name} tried to clear the air with ${t.other}.`, names:[w.name, t.other] }));
      nudgePair(state, w.name, t.other, { trust:+3, pressure:-4 });
      addMorale(state, w.name, +1);
    }
  });
}
function evReconciliation(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(R()<0.05){
      const rows = collectPairsFor(state, w.name).filter(r => r.pair?.state===REL_STATES.Dislike);
      const t = pick(rows); if (!t) return;
      out.push(mail({ title:'Professional Truce', body:`${w.name} and ${t.other} agreed to be professional going forward.`, names:[w.name, t.other] }));
      nudgePair(state, w.name, t.other, { trust:+2, pressure:-2 });
    }
  });
}

function evPranksterRib(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'Prankster')) return;
    if(R()<0.10){
      const target = pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!target) return;
      const good = R()<0.5;
      out.push(mail({ title:'Backstage Rib', body:`${w.name} ribbed ${target.name} backstage.`, names:[w.name, target.name] }));
      nudgePair(state, w.name, target.name, { trust: good?+2 : -2 });
      addMorale(state, target.name, good? +1 : -2);
    }
  });
}
function evMediaFriendlySpot(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasCore(w,'MediaFriendly')) return;
    if(appeared.has(w.name) && R()<0.12){
      out.push(mail({ from:'PR Desk', title:'Media Duties', body:`${w.name} did well on media duties — positive exposure.`, names:[w.name] }));
    }
  });
}
function evNoShowScare(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasCore(w,'NoShowRisk') && R()<0.06) out.push(mail({ title:'Late Arrival', body:`${w.name} cut it close arriving to the building — worried staff.`, names:[w.name] })); });
}
function evPartierHangover(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasCore(w,'Partier') && R()<0.10){ out.push(mail({ title:'Discipline Chat', body:`${w.name} looked rough at call time — talk from agents.`, names:[w.name] })); addMorale(state,w.name,-2);} });
}
function evStraightEdgePraise(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasCore(w,'StraightEdge') && R()<0.10){ out.push(mail({ title:'Professional Example', body:`${w.name}'s professionalism set a good example this week.`, names:[w.name] })); addMorale(state,w.name,+2);} });
}
function evShowmanIdea(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasCore(w,'Showman') && R()<0.12) out.push(mail({ title:'Flashy Idea', body:`${w.name} pitched a flashy segment idea.`, names:[w.name] })); });
}
function evInnovatorConcept(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasCore(w,'Innovator') && R()<0.12) out.push(mail({ title:'New Spot Prototype', body:`${w.name} prototyped a new spot/finish to try on house shows.`, names:[w.name] })); });
}

function evTagSpecialistAnnoyed(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasStatus(w,'TagTeamSpecialist')) return;
    if(!appeared.has(w.name)) return;                // didn’t work → no opinion
    if(appearedInTagThisWeek(ctx, w.name)) return;   // they did tag → happy
    if(R()<0.12){
      out.push(mail({
        from:w.name,
        title:'Wants More Tag Matches',
        body:`I feel adrift as a singles. Can I get more tag time?`,
        names:[w.name],
        actions:[
          { key:'promiseTag', label:'PROMISE TAG NEXT WEEK', effects:[{kind:'w', name:w.name, stat:'morale', delta:+6}] },
          { key:'decline',    label:'EXPLAIN CREATIVE',     effects:[{kind:'w', name:w.name, stat:'morale', delta:0}] }
        ]
      }));
    }
  });
}

function evAuthorityFigureEdict(state, brand, ctx, out){
  onBrand(state, brand).filter(w=>hasStatus(w,'AuthorityFigure')).forEach(boss=>{
    if(R()<0.15){
      const picks=sample(onBrand(state,brand),3);
      out.push(mail({ from:boss.name, title:'Locker Room Edict', body:`${boss.name} set strict notes for next week — tighten execution.`, names:[boss.name, ...picks.map(p=>p.name)] }));
      picks.forEach(p=>addMorale(state,p.name,-1));
    }
  });
}
function evBrandCaptainBoost(state, brand, ctx, out){
  onBrand(state, brand).filter(w=>hasStatus(w,'BrandCaptain')).forEach(c=>{
    if(R()<0.15){
      const crew=sample(onBrand(state,brand).filter(x=>x.name!==c.name),4);
      out.push(mail({ title:'Captain’s Check-in', body:`${c.name} checked in on morale — squad feels supported.`, names:[c.name, ...crew.map(k=>k.name)] }));
      crew.forEach(p=>addMorale(state,p.name,+2));
    }
  });
}

function evComebackTourPop(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasStatus(w,'ComebackTour') && R()<0.12){ out.push(mail({ title:'Return Tour Pop', body:`${w.name}'s return storyline is landing with fans.`, names:[w.name] })); addMorale(state,w.name,+3);} });
}
function evInjuryReturnPop(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasRare(w,'InjuryReturnPop') && R()<0.14){ out.push(mail({ title:'Nice Pop on Return', body:`${w.name} got a nice pop after recovering.`, names:[w.name] })); addMorale(state,w.name,+2);} });
}
function evHotStreakAcclaim(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{ if(hasRare(w,'HotStreak') && R()<0.16){ out.push(mail({ title:'On a Heater', body:`${w.name} is on a heater — buzz is growing.`, names:[w.name] })); addMorale(state,w.name,+2);} });
}
function evColdStreakSlump(state, brand, ctx, out){
  const losses = new Set(recentLosers(state));
  onBrand(state, brand).forEach(w=>{
    const manyLosses = losses.has(w.name);
    if(hasRare(w,'ColdStreak') || manyLosses){
      if(R()<0.14){ out.push(mail({ title:'Confidence Dipping', body:`${w.name} is in a slump — confidence dipping.`, names:[w.name] })); addMorale(state,w.name,-2); }
    }
  });
}

function evRomanceBookedApart(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasStatus(w,'Lovers') && !hasStatus(w,'Married')) return;
    if(R()<0.08){
      const partners=collectPairsFor(state,w.name).filter(r=>r.pair?.romance?.lovers || r.pair?.romance?.married);
      const t=pick(partners); if(!t) return;
      if(!(appeared.has(w.name) || appeared.has(t.other))) return;
      out.push(mail({ title:'Couple Wants Time', body:`${w.name} and ${t.other} want some on-screen time together.`, names:[w.name, t.other] }));
      nudgePair(state,w.name,t.other,{trust:+2});
    }
  });
}

function evShootIncident(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'ShootIncident')) return;
    if(R()<0.10){
      const other=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!other) return;
      out.push(mail({ title:'Shoot Rumors', body:`Rumors of a stiff/shoot moment between ${w.name} and ${other.name}.`, names:[w.name, other.name] }));
      nudgePair(state,w.name,other.name,{trust:-3,pressure:+6});
    }
  });
}
function evSandbaggerDrama(state, brand, ctx, out){
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'Sandbagger')) return;
    if(R()<0.10){
      const other=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!other) return;
      out.push(mail({ title:'Sandbagging Accusation', body:`${w.name} was accused of sandbagging by ${other.name}.`, names:[w.name, other.name] }));
      nudgePair(state,w.name,other.name,{trust:-4}); addMorale(state,other.name,-2);
    }
  });
}
function evWorkrateBuzz(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'WorkrateBuzz')) return;
    if(appeared.has(w.name) && R()<0.16){
      out.push(mail({ title:'Workrate Praise', body:`Insiders praised ${w.name}'s ring work this week.`, names:[w.name] }));
      addMorale(state, w.name, +2);
    }
  });
}
function evBotchNight(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'BotchNight')) return;
    if(appeared.has(w.name) && R()<0.14){
      out.push(mail({ title:'Off Night', body:`${w.name} had an off night — needs a reset.`, names:[w.name] }));
      addMorale(state, w.name, -2);
    }
  });
}
function evNoSellControversy(state, brand, ctx, out){
  const appeared=appearedSetFrom(ctx);
  onBrand(state, brand).forEach(w=>{
    if(!hasRare(w,'NoSellControversy')) return;
    if(!appeared.has(w.name)) return;
    const other=pick(onBrand(state,brand).filter(x=>x.name!==w.name)); if(!other) return;
    if(R()<0.12){
      out.push(mail({ title:'No-Sell Complaint', body:`${other.name} felt ${w.name} no-sold them during the match.`, names:[w.name, other.name] }));
      nudgePair(state,w.name,other.name,{trust:-3,pressure:+4});
    }
  });
}

export function generateScenarioEvents(state, brand, ctx = {}) {
  // brand-scoped absence memory for smarter "left off"
  markAppearances(state, brand, ctx);

  // small global nudges from results (also brand-scoped)
  try{
    const wins=new Set(recentWinners(state));
    const losses=new Set(recentLosers(state));
    onBrand(state, brand).forEach(w=>{
      if(wins.has(w.name))   addMorale(state, w.name, +1);
      if(losses.has(w.name)) addMorale(state, w.name, -1);
    });
  }catch{}

  const out = [];

  if (titleChangesHappened(state)) {
    out.push(mail({ title:'Title Change Buzz', body:'Locker room buzzing after a title change this week.' }));
  }

  // ---- reactive first
  evLeftOffShowComplaints(state, brand, ctx, out, 3);
  evTagSpecialistAnnoyed(state, brand, ctx, out);

  // ---- trait/status colour
  evWorkhorsePraise(state, brand, ctx, out);
  evFanFavoritePop(state, brand, ctx, out);
  evMediaFriendlySpot(state, brand, ctx, out);

  evPolitickerManeuver(state, brand, ctx, out);
  evHotheadAltercation(state, brand, ctx, out);
  evLockerRoomLeaderSpeech(state, brand, ctx, out);
  evChampionJealousy(state, brand, ctx, out);

  evUnsafeWorkerIncident(state, brand, ctx, out);
  evSafeWorkerTrustBump(state, brand, ctx, out);

  evTrainerSession(state, brand, ctx, out);
  evMentorVeteran(state, brand, ctx, out);
  evRookieWobbles(state, brand, ctx, out);
  evBatteredBodyNiggle(state, brand, ctx, out);

  evWalkoutThreat(state, brand, ctx, out);
  evCompanyGuyPraise(state, brand, ctx, out);
  evCourtFavoriteResentment(state, brand, ctx, out);

  evCreativeFreedomPitch(state, brand, ctx, out);
  evCreativePunishmentGrumble(state, brand, ctx, out);
  evOverachieverBuzz(state, brand, ctx, out);
  evUnderachieverConcern(state, brand, ctx, out);

  evTagPartnerDrift(state, brand, ctx, out);
  evStableErosion(state, brand, ctx, out);
  evApologyAttempt(state, brand, ctx, out);
  evReconciliation(state, brand, ctx, out);

  evPranksterRib(state, brand, ctx, out);
  evNoShowScare(state, brand, ctx, out);
  evPartierHangover(state, brand, ctx, out);
  evStraightEdgePraise(state, brand, ctx, out);

  evShowmanIdea(state, brand, ctx, out);
  evInnovatorConcept(state, brand, ctx, out);

  evAuthorityFigureEdict(state, brand, ctx, out);
  evBrandCaptainBoost(state, brand, ctx, out);

  evComebackTourPop(state, brand, ctx, out);
  evInjuryReturnPop(state, brand, ctx, out);
  evHotStreakAcclaim(state, brand, ctx, out);
  evColdStreakSlump(state, brand, ctx, out);

  evRomanceBookedApart(state, brand, ctx, out);
  evShootIncident(state, brand, ctx, out);
  evSandbaggerDrama(state, brand, ctx, out);
  evWorkrateBuzz(state, brand, ctx, out);
  evBotchNight(state, brand, ctx, out);
  evNoSellControversy(state, brand, ctx, out);

  // ---- de-noise
  const MAX_WEEKLY = 16;
  const seen = new Set();
  const uniq = out.filter(m=>{
    const sig = `${m.from}::${m.title}::${m.body}`;
    if (seen.has(sig)) return false; seen.add(sig); return true;
  });

  return (uniq.length > MAX_WEEKLY)
    ? uniq.sort(()=>Math.random()-0.5).slice(0, MAX_WEEKLY)
    : uniq;
}
