const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/hukamnama.controller');

router.use(requireAdmin);
router.get('/', ctrl.adminList);
router.post('/', ctrl.adminUpsert);
router.delete('/:id', ctrl.adminRemove);

module.exports = router;
