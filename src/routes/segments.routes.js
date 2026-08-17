const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/segments.controller');

router.use(requireAdmin);
router.post('/preview', ctrl.preview);
router.post('/', ctrl.create);
router.get('/', ctrl.list);
router.get('/:id/members', ctrl.members);
router.delete('/:id', ctrl.remove);

module.exports = router;
