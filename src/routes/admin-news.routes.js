const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/news.controller');

router.use(requireAdmin);
router.get('/', ctrl.adminList);
router.post('/', ctrl.adminCreate);
router.patch('/:id', ctrl.adminUpdate);
router.delete('/:id', ctrl.adminRemove);

module.exports = router;
