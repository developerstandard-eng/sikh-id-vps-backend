const db = require('../config/db');
const { recalculate, getSectionStatus } = require('../services/completionScore.service');

/** GET /api/v1/profile/me — full profile + completion, used by the dashboard */
async function getMe(req, res) {
  const userId = req.user.id;
  const [[user]] = await db.query(
    'SELECT id, sikh_id, full_name, email, mobile, country, profile_completion, created_at FROM users WHERE id = :id',
    { id: userId }
  );
  const [[about]] = await db.query('SELECT * FROM profile_about WHERE user_id = :id', { id: userId });
  const [[professional]] = await db.query('SELECT * FROM profile_professional WHERE user_id = :id', { id: userId });
  const [interests] = await db.query('SELECT interest_tag FROM user_interests WHERE user_id = :id', { id: userId });
  const [groupPrefs] = await db.query('SELECT platform_name, subscribed FROM user_group_preferences WHERE user_id = :id', { id: userId });
  const [[commPrefs]] = await db.query('SELECT * FROM communication_preferences WHERE user_id = :id', { id: userId });
  const [[directory]] = await db.query('SELECT * FROM directory_listing WHERE user_id = :id', { id: userId });
  const status = await getSectionStatus(userId);

  res.json({ user, about, professional, interests, groupPrefs, commPrefs, directory, sectionStatus: status });
}

/** PATCH /api/v1/profile/about — stage 2 (30%) */
async function updateAbout(req, res) {
  const userId = req.user.id;
  const { photo_url, date_of_birth, dob_visibility, city, residence_country, occupation_type } = req.body;

  await db.query(
    `INSERT INTO profile_about (user_id, photo_url, date_of_birth, dob_visibility, city, residence_country, occupation_type)
     VALUES (:userId, :photo_url, :date_of_birth, :dob_visibility, :city, :residence_country, :occupation_type)
     ON DUPLICATE KEY UPDATE
       photo_url = VALUES(photo_url), date_of_birth = VALUES(date_of_birth),
       dob_visibility = VALUES(dob_visibility), city = VALUES(city),
       residence_country = VALUES(residence_country), occupation_type = VALUES(occupation_type)`,
    {
      userId,
      photo_url: photo_url || null,
      date_of_birth: date_of_birth || null,
      dob_visibility: dob_visibility || 'private',
      city: city || null,
      residence_country: residence_country || null,
      occupation_type: occupation_type || null,
    }
  );

  const result = await recalculate(userId);
  res.json(result);
}

/** POST /api/v1/profile/photo — multipart upload, sets profile_about.photo_url */
async function uploadPhoto(req, res) {
  const userId = req.user.id;
  if (!req.file) {
    return res.status(400).json({ error: 'invalid_file', message: 'Attach a JPEG, PNG or WEBP image under 5MB as "photo"' });
  }

  const photoUrl = `${process.env.API_BASE_URL}/uploads/avatars/${req.file.filename}`;

  await db.query(
    `INSERT INTO profile_about (user_id, photo_url)
     VALUES (:userId, :photoUrl)
     ON DUPLICATE KEY UPDATE photo_url = VALUES(photo_url)`,
    { userId, photoUrl }
  );

  const result = await recalculate(userId);
  res.json({ photo_url: photoUrl, ...result });
}

/** PATCH /api/v1/profile/professional — stage 3 (45%) */
async function updateProfessional(req, res) {
  const userId = req.user.id;
  const { job_title, company, industry, experience_years, linkedin_url } = req.body;

  await db.query(
    `INSERT INTO profile_professional (user_id, job_title, company, industry, experience_years, linkedin_url)
     VALUES (:userId, :job_title, :company, :industry, :experience_years, :linkedin_url)
     ON DUPLICATE KEY UPDATE
       job_title = VALUES(job_title), company = VALUES(company), industry = VALUES(industry),
       experience_years = VALUES(experience_years), linkedin_url = VALUES(linkedin_url)`,
    {
      userId,
      job_title: job_title || null,
      company: company || null,
      industry: industry || null,
      experience_years: experience_years || null,
      linkedin_url: linkedin_url || null,
    }
  );

  const result = await recalculate(userId);
  res.json(result);
}

/** PUT /api/v1/profile/interests — stage 4 (60%). Body: { interests: ["Business & Entrepreneurship", ...] } */
async function updateInterests(req, res) {
  const userId = req.user.id;
  const { interests = [] } = req.body;

  await db.query('DELETE FROM user_interests WHERE user_id = :id', { id: userId });
  for (const tag of interests) {
    await db.query('INSERT INTO user_interests (user_id, interest_tag) VALUES (:userId, :tag)', { userId, tag });
  }

  const result = await recalculate(userId);
  res.json(result);
}

/** PUT /api/v1/profile/group-preferences — stage 5 (75%). Body: { platforms: [{name, subscribed}] } */
async function updateGroupPreferences(req, res) {
  const userId = req.user.id;
  const { platforms = [] } = req.body;

  await db.query('DELETE FROM user_group_preferences WHERE user_id = :id', { id: userId });
  for (const p of platforms) {
    await db.query(
      'INSERT INTO user_group_preferences (user_id, platform_name, subscribed) VALUES (:userId, :name, :subscribed)',
      { userId, name: p.name, subscribed: p.subscribed ? 1 : 0 }
    );
  }

  const result = await recalculate(userId);
  res.json(result);
}

/** PATCH /api/v1/profile/communication-preferences — stage 6 (85%) */
async function updateCommunicationPreferences(req, res) {
  const userId = req.user.id;
  const fields = req.body;
  const cols = [
    'channel_email', 'channel_sms', 'channel_push', 'channel_whatsapp',
    'topic_alerts', 'topic_community_news', 'topic_events', 'topic_business', 'topic_awards', 'topic_new_projects',
  ];
  const values = {};
  for (const c of cols) values[c] = fields[c] != null ? (fields[c] ? 1 : 0) : 1;

  await db.query(
    `INSERT INTO communication_preferences (user_id, ${cols.join(', ')})
     VALUES (:userId, ${cols.map((c) => `:${c}`).join(', ')})
     ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
    { userId, ...values }
  );

  const result = await recalculate(userId);
  res.json(result);
}

/** PATCH /api/v1/profile/community — stage 7 (95%) */
async function updateCommunityProfile(req, res) {
  const userId = req.user.id;
  const { wants_listing, business_name, website, business_category, city, country, description, contact_details } = req.body;

  await db.query(
    `INSERT INTO directory_listing (user_id, wants_listing, business_name, website, business_category, city, country, description, contact_details)
     VALUES (:userId, :wants_listing, :business_name, :website, :business_category, :city, :country, :description, :contact_details)
     ON DUPLICATE KEY UPDATE
       wants_listing = VALUES(wants_listing), business_name = VALUES(business_name), website = VALUES(website),
       business_category = VALUES(business_category), city = VALUES(city), country = VALUES(country),
       description = VALUES(description), contact_details = VALUES(contact_details)`,
    {
      userId,
      wants_listing: wants_listing ? 1 : 0,
      business_name: business_name || null,
      website: website || null,
      business_category: business_category || null,
      city: city || null,
      country: country || null,
      description: description || null,
      contact_details: contact_details || null,
    }
  );

  const result = await recalculate(userId);
  res.json(result);
}

module.exports = {
  getMe, updateAbout, uploadPhoto, updateProfessional, updateInterests,
  updateGroupPreferences, updateCommunicationPreferences, updateCommunityProfile,
};
