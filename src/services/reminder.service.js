const db = require('../config/db');
const { SECTIONS, getSectionStatus, nextIncompleteSection } = require('./completionScore.service');
const { sendEmail } = require('./email.service');
const { notifyUser } = require('./notification.service');

// Per-section copy for the reminder email — keeps the nudge specific
// instead of a generic "finish your profile" blast.
const SECTION_COPY = {
  about_you: {
    subject: 'Add a photo and finish "About You" on your Sikh ID',
    headline: 'You\'re almost set up',
    body_copy: 'Add a profile photo and a couple of details about yourself to unlock a more personalised Sikh Group experience.',
    cta_label: 'Complete About You',
  },
  professional: {
    subject: 'Your Sikh ID is missing your professional profile',
    headline: 'Make your Sikh ID work for your career',
    body_copy: 'Add your job title, company and industry so opportunities across the Sikh Group network can find you.',
    cta_label: 'Add professional info',
  },
  interests: {
    subject: 'Tell us what you care about',
    headline: 'Personalise what you see from us',
    body_copy: 'Pick a few interests — business, community, matrimony, networking and more — so we only send you what\'s relevant.',
    cta_label: 'Choose your interests',
  },
  group_preferences: {
    subject: 'Choose which Sikh Group platforms to hear from',
    headline: 'One ID, many platforms',
    body_copy: 'The Sikh Directory, The Sikh Awards, The Sikh Match and more — tell us which ones you want updates from.',
    cta_label: 'Set my preferences',
  },
  communication_preferences: {
    subject: 'How would you like us to reach you?',
    headline: 'Stay in control of your inbox',
    body_copy: 'Choose your channels and the types of updates you actually want — nothing more.',
    cta_label: 'Set communication preferences',
  },
  community_profile: {
    subject: 'Want to appear in The Sikh Directory?',
    headline: 'Get discovered across the Sikh Group',
    body_copy: 'If you run a business, a Directory listing is one of the fastest ways for the community to find you.',
    cta_label: 'Complete community profile',
  },
  final_confirmation: {
    subject: 'You\'re one step from a complete Sikh ID',
    headline: 'Finish your Sikh ID',
    body_copy: 'Just a couple of things left — complete them now and unlock the full Sikh Group ecosystem.',
    cta_label: 'Finish my Sikh ID',
  },
};

/**
 * Finds users eligible for an automatic reminder:
 * - profile_completion < 100
 * - email channel is enabled in their communication preferences (defaults to true if unset)
 * - never reminded, OR last reminder older than REMINDER_INTERVAL_DAYS
 * - under REMINDER_MAX_ATTEMPTS
 */
async function findEligibleUsers() {
  const intervalDays = Number(process.env.REMINDER_INTERVAL_DAYS || 3);
  const maxAttempts = Number(process.env.REMINDER_MAX_ATTEMPTS || 4);

  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.profile_completion, u.reminder_attempts
     FROM users u
     LEFT JOIN communication_preferences cp ON cp.user_id = u.id
     WHERE u.status = 'active'
       AND u.profile_completion < 100
       AND u.reminder_attempts < :maxAttempts
       AND (cp.channel_email IS NULL OR cp.channel_email = 1)
       AND (u.last_reminder_sent_at IS NULL OR u.last_reminder_sent_at < DATE_SUB(NOW(), INTERVAL :intervalDays DAY))
     LIMIT 500`,
    { maxAttempts, intervalDays }
  );

  return rows;
}

/** Sends one targeted reminder email and logs it. Returns the section nudged, or null if nothing left to nudge. */
async function sendReminderToUser(user, appBaseUrl) {
  const status = await getSectionStatus(user.id);
  const section = nextIncompleteSection(status);
  if (!section) return null;

  const copy = SECTION_COPY[section] || SECTION_COPY.final_confirmation;

  await sendEmail({
    to: user.email,
    subject: copy.subject,
    templateKey: 'reminder-section',
    vars: {
      full_name: user.full_name,
      headline: copy.headline,
      body_copy: copy.body_copy,
      cta_label: copy.cta_label,
      cta_url: `${appBaseUrl}/dashboard?focus=${section}`,
      unsubscribe_url: `${appBaseUrl}/preferences?uid=${user.id}`,
      completion_pct: user.profile_completion,
    },
  });

  await db.query(
    `INSERT INTO email_events (user_id, email_type, section_key, template_key, status)
     VALUES (:userId, 'auto_reminder', :section, 'reminder-section', 'sent')`,
    { userId: user.id, section }
  );

  await db.query(
    `UPDATE users SET last_reminder_sent_at = NOW(), last_reminder_section = :section, reminder_attempts = reminder_attempts + 1
     WHERE id = :id`,
    { section, id: user.id }
  );

  await notifyUser(user.id, '🔔', copy.subject);

  return section;
}

module.exports = { findEligibleUsers, sendReminderToUser, SECTION_COPY };
