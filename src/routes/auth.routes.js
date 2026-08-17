const express = require('express');
const router = express.Router();
const { requireSiteSecret, requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', requireSiteSecret, ctrl.register);
router.post('/login', requireSiteSecret, ctrl.login);
router.post('/refresh', ctrl.refresh);

// Cross-domain SSO handshake
router.get('/sso/authorize', requireAuth, ctrl.ssoAuthorize);
router.post('/sso/exchange', requireSiteSecret, ctrl.ssoExchange);

module.exports = router;
