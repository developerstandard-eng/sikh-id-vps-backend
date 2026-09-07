const express = require('express');
const router = express.Router();
const { requireSiteSecret, requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/nominations.controller');

// Called by the WP plugin, server-side — site-secret identifies which
// site's form to use, the bearer token (issued at sign-up) identifies who's
// submitting it.
router.get('/nomination-form', requireSiteSecret, ctrl.getForm);
router.post('/nominations', requireSiteSecret, requireAuth, ctrl.submit);

module.exports = router;
