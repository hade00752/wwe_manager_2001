// public/js/engine/ppv.js
// Era-accurate 2004 WWE PPV calendar.
// Week 1 = April 1, 2004 (post-WM XX, brand split in full effect).
//
// Week offsets from April 1 2004:
//   Backlash           Apr 18  →  week 3
//   Judgment Day       May 16  →  week 7
//   Bad Blood          Jun 13  →  week 11
//   Great American Bash Jul 11  →  week 15
//   SummerSlam         Aug 15  →  week 20
//   Unforgiven         Sep 12  →  week 24
//   No Mercy           Oct  3  →  week 27
//   Survivor Series    Nov 14  →  week 33
//   Armageddon         Dec 12  →  week 37
//   Royal Rumble       Jan 30  →  week 44
//   No Way Out         Feb 20  →  week 48
//   WrestleMania 21    Apr  3  →  week 53

export const PPV_CALENDAR = [
  { name: 'Backlash',            week:  3, brand: 'RAW',  shared: false, tier: 'major'        },
  { name: 'Judgment Day',        week:  7, brand: 'SD',   shared: false, tier: 'major'        },
  { name: 'Bad Blood',           week: 11, brand: 'RAW',  shared: false, tier: 'major'        },
  { name: 'Great American Bash', week: 15, brand: 'SD',   shared: false, tier: 'major'        },
  { name: 'SummerSlam',          week: 20, brand: 'BOTH', shared: true,  tier: 'supershow'    },
  { name: 'Unforgiven',          week: 24, brand: 'RAW',  shared: false, tier: 'major'        },
  { name: 'No Mercy',            week: 27, brand: 'SD',   shared: false, tier: 'major'        },
  { name: 'Survivor Series',     week: 33, brand: 'BOTH', shared: true,  tier: 'supershow'    },
  { name: 'Armageddon',          week: 37, brand: 'SD',   shared: false, tier: 'major'        },
  { name: 'Royal Rumble',        week: 44, brand: 'BOTH', shared: true,  tier: 'supershow'    },
  { name: 'No Way Out',          week: 48, brand: 'SD',   shared: false, tier: 'major'        },
  { name: 'WrestleMania 21',     week: 53, brand: 'BOTH', shared: true,  tier: 'wrestlemania' },
];

// Flat additive boost applied to showScore on PPV weeks, before weighted average.
// These are calibrated so a decent-quality PPV (showScore ~350) gets a meaningful
// bump that's visible in results but doesn't make quality irrelevant.
export const PPV_BOOST = {
  major:        18,
  supershow:    30,
  wrestlemania: 55,
};

// Inbox warning fires this many weeks before a PPV
export const PPV_WARN_WEEKS = 3;

// For shared PPVs: each brand fills this many match slots
// (remaining slots auto-filled by AI for the other brand, main event determined by heat)
export const SHARED_SLOTS_PER_BRAND = 3;

/* ── Lookup helpers ───────────────────────────────────────────────── */

/**
 * Returns the PPV happening on `week` for `brand`, or null.
 * brand: 'RAW' | 'SD'
 */
export function getActivePPV(week, brand) {
  return PPV_CALENDAR.find(
    p => p.week === week && (p.brand === brand || p.brand === 'BOTH')
  ) || null;
}

/**
 * Returns the next upcoming PPV for `brand` after `week`, with weeksAway attached.
 * Returns null if none remain in the calendar.
 */
export function getNextPPV(week, brand) {
  const hit = PPV_CALENDAR
    .filter(p => p.week > week && (p.brand === brand || p.brand === 'BOTH'))
    .sort((a, b) => a.week - b.week)[0];
  if (!hit) return null;
  return { ...hit, weeksAway: hit.week - week };
}

/**
 * For shared PPVs: which brand earns the main event slot?
 *
 * Uses the hottest active storyline + world champion momentum on each brand.
 * The brand with the higher combined score gets the main event match slot and
 * the larger crowd reaction bonus.
 *
 * Returns 'RAW' | 'SD'.
 */
export function getSharedMainEventBrand(state) {
  const score = (brand) => {
    const stories  = state.storylines?.[brand] || [];
    const topHeat  = stories.reduce((best, s) => Math.max(best, s.heat ?? 0), 0);

    const holder   = state.champs?.[brand]?.['World'];
    const champW   = holder
      ? (state.roster || []).find(w => w.name === holder)
      : null;
    const champMom = champW?.momentum ?? 50;

    // Weighted: feud heat matters more than raw champ momentum
    return Math.round(topHeat * 0.60 + champMom * 0.40);
  };

  return score('RAW') >= score('SD') ? 'RAW' : 'SD';
}

/**
 * The flat showScore boost for an active PPV.
 * Pass the result of getActivePPV().
 */
export function ppvScoreBoost(ppv) {
  if (!ppv) return 0;
  return PPV_BOOST[ppv.tier] ?? PPV_BOOST.major;
}

/**
 * Human-readable tier label.
 */
export function ppvTierLabel(tier) {
  return tier === 'wrestlemania' ? 'WrestleMania'
       : tier === 'supershow'   ? 'Supershow (both brands)'
       :                          'Brand PPV';
}
