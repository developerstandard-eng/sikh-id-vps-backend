const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  // Random filename rather than the client-supplied one — avoids path
  // traversal and collisions between users.
  filename: (req, file, cb) => cb(null, `${req.user.id}-${crypto.randomBytes(8).toString('hex')}${ALLOWED_TYPES[file.mimetype]}`),
});

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, file.mimetype)),
});

module.exports = { uploadAvatar, AVATAR_DIR };
