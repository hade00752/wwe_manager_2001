/* public/js/engine.js — barrel */
export * from './engine/state_mgmt.js';     // simNow, simDateString, advanceSimWeek, nsKey, etc.
export * from './engine/helpers.js';        // headshotImg, byBrand, etc.
export { aiBooking } from './engine/ai.js';
export { runShow } from './engine/runShow.js';
export { applyWeeklyProgression } from './engine/progression.js';
export { processRetirements } from './engine/retirement.js';
export { snapshotWeekBaselineOnce } from './engine/snapshots.js';
export {
  ensureFinances,
  financeTotals,
  financeReportForWeek,
  recordWeeklyFinance,
  registerFinancialAdjustment,
  formatMoney,
} from './engine/finances.js';
export {
  weeklyContractTick,
  extendContract,
  offerContract,
  estimateContractValue,
} from './engine/contracts.js';
