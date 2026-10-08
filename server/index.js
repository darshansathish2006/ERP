import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './db.js';
import { ensureSeeded, ADMIN_EMAIL, PASSWORD_HINT } from './seed.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/masters.js';
import opportunityRoutes from './routes/opportunities.js';
import quoteRoutes, { publicRoutes } from './routes/quotes.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';

const PORT = Number(process.env.PORT) || 4000;
const fresh = ensureSeeded();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', requireAuth, masterRoutes);
app.use('/api', requireAuth, opportunityRoutes);
app.use('/api', requireAuth, quoteRoutes);
app.use('/api', requireAuth, dashboardRoutes);
app.use('/api', requireAuth, adminRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client (npm run build) for production use.
const dist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// JSON error handler
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message });
});

app.listen(PORT, () => {
  console.log(`Titans ERP API listening on http://localhost:${PORT}`);
  if (fresh) console.log(`Seeded a new database. Login with ${ADMIN_EMAIL} / ${PASSWORD_HINT}`);
});
