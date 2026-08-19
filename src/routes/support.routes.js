const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/support.controller');

router.get('/tickets', requireAuth, ctrl.list);
router.post('/tickets', requireAuth, ctrl.create);

module.exports = router;
