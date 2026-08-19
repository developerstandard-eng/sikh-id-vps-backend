const db = require('../config/db');

/**
 * Weighted profile sections, matching the staged Sikh ID form:
 * 15 -> 30 -> 45 -> 60 -> 75 -> 85 -> 95 -> 100
 * Each key's `weight` is how many completion points it contributes.
 * `check(row)` returns true if that section counts as filled.
 */
const SECTIONS = {
  basic_identity: { weight: 15, label: 'Basic identity', required: true },
  about_you: { weight: 15, label: 'About you' },
  professional: { weight: 15, label: 'Professional profile' },
  interests: { weight: 15, label: 'Interests' },
  group_preferences: { weight: 15, label: 'Sikh Group preferences' },
  communication_preferences: { weight: 10, label: 'Communication preferences' },
  community_profile: { weight: 10, label: 'Community profile' },
  final_confirmation: { weight: 5, label: 'Final confirmation' },
};

async function getSectionStatus(userId) {
  const [[user]] = await db.query('SELECT * FROM users WHERE id = :id', { id: userId });
  const [[about]] = await db.query('SELECT * FROM profile_about WHERE user_id = :id', { id: userId });
  const [[professional]] = await db.query('SELECT * FROM profile_professional WHERE user_id = :id', { id: userId });
  const [interests] = await db.query('SELECT interest_tag FROM user_interests WHERE user_id = :id', { id: userId });
  const [groupPrefs] = await db.query('SELECT platform_name FROM user_group_preferences WHERE user_id = :id', { id: userId });
  const [[commPrefs]] = await db.query('SELECT * FROM communication_preferences WHERE user_id = :id', { id: userId });
  const [[directory]] = await db.query('SELECT * FROM directory_listing WHERE user_id = :id', { id: userId });

  const basic_identity = !!(user && user.full_name && user.email && user.mobile && user.country);
  const about_you = !!(about && about.photo_url && about.city && about.occupation_type);
  const professional_done = !!(professional && professional.job_title && professional.company && professional.industry);
  const interests_done = interests.length > 0;
  const group_preferences = groupPrefs.length > 0;
  const communication_preferences = !!commPrefs;
  // Directory listing is optional by design — "opted in with details" OR
  // "explicitly said no" both count as the section being resolved, so
  // users who don't want a listing aren't nagged forever.
  const community_profile = !!(directory && (directory.wants_listing === 0 || (directory.wants_listing === 1 && directory.business_name)));

  return {
    basic_identity,
    about_you,
    professional: professional_done,
    interests: interests_done,
    group_preferences,
    communication_preferences,
    community_profile,
    // The wizard's final screen, not a field the user fills in — must be
    // derived from the other flags computed in this same pass, not from
    // the stored profile_completion (which is still the pre-update value
    // at this point and would always be one step behind).
    final_confirmation:
      basic_identity && about_you && professional_done && interests_done && group_preferences && communication_preferences && community_profile,
  };
}

/**
 * Recomputes and persists profile_completion for a user. Call this after
 * ANY write to users/profile_about/profile_professional/interests/
 * group_preferences/communication_preferences/directory_listing.
 */
async function recalculate(userId) {
  const status = await getSectionStatus(userId);

  let total = 0;
  for (const [key, def] of Object.entries(SECTIONS)) {
    if (status[key]) total += def.weight;
  }
  total = Math.min(total, 100);

  await db.query(
    'UPDATE users SET profile_completion = :pct, last_recalculated_at = NOW() WHERE id = :id',
    { pct: total, id: userId }
  );

  return { completion: total, sections: status };
}

/** Returns the first incomplete section in stage order — what the reminder engine nudges next. */
function nextIncompleteSection(status) {
  for (const key of Object.keys(SECTIONS)) {
    if (!status[key]) return key;
  }
  return null;
}

module.exports = { SECTIONS, getSectionStatus, recalculate, nextIncompleteSection };
