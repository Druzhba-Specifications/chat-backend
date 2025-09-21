// server.js

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const dns     = require('dns');

const app  = express();
const PORT = process.env.PORT || 3000;

// 1) Serve your client-side files from /public
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());
app.use(express.json());

// Helpers to read/write JSON files
const read  = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Traffic counter (requests per minute)
let trafficCount = 0;
setInterval(() => { trafficCount = 0; }, 60_000);
app.use((req, res, next) => { trafficCount++; next(); });


// ─── Public API ENDPOINTS ────────────────────────────────────────────────────────
// GET /status
app.get('/status', (req, res) => {
  res.json(read('status.json'));
});

// GET /log
app.get('/log', (req, res) => {
  res.json(read('log.json'));
});

// GET /ranks.json
app.get('/ranks.json', (req, res) => {
  res.json(read('ranks.json'));
});

// GET /blacklist.json
app.get('/blacklist.json', (req, res) => {
  res.json(read('blacklist.json'));
});

// GET /warn/:user
app.get('/warn/:user', (req, res) => {
  const user = decodeURIComponent(req.params.user);
  const warns = read('warns.json');
  // return warning reason string or empty string
  res.json(warns[user] || '');
});


// ─── STATS ENDPOINTS ──────────────────────────────────────────────────────────────
// messages sent per day (last 10 days)
app.get('/stats/messages', (req, res) => {
  const log = read('log.json');
  const counts = {};

  // initialize last 10 days
  for (let i = 9; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    counts[key] = 0;
  }

  // count only real chat lines (user>>message)
  log.forEach(line => {
    if (!line.startsWith('<<') && line.includes('>>')) {
      const day = new Date().toISOString().slice(0, 10);
      if (counts[day] !== undefined) counts[day]++;
    }
  });

  res.json(counts);
});

// most recent chat line
app.get('/stats/recent', (req, res) => {
  const log = read('log.json');
  const last = [...log].reverse().find(line => line.includes('>>'));
  res.send(last || '');
});

// simple ping check
app.get('/stats/ping', (req, res) => {
  const start = Date.now();
  dns.lookup('google.com', err => {
    const ms = Date.now() - start;
    res.json({ ping: err ? -1 : ms });
  });
});

// requests per minute
app.get('/stats/traffic', (req, res) => {
  res.json({ requestsPerMinute: trafficCount });
});


// ─── AUTH & CHAT ENDPOINTS ───────────────────────────────────────────────────────
// POST /login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins   = read('admins.json');
  const status   = read('status.json');

  // if chat is OFF, only GOD HIMSELF may log in
  if (status.off && username !== 'GOD HIMSELF') {
    return res.send({ redirect: 'off.html' });
  }

  if (accounts[username] !== password) {
    return res.send({ success: false });
  }

  // record login
  const lastlogin = read('lastlogin.json');
  const now       = new Date().toLocaleString();
  const log       = read('log.json');
  log.push(`<<${username} Logged on! Last logged in: ${lastlogin[username] || 'Never'}>>`);
  lastlogin[username] = now;
  write('lastlogin.json', lastlogin);
  write('log.json', log);

  res.send({ success: true, isAdmin: admins.includes(username) });
});

// POST /logoff
app.post('/logoff', (req, res) => {
  const { username } = req.body;
  const log = read('log.json');
  log.push(`<<${username} Logged off>>`);
  write('log.json', log);
  res.send('OK');
});

// POST /send
app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');

  // if paused, only GOD HIMSELF may speak
  if (status.paused && user !== 'GOD HIMSELF') {
    return res.send('Chat is paused');
  }

  // if banned
  if (blacklist.includes(user)) {
    return res.send('You are banned');
  }

  const log = read('log.json');
  log.push(`${user}>>${message}`);
  write('log.json', log);
  res.send('Message saved');
});


// ─── ADMIN COMMANDS ──────────────────────────────────────────────────────────────
// POST /ban
app.post('/ban', (req, res) => {
  const target = req.body.user;
  if (target === 'GOD HIMSELF') {
    return res.send({ success: false, message: 'Cannot ban GOD HIMSELF' });
  }
  const list = read('blacklist.json');
  if (!list.includes(target)) {
    write('blacklist.json', [...list, target]);
  }
  res.send({ success: true });
});

// POST /unban
app.post('/unban', (req, res) => {
  const target = req.body.user;
  const filtered = read('blacklist.json').filter(u => u !== target);
  write('blacklist.json', filtered);
  res.send({ success: true });
});

// POST /warn
app.post('/warn', (req, res) => {
  const { user: target, reason } = req.body;
  if (target === 'GOD HIMSELF') {
    return res.send({ success: false, message: 'Cannot warn GOD HIMSELF' });
  }
  const warns = read('warns.json');
  warns[target] = reason;
  write('warns.json', warns);

  // system-log it
  const log = read('log.json');
  log.push(`<<SYSTEM>> ${target} was warned: ${reason}>>`);
  write('log.json', log);

  res.send({ success: true });
});

// POST /pause
app.post('/pause', (req, res) => {
  const status = read('status.json');
  status.paused = true;
  write('status.json', status);

  const log = read('log.json');
  log.push('<<SYSTEM>> Chat has been paused by admin.>>');
  write('log.json', log);

  res.send('Paused');
});

// POST /unpause
app.post('/unpause', (req, res) => {
  const status = read('status.json');
  status.paused = false;
  write('status.json', status);

  const log = read('log.json');
  log.push('<<SYSTEM>> Chat has been unpaused by admin.>>');
  write('log.json', log);

  res.send('Unpaused');
});

// POST /off
app.post('/off', (req, res) => {
  const status = read('status.json');
  status.off = true;
  write('status.json', status);

  const log = read('log.json');
  log.push('<<SYSTEM>> Chat turned OFF by admin. Only GOD HIMSELF may return.>>');
  write('log.json', log);

  res.send('OK');
});

// POST /on
app.post('/on', (req, res) => {
  const status = read('status.json');
  status.off = false;
  write('status.json', status);

  const log = read('log.json');
  log.push('<<SYSTEM>> Chat turned ON by admin.>>');
  write('log.json', log);

  res.send('OK');
});


// ─── FALLBACK ────────────────────────────────────────────────────────────────────
// If a route is not found above, Express.static will serve public files,
// and unknown GETs fall back to index.html below:

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
