const express = require('express');
const router = express.Router();
const verifyCtrl = require('../controllers/verify.controller');

// No requireAuth — this is the public card-verification lookup a QR scan lands on.
router.get('/:sikhId', verifyCtrl.verifyPublic);

module.exports = router;
