const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/nominations.controller');

router.use(requireAdmin);

// Submissions
router.get('/', ctrl.adminList);
router.get('/:id(\\d+)', ctrl.adminGet);

// Per-site form builder
router.get('/forms', ctrl.adminListForms);
router.get('/forms/:site_domain', ctrl.adminGetForm);
router.put('/forms/:site_domain', ctrl.adminUpsertForm);
router.delete('/forms/:site_domain', ctrl.adminDeleteForm);

module.exports = router;
