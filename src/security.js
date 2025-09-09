const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const limiter = new RateLimiterMemory({ points: 15, duration: 2 });

function rateLimit(req, res, next) {
  limiter.consume(req.ip).then(() => next()).catch(() => {
    res.status(429).json({ error: 'Too many requests' });
  });
}

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { helmet, rateLimit, adminAuth };
