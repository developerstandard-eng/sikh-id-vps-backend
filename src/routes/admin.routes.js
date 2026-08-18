const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

router.use(requireAdmin);
router.get('/stats', ctrl.getStats);
router.get('/users', ctrl.listUsers);
router.delete('/users/:id', ctrl.deleteUser);

module.exports = router;
