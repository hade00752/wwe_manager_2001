import {RAW} from "./util.js?v=1755554537";
import {newSeason, runShow, helpers} from "./engine.js?v=1755554537";

const out = document.getElementById('tests-root');
const log = [];
const assert=(name,cond)=>{ log.push(`${cond?"✅":"❌"} ${name}`); if(!cond) console.error(name); else console.log(name); };

(function run(){
  const state = newSeason(RAW);
  // 1) Mixed-gender singles error
  const Lita = helpers.byBrand(state, RAW).find(w=>w.name==="Lita").name;
  const Rock = helpers.byBrand(state, RAW).find(w=>w.name==="The Rock").name;
  let badSingles = {
    PreShow:{type:"singles",a:Lita,b:Rock},
    Opener:{type:"singles",a:Rock,b:Rock},
    Promo1:{type:"promo",speaker:Rock},
    Tag:{type:"tag",teams:[[Rock,Rock],[helpers.byBrand(state, RAW)[0].name, helpers.byBrand(state, RAW)[1].name]]},
    Promo2:{type:"promo",speaker:Rock},
    Match:{type:"singles",a:Rock,b:Rock},
    MainEvent:{type:"singles",a:Rock,b:Rock}
  };
  const t1=runShow(state, RAW, badSingles);
  assert("Mixed-gender singles disallowed", !!t1.error);

  // 2) Repeat penalty triggers
  const HHH=helpers.byBrand(state, RAW).find(w=>w.name==="Triple H").name;
  let b1={
    PreShow:{type:"singles",a:Lita,b:Lita},
    Opener:{type:"singles",a:Rock,b:HHH},
    Promo1:{type:"promo",speaker:Rock},
    Tag:{type:"tag",teams:[[Rock,HHH],[helpers.byBrand(state, RAW)[0].name, helpers.byBrand(state, RAW)[1].name]]},
    Promo2:{type:"promo",speaker:Rock},
    Match:{type:"singles",a:Rock,b:HHH},
    MainEvent:{type:"singles",a:Rock,b:HHH}
  };
  const r1=runShow(state, RAW, b1); state.lastWeekPairs[RAW]=r1.matchPairs;
  const r2=runShow(state, RAW, b1);
  const hadRepeat = r2.segments.some(s=> (s.tags||[]).some(t=>(""+t).includes("repeat")));
  assert("Repeat penalty applied", hadRepeat);

  // 3) Title toggle ignored if champ NOT present
  const Christian = helpers.byBrand(state, RAW).find(w=>w.name==="Christian").name;
  state.champs[RAW]["Intercontinental"]=Christian;
  let bogusIC={
    PreShow:{type:"singles",a:Lita,b:Lita},
    Opener:{type:"singles",a:Rock,b:HHH, championship:"Intercontinental"},
    Promo1:{type:"promo",speaker:Rock},
    Tag:{type:"tag",teams:[[Rock,HHH],[helpers.byBrand(state, RAW)[0].name, helpers.byBrand(state, RAW)[1].name]]},
    Promo2:{type:"promo",speaker:Rock},
    Match:{type:"singles",a:Rock,b:HHH},
    MainEvent:{type:"singles",a:Rock,b:HHH}
  };
  const before = state.champs[RAW]["Intercontinental"];
  runShow(state, RAW, bogusIC);
  assert("IC unchanged when champ absent", state.champs[RAW]["Intercontinental"]===before);

  // 4) Title can change when champ present (probabilistic, check valid holder)
  const RVD = helpers.byBrand(state, RAW).find(w=>w.name==="Rob Van Dam").name;
  state.champs[RAW]["Intercontinental"]=Christian;
  let legitIC={
    PreShow:{type:"singles",a:Lita,b:Lita},
    Opener:{type:"singles",a:RVD,b:Christian, championship:"Intercontinental"},
    Promo1:{type:"promo",speaker:RVD},
    Tag:{type:"tag",teams:[[Rock,HHH],[helpers.byBrand(state, RAW)[0].name, helpers.byBrand(state, RAW)[1].name]]},
    Promo2:{type:"promo",speaker:RVD},
    Match:{type:"singles",a:Rock,b:HHH},
    MainEvent:{type:"singles",a:Rock,b:HHH}
  };
  runShow(state, RAW, legitIC);
  assert("IC holder valid after match", [RVD, Christian].includes(state.champs[RAW]["Intercontinental"]));

  out.appendChild(document.createElement('pre')).textContent = log.join("\n");
})();
