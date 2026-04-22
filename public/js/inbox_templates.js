// public/js/data/inbox_templates.js
export const INBOX_TEMPLATES = [
/* =========================
   COMPLAINTS / BURIAL FEEL
   ========================= */
{
  id: "complaint_clean_loss_main",
  category: "complaint",
  severity: 4,
  cooldownWeeks: 2,
  eligibility: {
    facedEachOther: true,
    finish: "clean",
    slot: "main_event"
  },
  message:
    "{actor}: “Another clean loss to {target} in the main event? I’m not here to make numbers look good.”",
  effects: {
    morale: { actor: -6 },
    trust: { pair: ["{actor}","{target}", -4] },
    flags: { oneSided4w: true }
  },
  vars: ["actor","target"]
},
{
  id: "complaint_losing_streak",
  category: "complaint",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { losingStreak: { actor: 3 } },
  message:
    "{actor}: “Three losses in a row. Either give me time or give me an exit.”",
  effects: { morale: { actor: -5 }, momentum: { actor: -1 } },
  vars: ["actor"]
},
{
  id: "complaint_left_off_show",
  category: "complaint",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { bookedThisWeek: { actor: false } },
  message:
    "{actor}: “Sat at home while {brand} ran without me. That’s not a plan—it’s a mistake.”",
  effects: { morale: { actor: -4 } },
  vars: ["actor","brand"]
},
{
  id: "complaint_demotion_slot",
  category: "complaint",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { demotedSlotThisWeek: true },
  message:
    "{actor}: “From spotlight to curtain-jerk? If that’s the vision, say it to my face.”",
  effects: { morale: { actor: -3 } },
  vars: ["actor"]
},

/* =========================
   PRAISE / RESPECT GAINS
   ========================= */
{
  id: "praise_safe_worker",
  category: "praise",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: {
    facedEachOther: true,
    finish: "clean",
    durationMin: 10,
    ringSafetyOk: { target: true }
  },
  message:
    "{actor}: “{target} worked safe and snug. Felt like a pro out there.”",
  effects: {
    trust: { pair: ["{actor}","{target}", +6] },
    chemistry: { pair: ["{actor}","{target}", +2] }
  },
  vars: ["actor","target"]
},
{
  id: "praise_put_over",
  category: "praise",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { finish: "clean", tookPinRespectfully: true },
  message:
    "{actor}: “Did business for {target}. Crowd bought every second.”",
  effects: { trust: { pair: ["{actor}","{target}", +4] } },
  vars: ["actor","target"]
},
{
  id: "praise_tag_synergy",
  category: "praise",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { teamedThisWeek: true, teamWon: true },
  message:
    "{actor}: “{team} clicked tonight. Let’s keep this rolling.”",
  effects: {
    trust: { pairTeam: ["{team}", +5] }
  },
  vars: ["actor","team"]
},

/* =========================
   FALLOUT / ARGUMENTS
   ========================= */
{
  id: "fallout_tag_argument",
  category: "fallout",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { teamedThisWeek: true, teamLost: true },
  message:
    "Report: {team} argued over the finish backstage.",
  effects: { trust: { pairTeam: ["{team}", -6] } },
  vars: ["team"]
},
{
  id: "fallout_botch_blame",
  category: "fallout",
  severity: 4,
  cooldownWeeks: 3,
  eligibility: { facedEachOther: true, botchOccurred: true, blameOn: "target" },
  message:
    "Agent note: {actor} blames {target} for a dangerous botch.",
  effects: {
    trust: { pair: ["{actor}","{target}", -5] },
    flags: { unsafeBlame: true }
  },
  vars: ["actor","target"]
},
{
  id: "fallout_politicked_finish",
  category: "fallout",
  severity: 4,
  cooldownWeeks: 3,
  eligibility: { politickedFinish: true },
  message:
    "{actor}: “{target} changed the finish last minute. Not cool.”",
  effects: { trust: { pair: ["{actor}","{target}", -8] } },
  vars: ["actor","target"]
},

/* =========================
   MENTORSHIP / LEADERSHIP
   ========================= */
{
  id: "mentor_pair",
  category: "mentorship",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { veteranMentorsRookie: true },
  message:
    "Locker room: {actor} has taken {target} under their wing.",
  effects: {
    trust: { pair: ["{actor}","{target}", +8] },
    stateHint: { pair: ["{actor}","{target}", "Liked"] },
    morale: { target: +4 }
  },
  vars: ["actor","target"]
},
{
  id: "leader_mediation",
  category: "mentorship",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { mediatorIntervened: true },
  message:
    "{mediator} mediated between {actor} and {target}. Tension cooled—for now.",
  effects: { trust: { pair: ["{actor}","{target}", +8] } },
  vars: ["mediator","actor","target"]
},

/* =========================
   ROMANCE
   ========================= */
{
  id: "romance_public_moment",
  category: "romance",
  severity: 2,
  cooldownWeeks: 4,
  eligibility: { lovers: true, publicAngle: true },
  message:
    "Fans reacted to {actor} & {target} together on camera.",
  effects: {
    momentum: { actor: +1, target: +1 },
    trust: { pair: ["{actor}","{target}", +4] }
  },
  vars: ["actor","target"]
},
{
  id: "romance_strain",
  category: "romance",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { lovers: true, bookedAgainstEachOther: true, finish: "clean" },
  message:
    "{actor}: “Tonight made things awkward between me and {target}.”",
  effects: { trust: { pair: ["{actor}","{target}", -6] } },
  vars: ["actor","target"]
},
{
  id: "romance_breakup",
  category: "romance",
  severity: 5,
  cooldownWeeks: 8,
  eligibility: { lovers: true, sustainedStrainWeeks: 3 },
  message:
    "Personal: {actor} and {target} are no longer together.",
  effects: {
    romance: { pair: ["{actor}","{target}", "clearLovers"] },
    trust: { pair: ["{actor}","{target}", -10] },
    stateHint: { pair: ["{actor}","{target}", "Dislike"] }
  },
  vars: ["actor","target"]
},

/* =========================
   POLITICS / REFUSALS
   ========================= */
{
  id: "refusal_clean_job",
  category: "politics",
  severity: 5,
  cooldownWeeks: 6,
  eligibility: { bookedToLoseClean: true, refusalTriggered: true },
  message:
    "Tonight: {actor} refused to lose clean to {target}. Finish altered.",
  effects: {
    trust: { pair: ["{actor}","{target}", -8] },
    stateHint: { pair: ["{actor}","{target}", "TenseRivals"] }
  },
  vars: ["actor","target"]
},
{
  id: "public_burial_segment",
  category: "politics",
  severity: 4,
  cooldownWeeks: 4,
  eligibility: { burialPromo: true },
  message:
    "Backstage talk: {actor} cut a promo that buried {target} beyond the script.",
  effects: { trust: { pair: ["{actor}","{target}", -6] } },
  vars: ["actor","target"]
},

/* =========================
   FAN / MEDIA REACTIONS
   ========================= */
{
  id: "fan_buzz_rivalry",
  category: "fanbuzz",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { facedEachOther: true, matchRatingHigh: true },
  message:
    "Fan buzz: the crowd wants more {actor} vs {target}.",
  effects: { pressure: { pair: ["{actor}","{target}", +10] } },
  vars: ["actor","target"]
},
{
  id: "crowd_turns_on_project",
  category: "fanbuzz",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { courtFavoritePush: true, reactionsDown: true },
  message:
    "Crowd cooled on {actor}. Chants weren’t kind.",
  effects: { momentum: { actor: -1 }, morale: { actor: -3 } },
  vars: ["actor"]
},

/* =========================
   ROOKIE / HAZING / GATEKEEP
   ========================= */
{
  id: "rookie_hazed",
  category: "rookie",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { rookie: "target", enforcerOnCard: true },
  message:
    "Whispers: {target} caught heat from vets after call-ups.",
  effects: { morale: { target: -4 } },
  vars: ["target"]
},
{
  id: "rookie_earns_respect",
  category: "rookie",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { rookie: "actor", longMatchWithLeader: true },
  message:
    "Respect earned: {actor} impressed the locker room in a long match with {target}.",
  effects: {
    trust: { pair: ["{actor}","{target}", +6] },
    morale: { actor: +4 }
  },
  vars: ["actor","target"]
},

/* =========================
   LEADER / LOCKER ROOM ORDER
   ========================= */
{
  id: "leader_issues_warning",
  category: "leadership",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { lockerRoomLeader: true, unsafeTrend: true },
  message:
    "{actor} addressed safety standards in the locker room. Message received.",
  effects: { morale: { global: +0 }, softFlags: { safetyAwareness: true } },
  vars: ["actor"]
},
{
  id: "leader_praises_workhorse",
  category: "leadership",
  severity: 2,
  cooldownWeeks: 3,
  eligibility: { lockerRoomLeader: true, workhorseTarget: true },
  message:
    "{actor} praised {target} for consistency and effort.",
  effects: { trust: { pair: ["{actor}","{target}", +5] } },
  vars: ["actor","target"]
},

/* =========================
   DURABILITY / BODY
   ========================= */
{
  id: "battered_body_strain",
  category: "health",
  severity: 4,
  cooldownWeeks: 3,
  eligibility: { actorHasTrait: "Battered Body", durationMin: 12 },
  message:
    "Medical: {actor} is feeling the miles after that long match.",
  effects: { morale: { actor: -4 } },
  vars: ["actor"]
},
{
  id: "battered_body_respect",
  category: "health",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { actorHasTrait: "Battered Body", performedWell: true },
  message:
    "Backstage respect for {actor} working through pain.",
  effects: { trust: { globalWorkhorses: +3 } },
  vars: ["actor"]
},

/* =========================
   INJURY / SAFETY
   ========================= */
{
  id: "injury_nagging",
  category: "injury",
  severity: 4,
  cooldownWeeks: 4,
  eligibility: { minorInjury: true },
  message:
    "Trainer: {actor} picked up a knock. Not serious, but watch usage.",
  effects: { momentum: { actor: -1 }, softFlags: { limitedMoves: true } },
  vars: ["actor"]
},
{
  id: "injury_blamed_on_opponent",
  category: "injury",
  severity: 5,
  cooldownWeeks: 6,
  eligibility: { injuryOccurred: true, blameOn: "target" },
  message:
    "Heat alert: {actor} blames {target} for the injury.",
  effects: {
    trust: { pair: ["{actor}","{target}", -10] },
    stateHint: { pair: ["{actor}","{target}", "TenseRivals"] }
  },
  vars: ["actor","target"]
},

/* =========================
   STREAKS / FORM
   ========================= */
{
  id: "hot_streak_pop",
  category: "streak",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { winStreak: { actor: 3 } },
  message:
    "Momentum: {actor} is on a roll.",
  effects: { momentum: { actor: +1 } },
  vars: ["actor"]
},
{
  id: "cold_streak",
  category: "streak",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { losingStreak: { actor: 3 } },
  message:
    "Concern: {actor} can’t buy a win lately.",
  effects: { morale: { actor: -3 } },
  vars: ["actor"]
},

/* =========================
   TITLES / JEALOUSY
   ========================= */
{
  id: "title_envy",
  category: "title",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { titleChange: true, actorNotInScene: true },
  message:
    "{actor}: “Watching {target} hold {title} drives me mad. Give me a shot.”",
  effects: {
    pressure: { pair: ["{actor}","{target}", +10] },
    morale: { actor: +2 }
  },
  vars: ["actor","target","title"]
},
{
  id: "champion_respect",
  category: "title",
  severity: 2,
  cooldownWeeks: 3,
  eligibility: { targetIsChampion: true, cleanDefense: true },
  message:
    "Backstage respect for {target} after that {title} defense.",
  effects: { trust: { globalRespectFor: ["{target}", +3] } },
  vars: ["target","title"]
},

/* =========================
   DIVA / SPOTLIGHT
   ========================= */
{
  id: "diva_spotlight_needed",
  category: "diva",
  severity: 3,
  cooldownWeeks: 2,
  eligibility: { actorHasTrait: "Diva", offShowOrLowSlot: true },
  message:
    "{actor}: “I’m not a background act. Book me like it matters.”",
  effects: { morale: { actor: -5 } },
  vars: ["actor"]
},
{
  id: "diva_praised_after_main",
  category: "diva",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { actorHasTrait: "Diva", slot: "main_event" },
  message:
    "{actor}: “That’s the stage I deserve.”",
  effects: { morale: { actor: +6 } },
  vars: ["actor"]
},

/* =========================
   HEAT MAGNET / GRUMBLING
   ========================= */
{
  id: "heat_magnet_grumble",
  category: "heat",
  severity: 3,
  cooldownWeeks: 3,
  eligibility: { actorHasTrait: "Heat Magnet", pushHigh: true },
  message:
    "Grumbling: locker room unhappy about {actor}’s push.",
  effects: { trust: { globalVs: ["{actor}", -2] } },
  vars: ["actor"]
},

/* =========================
   SHOWMAN / MIC
   ========================= */
{
  id: "mic_work_raises_buzz",
  category: "showman",
  severity: 2,
  cooldownWeeks: 2,
  eligibility: { actorHasTrait: "Showman/Charisma-Driven", promoSegment: true },
  message:
    "Mic work: {actor} spiked interest without even wrestling.",
  effects: { momentum: { actor: +1 } },
  vars: ["actor"]
},

/* =========================
   COURT FAVORITE / OFFICE
   ========================= */
{
  id: "office_pet",
  category: "office",
  severity: 3,
  cooldownWeeks: 4,
  eligibility: { actorHasTrait: "Court Favorite" },
  message:
    "Perception: {actor} is seen as a management favorite.",
  effects: { trust: { globalVs: ["{actor}", -3] } },
  vars: ["actor"]
},

/* =========================
   APOLOGY / REPAIR
   ========================= */
{
  id: "apology_private",
  category: "repair",
  severity: 2,
  cooldownWeeks: 3,
  eligibility: { apologyOffered: true },
  message:
    "{actor} privately apologized to {target} about last week.",
  effects: { trust: { pair: ["{actor}","{target}", +6] } },
  vars: ["actor","target"]
},

/* =========================
   RETURN / POP
   ========================= */
{
  id: "return_pop",
  category: "return",
  severity: 3,
  cooldownWeeks: 6,
  eligibility: { returnedFromHiatus: true },
  message:
    "Big reaction: {actor} returned and the place erupted.",
  effects: { momentum: { actor: +2 }, morale: { actor: +4 } },
  vars: ["actor"]
}
];
// if your bundler doesn’t do ESM linking everywhere, also:
window.INBOX_TEMPLATES = INBOX_TEMPLATES;
