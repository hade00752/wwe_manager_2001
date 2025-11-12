import { RAW, SD, FA, clamp } from '../util.js';
import { setChampionFlags } from './champions.js';
import { registerFinancialAdjustment } from './finances.js';
import { pushMail } from './mail.js';

const MIN_SALARY = 1_200;
const DEFAULT_WEEKS = 52;
const SIGNING_BONUS_MULT = 4; // signing bonus paid upfront in weeks of salary
const EXTENSION_BONUS_DIVISOR = 13; // roughly quarterly loyalty bonuses

function toInt(n){
  const num = Number(n);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function normalizeRoleInput(role){
  const key = String(role || '').toLowerCase();
  if (key === 'wrestler' || key === 'active') return 'active';
  if (key === 'manager') return 'manager';
  if (key === 'mentor') return 'mentor';
  if (key === 'personality') return 'personality';
  return 'manager';
}

function overallEstimate(w){
  const promoLike = ((w.charisma ?? 60) + (w.mic ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons = w.consistency ?? 60;
  const workrate = w.workrate ?? 60;
  const star = w.starpower ?? 60;
  const mom = w.momentum ?? 60;
  const value = workrate * 0.30 + star * 0.25 + promoLike * 0.15 + mom * 0.10 + psych * 0.10 + cons * 0.10;
  return clamp(Math.round(value), 1, 99);
}

function computeSalary(w){
  const overall = overallEstimate(w);
  const base = 800 + overall * 110; // 800..~13k
  const draw = Math.max(0, (w.starpower ?? 60) - 60) * 110;
  const momentum = Math.max(0, (w.momentum ?? 60) - 55) * 45;
  const salary = base + draw + momentum;
  return Math.max(MIN_SALARY, Math.round(salary));
}

export function estimateContractValue(w){
  return computeSalary(w);
}

export function setRole(w, role){
  const allowed = new Set(['active','manager','mentor','personality','retired']);
  const normalized = normalizeRoleInput(role);
  w.role = allowed.has(normalized) ? normalized : 'retired';
}

export function ensureContract(w){
  if (!w) return null;
  if (!w.contract || typeof w.contract !== 'object'){
    w.contract = {
      salary: computeSalary(w),
      weeksRemaining: w.brand === FA ? 0 : DEFAULT_WEEKS,
      type: w.brand === FA ? 'free' : 'exclusive',
      history: [],
      warnedAtFourWeeks: null,
      lastActionWeek: null,
    };
    return w.contract;
  }
  const c = w.contract;
  c.salary = Math.max(MIN_SALARY, toInt(c.salary ?? computeSalary(w)));
  if (!Number.isFinite(c.weeksRemaining)){
    c.weeksRemaining = w.brand === FA ? 0 : DEFAULT_WEEKS;
  }
  c.weeksRemaining = clamp(Math.round(c.weeksRemaining), 0, 520);
  c.type = c.type || (w.brand === FA ? 'free' : 'exclusive');
  if (!Array.isArray(c.history)) c.history = [];
  if (!('warnedAtFourWeeks' in c)) c.warnedAtFourWeeks = null;
  if (!('lastActionWeek' in c)) c.lastActionWeek = null;
  if (w.brand === FA && c.weeksRemaining !== 0) c.weeksRemaining = 0;
  if (c.salary < MIN_SALARY) c.salary = MIN_SALARY;
  return c;
}

export function signToBrand(state, name, brand, role='manager'){
  const w = state.roster.find(x => x.name === name);
  if (!w) return false;
  if (![RAW, SD, FA].includes(brand)) return false;

  if (brand === FA){
    return releaseToFA(state, name);
  }

  const normalizedRole = normalizeRoleInput(role);
  w.brand = brand;
  setRole(w, normalizedRole);
  w.retired = false;
  const contract = ensureContract(w);
  if (contract.weeksRemaining === 0) contract.weeksRemaining = DEFAULT_WEEKS;
  contract.type = 'exclusive';
  contract.warnedAtFourWeeks = null;
  contract.lastActionWeek = state.week;
  setChampionFlags(state);
  return true;
}

export function releaseToFA(state, name){
  const w = state.roster.find(x => x.name === name);
  if (!w) return false;
  w.brand = FA;
  setRole(w, w.retired ? 'retired' : (w.role || 'retired'));
  const contract = ensureContract(w);
  contract.type = 'free';
  contract.weeksRemaining = 0;
  contract.warnedAtFourWeeks = null;
  contract.lastActionWeek = state.week;
  setChampionFlags(state);
  return true;
}

export function offerContract(state, name, brand, options={}){
  const w = state.roster.find(x => x.name === name);
  if (!w) return false;
  if (![RAW, SD].includes(brand)) return false;

  const weeksRaw = Number(options.weeks ?? DEFAULT_WEEKS);
  const weeks = clamp(Math.round(Number.isFinite(weeksRaw) ? weeksRaw : DEFAULT_WEEKS), 4, 260);
  const salaryRaw = Number(options.salary);
  const salary = Math.max(MIN_SALARY, Number.isFinite(salaryRaw) && salaryRaw > 0 ? Math.round(salaryRaw) : computeSalary(w));
  const role = normalizeRoleInput(options.role || 'active');

  w.brand = brand;
  w.retired = false;
  setRole(w, role);

  const contract = ensureContract(w);
  contract.salary = salary;
  contract.weeksRemaining = weeks;
  contract.type = options.type || 'exclusive';
  contract.history.push({ week: state.week, action: 'signed', weeks, salary });
  contract.warnedAtFourWeeks = null;
  contract.lastActionWeek = state.week;

  registerFinancialAdjustment(state, brand, -salary * SIGNING_BONUS_MULT, `Signing bonus for ${w.name}`);
  setChampionFlags(state);

  if (state.brand === brand){
    pushMail(state, {
      title: `${w.name} signs with ${brand}`,
      from: 'Talent Relations',
      body: `${w.name} agreed to a ${weeks}-week deal worth ${formatMoney(salary)} per week.`,
      names: [w.name],
    });
  }

  return true;
}

export function extendContract(state, name, extraWeeks, newSalary){
  const w = state.roster.find(x => x.name === name);
  if (!w) return false;
  const contract = ensureContract(w);
  if (w.brand === FA) return false;

  const weeksRaw = Number(extraWeeks);
  const weeks = clamp(Math.round(Number.isFinite(weeksRaw) ? weeksRaw : 0), 4, 260);
  if (weeks <= 0) return false;

  const salaryRaw = Number(newSalary);
  const salary = Math.max(MIN_SALARY, Number.isFinite(salaryRaw) && salaryRaw > 0 ? Math.round(salaryRaw) : contract.salary);

  contract.weeksRemaining += weeks;
  contract.salary = salary;
  contract.type = contract.type || 'exclusive';
  contract.history.push({ week: state.week, action: 'extended', weeks, salary });
  contract.warnedAtFourWeeks = null;
  contract.lastActionWeek = state.week;

  const bonusBlocks = Math.max(1, Math.round(weeks / EXTENSION_BONUS_DIVISOR));
  registerFinancialAdjustment(state, w.brand, -salary * bonusBlocks, `Extension bonus for ${w.name}`);

  if (state.brand === w.brand){
    pushMail(state, {
      title: `${w.name} contract extended`,
      from: 'Talent Relations',
      body: `${w.name} is locked in for ${contract.weeksRemaining} more weeks at ${formatMoney(salary)} per week.`,
      names: [w.name],
    });
  }

  return true;
}

export function weeklyContractTick(state){
  const roster = state.roster || [];
  const playerBrand = state.brand || RAW;
  for (const w of roster){
    const contract = ensureContract(w);
    if (w.brand === FA) continue;
    if (contract.weeksRemaining > 0){
      contract.weeksRemaining = Math.max(0, contract.weeksRemaining - 1);
      if (contract.weeksRemaining === 4 && contract.warnedAtFourWeeks !== state.week){
        contract.warnedAtFourWeeks = state.week;
        if (w.brand === playerBrand){
          pushMail(state, {
            title: `${w.name} nearing contract expiry`,
            from: 'Talent Relations',
            body: `${w.name} has four weeks remaining on their current deal. Consider offering an extension.`,
            names: [w.name],
          });
        }
      }
      if (contract.weeksRemaining === 0){
        const priorBrand = w.brand;
        releaseToFA(state, w.name);
        const refreshed = ensureContract(w);
        refreshed.history.push({ week: state.week, action: 'expired' });
        if (priorBrand === playerBrand){
          pushMail(state, {
            title: `${w.name} contract expired`,
            from: 'Talent Relations',
            body: `${w.name} is now a free agent after their deal lapsed.`,
            names: [w.name],
          });
        }
      }
    }
  }
}

function formatMoney(n){
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}
