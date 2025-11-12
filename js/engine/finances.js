import { RAW, SD } from '../util.js';
import { pushMail } from './mail.js';

const STARTING_CASH = 5_000_000;
const HISTORY_LIMIT = 104; // keep roughly two seasons

const brandKeys = [RAW, SD];

function toInt(n){
  const num = Number(n);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function sumRecord(obj){
  return Object.values(obj).reduce((total, val) => total + toInt(val), 0);
}

export function defaultFinances(){
  const brand = {};
  for (const key of brandKeys){
    brand[key] = {
      cash: STARTING_CASH,
      revenue: 0,
      expenses: 0,
      adjustments: 0,
      warnedNegativeWeek: null,
    };
  }
  return {
    brand,
    weeks: [],
    pendingAdjustments: [],
  };
}

export function ensureFinances(state){
  if (!state.finances || typeof state.finances !== 'object'){
    state.finances = defaultFinances();
  }
  const fin = state.finances;
  if (!fin.brand || typeof fin.brand !== 'object') fin.brand = {};
  for (const key of brandKeys){
    if (!fin.brand[key] || typeof fin.brand[key] !== 'object'){
      fin.brand[key] = {
        cash: STARTING_CASH,
        revenue: 0,
        expenses: 0,
        adjustments: 0,
        warnedNegativeWeek: null,
      };
    } else {
      const rec = fin.brand[key];
      rec.cash = Number.isFinite(rec.cash) ? rec.cash : STARTING_CASH;
      rec.revenue = Number.isFinite(rec.revenue) ? rec.revenue : 0;
      rec.expenses = Number.isFinite(rec.expenses) ? rec.expenses : 0;
      rec.adjustments = Number.isFinite(rec.adjustments) ? rec.adjustments : 0;
      if (!('warnedNegativeWeek' in rec)) rec.warnedNegativeWeek = null;
    }
  }
  if (!Array.isArray(fin.weeks)) fin.weeks = [];
  if (!Array.isArray(fin.pendingAdjustments)) fin.pendingAdjustments = [];
  return fin;
}

export function financeTotals(state, brand){
  ensureFinances(state);
  const rec = state.finances.brand[brand];
  if (!rec) return { cash: 0, revenue: 0, expenses: 0, adjustments: 0, net: 0 };
  const net = rec.revenue - rec.expenses + rec.adjustments;
  return {
    cash: rec.cash,
    revenue: rec.revenue,
    expenses: rec.expenses,
    adjustments: rec.adjustments,
    net,
  };
}

export function financeReportForWeek(state, brand, week){
  ensureFinances(state);
  if (!Number.isFinite(week)) return null;
  for (let i = state.finances.weeks.length - 1; i >= 0; i--){
    const row = state.finances.weeks[i];
    if (row.brand === brand && row.week === week) return row;
  }
  return null;
}

export function registerFinancialAdjustment(state, brand, amount, reason, meta={}){
  ensureFinances(state);
  if (!brandKeys.includes(brand)) return;
  const entry = {
    week: state.week,
    brand,
    amount: toInt(amount),
    reason: reason || 'Adjustment',
    meta,
  };
  state.finances.pendingAdjustments.push(entry);
  return entry;
}

function rosterByBrand(state, brand){
  return (state.roster || []).filter(w => w.brand === brand);
}

function namesUsed(show){
  const out = new Set();
  (show?.segments || []).forEach(seg => {
    if (Array.isArray(seg.names)){
      seg.names.forEach(n => { if (n) out.add(n); });
    }
  });
  return out;
}

function mapRoster(state){
  const map = new Map();
  (state.roster || []).forEach(w => map.set(w.name, w));
  return map;
}

function computeBreakdown(state, brand, show){
  if (!show || show.error) return null;
  const rating = Number(show.tvRating ?? 6);
  const baseAttendance = 11000;
  const afterglow = state.afterglow && state.afterglow.ttl ? state.afterglow.ttl[brand] || 0 : 0;
  const attendance = Math.max(9000, Math.round(baseAttendance + rating * 900 + afterglow * 120));
  const ticketPrice = 45;
  const ticketRevenue = attendance * ticketPrice;
  const tvRevenue = Math.round(160_000 + Math.max(0, rating) * 65_000);

  const used = namesUsed(show);
  const roster = mapRoster(state);
  const usedWorkers = [...used].map(n => roster.get(n)).filter(Boolean);
  const starSum = usedWorkers.reduce((sum, w) => sum + (w.starpower ?? 60), 0);
  const merchRevenue = Math.round(starSum * 1_400);
  const sponsorship = Math.round(Math.max(0, afterglow) * 12_000);

  const revenue = {
    tickets: ticketRevenue,
    tv: tvRevenue,
    merch: merchRevenue,
    sponsorship,
  };

  const payroll = rosterByBrand(state, brand).reduce((sum, w) => {
    const salary = w.contract?.salary;
    return sum + (Number.isFinite(salary) ? salary : 0);
  }, 0);
  const production = Math.round(130_000 + attendance * 14);
  const travel = usedWorkers.length * 1_800;
  const medical = (show.injuries || []).reduce((sum, inj) => sum + Math.max(0, inj.weeks || 0) * 5_000, 0);

  const expenses = {
    payroll,
    production,
    travel,
    medical,
  };

  return {
    revenue,
    expenses,
    rating,
    attendance,
  };
}

export function recordWeeklyFinance(state, show){
  ensureFinances(state);
  if (!show || show.error || !brandKeys.includes(show.brand)) return null;
  const brand = show.brand;
  const breakdown = computeBreakdown(state, brand, show);
  if (!breakdown) return null;

  const revenueTotal = sumRecord(breakdown.revenue);
  const expenseTotal = sumRecord(breakdown.expenses);

  const adjustments = [];
  state.finances.pendingAdjustments = state.finances.pendingAdjustments.filter(adj => {
    if (adj.brand === brand && adj.week === state.week){
      adjustments.push(adj);
      return false;
    }
    return true;
  });
  const adjustmentTotal = adjustments.reduce((sum, adj) => sum + toInt(adj.amount), 0);

  const net = revenueTotal - expenseTotal + adjustmentTotal;

  const brandFin = state.finances.brand[brand];
  brandFin.revenue += revenueTotal;
  brandFin.expenses += expenseTotal;
  brandFin.adjustments += adjustmentTotal;
  brandFin.cash += net;

  const entry = {
    week: state.week,
    brand,
    rating: breakdown.rating,
    attendance: breakdown.attendance,
    revenue: breakdown.revenue,
    revenueTotal,
    expenses: breakdown.expenses,
    expenseTotal,
    adjustments,
    adjustmentTotal,
    net,
  };
  state.finances.weeks.push(entry);
  while (state.finances.weeks.length > HISTORY_LIMIT){
    state.finances.weeks.shift();
  }

  if (brandFin.cash < 0 && brandFin.warnedNegativeWeek !== state.week && state.brand === brand){
    pushMail(state, {
      title: `${brand} finances overdrawn`,
      from: 'Finance Office',
      body: `We are ${formatMoney(Math.abs(brandFin.cash))} in the red. Consider trimming payroll or booking hotter cards to boost revenue.`,
    });
    brandFin.warnedNegativeWeek = state.week;
  }

  return entry;
}

function formatMoney(n){
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export { formatMoney };
