const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const eventsCtrl = require('../controllers/events.controller');
const newsCtrl = require('../controllers/news.controller');
const hukamnamaCtrl = require('../controllers/hukamnama.controller');

// Member-facing reads — requires a logged-in Sikh ID (same bearer token
// used across /api/v1/profile/*), not the admin key.
router.get('/events', requireAuth, eventsCtrl.publicList);
router.get('/news', requireAuth, newsCtrl.publicList);
router.get('/hukamnama/today', requireAuth, hukamnamaCtrl.publicToday);

module.exports = router;
