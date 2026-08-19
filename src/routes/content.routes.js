const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const eventsCtrl = require('../controllers/events.controller');
const newsCtrl = require('../controllers/news.controller');
const hukamnamaCtrl = require('../controllers/hukamnama.controller');
const savedCtrl = require('../controllers/saved.controller');
const activityCtrl = require('../controllers/activity.controller');
const notificationsCtrl = require('../controllers/notifications.controller');

// Member-facing reads — requires a logged-in Sikh ID (same bearer token
// used across /api/v1/profile/*), not the admin key.
router.get('/events', requireAuth, eventsCtrl.publicList);
router.post('/events/:id/rsvp', requireAuth, eventsCtrl.rsvp);
router.delete('/events/:id/rsvp', requireAuth, eventsCtrl.unrsvp);

router.get('/news', requireAuth, newsCtrl.publicList);
router.get('/hukamnama/today', requireAuth, hukamnamaCtrl.publicToday);

router.get('/saved', requireAuth, savedCtrl.list);
router.post('/saved', requireAuth, savedCtrl.save);
router.delete('/saved/:item_type/:item_id', requireAuth, savedCtrl.unsave);

router.get('/activity', requireAuth, activityCtrl.list);

router.get('/notifications', requireAuth, notificationsCtrl.list);
router.post('/notifications/read-all', requireAuth, notificationsCtrl.markAllRead);
router.post('/notifications/:id/read', requireAuth, notificationsCtrl.markRead);

module.exports = router;
