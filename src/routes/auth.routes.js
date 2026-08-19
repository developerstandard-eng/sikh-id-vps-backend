const express = require('express');
const router = express.Router();
const { requireSiteSecret, requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', requireSiteSecret, ctrl.register);
router.post('/login', requireSiteSecret, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/forgot-password', requireSiteSecret, ctrl.forgotPassword);
router.post('/reset-password', requireSiteSecret, ctrl.resetPassword);
router.post('/change-password', requireAuth, ctrl.changePassword);
router.post('/otp/request', requireSiteSecret, ctrl.requestLoginOtp);
router.post('/otp/verify', requireSiteSecret, ctrl.verifyLoginOtp);

// Cross-domain SSO handshake
router.get('/sso/authorize', requireAuth, ctrl.ssoAuthorize);
router.post('/sso/exchange', requireSiteSecret, ctrl.ssoExchange);

module.exports = router;
