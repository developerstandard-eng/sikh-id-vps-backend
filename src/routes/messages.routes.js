const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/messages.controller');

router.get('/unread-count', requireAuth, ctrl.unreadCount);
router.get('/conversations', requireAuth, ctrl.listConversations);
router.post('/conversations', requireAuth, ctrl.startConversation);
router.get('/conversations/:id/messages', requireAuth, ctrl.listMessages);
router.post('/conversations/:id/messages', requireAuth, ctrl.sendMessage);
router.post('/conversations/:id/read', requireAuth, ctrl.markRead);

module.exports = router;
