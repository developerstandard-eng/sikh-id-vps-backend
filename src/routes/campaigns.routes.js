const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/campaigns.controller');

router.use(requireAdmin);
router.post('/send', ctrl.send);

module.exports = router;
