const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/profile.controller');

router.get('/me', requireAuth, ctrl.getMe);
router.patch('/about', requireAuth, ctrl.updateAbout);
router.patch('/professional', requireAuth, ctrl.updateProfessional);
router.put('/interests', requireAuth, ctrl.updateInterests);
router.put('/group-preferences', requireAuth, ctrl.updateGroupPreferences);
router.patch('/communication-preferences', requireAuth, ctrl.updateCommunicationPreferences);
router.patch('/community', requireAuth, ctrl.updateCommunityProfile);

module.exports = router;
