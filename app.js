'use strict';

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MAGIC = process.env.MAGIC;
if (!MAGIC) {
  console.warn('WARNING: MAGIC env var is not set. Set the MAGIC environment variable to protect this application.');
}
const SLIDES_DIR = path.resolve(__dirname, 'Slides');

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('WARNING: SESSION_SECRET env var is not set. Using an insecure default. Set SESSION_SECRET in production.');
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again later.'
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: sessionSecret || 'voiced-slides-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// CSRF token middleware: generate token on session creation
function generateCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function verifyCsrf(req, res, next) {
  const token = req.body._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/');
}

// Serve slide files (images and audio) for authenticated users
app.use('/slides', requireAuth, express.static(SLIDES_DIR));

// Login page
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/presentations');
  }
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voiced Slides Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .login-box {
      background: #16213e;
      padding: 2rem 2.5rem;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      width: 320px;
      text-align: center;
    }
    h1 { font-size: 1.4rem; margin-bottom: 1.5rem; color: #e94560; }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #444;
      border-radius: 6px;
      background: #0f3460;
      color: #eee;
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #e94560;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover { background: #c73652; }
    .error { color: #ff6b6b; margin-bottom: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>🎞 Voiced Slides Player</h1>
    ${req.query.error ? '<p class="error">Incorrect phrase. Please try again.</p>' : ''}
    <form method="POST" action="/login">
      <input type="hidden" name="_csrf" value="${generateCsrfToken(req)}">
      <input type="password" name="magic" placeholder="Enter magic phrase" autofocus required autocomplete="current-password">
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`);
});

// Login handler
app.post('/login', loginLimiter, verifyCsrf, (req, res) => {
  const { magic } = req.body;
  if (MAGIC && magic === MAGIC) {
    req.session.authenticated = true;
    return res.redirect('/presentations');
  }
  res.redirect('/?error=1');
});

// Logout
app.post('/logout', requireAuth, verifyCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Presentations list
app.get('/presentations', requireAuth, apiLimiter, (req, res) => {
  let presentations = [];
  try {
    presentations = fs.readdirSync(SLIDES_DIR)
      .filter(name => {
        const fullPath = path.join(SLIDES_DIR, name);
        return fs.statSync(fullPath).isDirectory();
      })
      .sort();
  } catch (e) {
    presentations = [];
  }

  const items = presentations.length
    ? presentations.map(name => `
        <li>
          <span class="name">${escapeHtml(name)}</span>
          <a href="/play/${encodeURIComponent(name)}" class="btn-play">▶ Play</a>
        </li>`).join('')
    : '<li class="empty">No presentations found in the Slides folder.</li>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presentations – Voiced Slides Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      padding: 2rem;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
    }
    h1 { font-size: 1.6rem; color: #e94560; }
    .logout-btn {
      background: transparent;
      border: 1px solid #555;
      color: #aaa;
      padding: 0.4rem 0.9rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .logout-btn:hover { background: #333; }
    ul { list-style: none; max-width: 600px; margin: 0 auto; }
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #16213e;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      margin-bottom: 0.75rem;
    }
    li.empty { justify-content: center; color: #888; font-style: italic; }
    .name { font-size: 1.05rem; }
    .btn-play {
      background: #e94560;
      color: #fff;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.9rem;
      white-space: nowrap;
    }
    .btn-play:hover { background: #c73652; }
  </style>
</head>
<body>
  <header>
    <h1>🎞 Presentations</h1>
    <form method="POST" action="/logout">
      <input type="hidden" name="_csrf" value="${generateCsrfToken(req)}">
      <button class="logout-btn" type="submit">Logout</button>
    </form>
  </header>
  <ul>${items}</ul>
</body>
</html>`);
});

// API: get ordered list of slide files for a presentation
app.get('/api/slides/:name', requireAuth, apiLimiter, (req, res) => {
  const name = req.params.name;
  const presDir = path.join(SLIDES_DIR, name);

  if (!isValidPresentation(presDir)) {
    return res.status(404).json({ error: 'Presentation not found' });
  }

  let files;
  try {
    files = fs.readdirSync(presDir);
  } catch (e) {
    return res.status(500).json({ error: 'Could not read presentation folder' });
  }

  // Find all Slide*.png files and sort by number
  const slideNums = files
    .map(f => {
      const m = f.match(/^Slide(\d+)\.png$/i);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(n => n !== null)
    .sort((a, b) => a - b);

  const slides = slideNums.map(n => ({
    image: `/slides/${encodeURIComponent(name)}/Slide${n}.png`,
    audio: `/slides/${encodeURIComponent(name)}/Slide${n}.mp3`
  }));

  res.json({ slides });
});

// Slide player page
app.get('/play/:name', requireAuth, apiLimiter, (req, res) => {
  const name = req.params.name;
  const presDir = path.join(SLIDES_DIR, name);

  if (!isValidPresentation(presDir)) {
    return res.redirect('/presentations');
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(name)} – Voiced Slides Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #000;
      color: #fff;
      font-family: Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    #slide-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    #slide-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: none;
    }
    #status {
      color: #aaa;
      font-size: 1.2rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="slide-container">
    <img id="slide-img" alt="Slide">
    <div id="status">Loading presentation…</div>
  </div>
  <audio id="audio-player" preload="auto"></audio>
  <script>
    (async () => {
      const presName = ${JSON.stringify(name)};
      const statusEl = document.getElementById('status');
      const imgEl = document.getElementById('slide-img');
      const audioEl = document.getElementById('audio-player');

      let slides = [];
      try {
        const resp = await fetch('/api/slides/' + encodeURIComponent(presName));
        const data = await resp.json();
        slides = data.slides || [];
      } catch (e) {
        statusEl.textContent = 'Failed to load presentation.';
        return;
      }

      if (slides.length === 0) {
        statusEl.textContent = 'No slides found.';
        return;
      }

      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function playAudio(src) {
        return new Promise(resolve => {
          audioEl.src = src;
          audioEl.onended = resolve;
          audioEl.onerror = resolve; // skip if audio missing
          audioEl.play().catch(resolve);
        });
      }

      statusEl.style.display = 'none';
      imgEl.style.display = 'block';

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        imgEl.src = slide.image;
        await new Promise(resolve => {
          imgEl.onload = resolve;
          imgEl.onerror = resolve;
        });
        await playAudio(slide.audio);
        if (i < slides.length - 1) {
          await sleep(3000);
        }
      }

      // Presentation finished
      await sleep(5000);
      window.location.href = '/presentations';
    })();
  </script>
</body>
</html>`);
});

function isValidPresentation(presDir) {
  // Prevent path traversal: ensure the resolved path is within SLIDES_DIR
  const resolved = path.resolve(presDir);
  if (!resolved.startsWith(SLIDES_DIR + path.sep) && resolved !== SLIDES_DIR) {
    return false;
  }
  try {
    const stat = fs.statSync(resolved);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.listen(PORT, () => {
  console.log(`Voiced Slides Player running on http://localhost:${PORT}`);
});

module.exports = app;
