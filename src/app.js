require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const segmentsRoutes = require('./routes/segments.routes');
const campaignsRoutes = require('./routes/campaigns.routes');
const adminRoutes = require('./routes/admin.routes');
const adminEventsRoutes = require('./routes/admin-events.routes');
const adminNewsRoutes = require('./routes/admin-news.routes');
const adminHukamnamaRoutes = require('./routes/admin-hukamnama.routes');
const contentRoutes = require('./routes/content.routes');
const messagesRoutes = require('./routes/messages.routes');
const supportRoutes = require('./routes/support.routes');
const verifyRoutes = require('./routes/verify.routes');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '2mb' }));

// Only allow requests from the WP network domains + the admin dashboard origin.
// Entries may be a bare domain (assumed https://) or a full origin (e.g. an
// IP:port used for pre-DNS testing), so both forms are accepted here.
const allowedOrigins = (process.env.ALLOWED_SITE_DOMAINS || '').split(',').map((d) => {
  const trimmed = d.trim();
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
});
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Basic global rate limit; auth endpoints get a tighter one below
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Avatar images need to load cross-origin in an <img> tag on the dashboard's
// own domain — helmet's default same-origin Cross-Origin-Resource-Policy
// would otherwise block that for this one path.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, '..', 'uploads'))
);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/segments', segmentsRoutes);
app.use('/api/v1/campaigns', campaignsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/events', adminEventsRoutes);
app.use('/api/v1/admin/news', adminNewsRoutes);
app.use('/api/v1/admin/hukamnama', adminHukamnamaRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/messages', messagesRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/verify', verifyRoutes);

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'server_error', message: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

module.exports = app;
