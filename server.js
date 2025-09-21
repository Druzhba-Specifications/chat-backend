// server.js
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const dns     = require('dns');

const app  = express();
const PORT = process.env.PORT || 3000;

// 1) Base URL of your HTML files on GitHub Pages or raw GitHub
//    e.g. 'https://username.github.io/repo' or
//         'https://raw.githubusercontent.com/username/repo/main'
const HTML_BASE = 'https://username.github.io/repo';

app.use(cors());
app.use(express.json());

// 2) Redirect root & all .html requests to your GitHub‐hosted pages
app.get(['/', '/index.html'], (req, res) => {
  return res.redirect(`${HTML_BASE}/index.html`);
});
app.get('/*.html', (req, res) => {
  return res.redirect(`${HTML_BASE}${req.path}`);
});

// 3) JSON file helpers
const read  = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));

// 4) In‐minute traffic counter
let trafficCount = 0;
setInterval(() => { trafficCount = 0; }, 60_000);
app.use((req, res, next) => { trafficCount++; next(); });


// ─── PUBLIC DATA ENDPOINTS ─────────────────────────────────────────────────
app.get('/status',        (req, res) => res.json(read('status.json')));
app.get('/log',           (req, res) => res.json(read('log.json')));
app.get('/ranks.json',    (req, res) => res.json(read('ranks.json')));
app.get('/blacklist.json',(req, res) => res.json(read('blacklist.json')));

// Return raw warning reason or empty string
app.get('/warn/:user', (req, res) => {
  const target = req.params.user;      // Express auto-decodes %20 → space
  const warns  = read('warns.json');
  return res.send(warns[target] || '');
});


// ─── STATS ENDPOINTS ─────────────────────────────────────────────────────────────
app.get('/stats/messages', (req, res) => {
  const log    = read('log.json');
  const counts = {};
  for (let i = 9; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    counts[d.toISOString().slice(0,10)] = 0;
  }
  log.forEach(line => {
    if (!line.startsWith('<<') && line.includes('>>')) {
      const day = new Date().toISOString().slice(0,10);
      if (counts[day] !== undefined) counts[day]++;
    }
  });
  res.json(counts);
});

app.get('/stats/recent', (req, res) => {
  const log = read('log.json');
  const last = [...log].reverse().find(l => l.includes('>>'));
  res.send(last || '');
});

app.get('/stats/ping', (req, res) => {
  const start = Date.now();
  dns.lookup('google.com', err => {
    res.json({ ping: err ? -1 : Date.now() - start });
  });
});

app.get('/stats/traffic', (req, res) => {
  res.json({ requestsPerMinute: trafficCount });
});


// ─── AUTH & CHAT ─────────────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins   = read('admins.json');
  const status   = read('status.json');

  // OFF-mode lockout (only GOD HIMSELF)
  if (status.off && username !== 'GOD HIMSELF') {
    return res.send({ redirect: 'off.html' });
  }
  if (accounts[username] !== password) {
    return res.send({ success: false });
  }

  const lastlogin = read('lastlogin.json');
  const logArr    = read('log.json');
  logArr.push(`<<${username} Logged on! Last logged in: ${lastlogin[username] || 'Never'}>>`);
  lastlogin[username] = new Date().toLocaleString();
  write('lastlogin.json', lastlogin);
  write('log.json', logArr);

  res.send({ success: true, isAdmin: admins.includes(username) });
});

app.post('/logoff', (req, res) => {
  const { username } = req.body;
  const logArr = read('log.json');
  logArr.push(`<<${username} Logged off>>`);
  write('log.json', logArr);
  res.send('OK');
});

app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');

  if (status.paused && user !== 'GOD HIMSELF') return res.send('Chat is paused');
  if (blacklist.includes(user))               return res.send('You are banned');

  const logArr = read('log.json');
  logArr.push(`${user}>>${message}`);
  write('log.json', logArr);
  res.send('OK');
});


// ─── ADMIN COMMANDS ───────────────────────────────────────────────────────────────
app.post('/clear', (req, res) => {
  // wipe log, leave single system notice
  write('log.json', ['<<SYSTEM>> Chat cleared by admin>>']);
  res.send('OK');
});

app.post('/ban', (req, res) => {
  const target = req.body.user;
  if (target !== 'GOD HIMSELF') {
    const list = read('blacklist.json');
    if (!list.includes(target)) write('blacklist.json', [...list, target]);
  }
  res.send('OK');
});

app.post('/unban', (req, res) => {
  const target = req.body.user;
  write('blacklist.json', read('blacklist.json').filter(u => u !== target));
  res.send('OK');
});

app.post('/warn', (req, res) => {
  const { user: target, reason } = req.body;
  if (target !== 'GOD HIMSELF') {
    const warns = read('warns.json');
    warns[target] = reason;
    write('warns.json', warns);

    const logArr = read('log.json');
    logArr.push(`<<SYSTEM>> ${target} was warned: ${reason}>>`);
    write('log.json', logArr);
  }
  res.send('OK');
});

app.post('/pause', (req, res) => {
  const s = read('status.json');
  s.paused = true;
  write('status.json', s);
  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat paused>>');
  write('log.json', logArr);
  res.send('OK');
});

app.post('/unpause', (req, res) => {
  const s = read('status.json');
  s.paused = false;
  write('status.json', s);
  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat unpaused>>');
  write('log.json', logArr);
  res.send('OK');
});

app.post('/off', (req, res) => {
  const s = read('status.json');
  s.off = true;
  write('status.json', s);
  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat OFF (only GOD HIMSELF)>>');
  write('log.json', logArr);
  res.send('OK');
});

app.post('/on', (req, res) => {
  const s = read('status.json');
  s.off = false;
  write('status.json', s);
  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat ON>>');
  write('log.json', logArr);
  res.send('OK');
});

// 5) Start single listener
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
