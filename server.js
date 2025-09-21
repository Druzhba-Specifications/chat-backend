const express = require('express');
const fs = require('fs');
const cors = require('cors');
const dns = require('dns');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const read  = file => JSON.parse(fs.readFileSync(file));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const sanitize = str => decodeURIComponent(str).trim();

let trafficCount = 0;
setInterval(() => trafficCount = 0, 60000);
app.use((req, res, next) => { trafficCount++; next(); });

// GET endpoints (status, log, ranks, warns, blacklist, stats) – unchanged...

// LOGIN
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const status   = read('status.json');

  // If chat is OFF, only GOD HIMSELF can log in
  if (status.off && username !== 'GOD HIMSELF') {
    return res.send({ redirect: 'off.html' });
  }

  if (accounts[username] !== password) {
    return res.send({ success: false });
  }

  // Log the login
  const lastlogin = read('lastlogin.json');
  const now       = new Date().toLocaleString();
  const log       = read('log.json');
  log.push(`<<${username} Logged on! Last logged in: ${lastlogin[username] || 'Never'}>>`);
  write('lastlogin.json', { ...lastlogin, [username]: now });
  write('log.json', log);

  res.send({ success: true, isAdmin: read('admins.json').includes(username) });
});

// LOGOFF
app.post('/logoff', (req, res) => {
  const { username } = req.body;
  const log = read('log.json');
  log.push(`<<${username} Logged off>>`);
  write('log.json', log);
  res.send('OK');
});

// SEND MESSAGE
app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');

  // If paused, only GOD HIMSELF can talk
  if (status.paused && user !== 'GOD HIMSELF') {
    return res.send('Chat is paused');
  }

  // If banned
  if (blacklist.includes(user)) {
    return res.send('You are banned');
  }

  const log = read('log.json');
  log.push(`${user}>>${message}`);
  write('log.json', log);
  res.send('Message saved');
});

// BAN
app.post('/ban', (req, res) => {
  const target = sanitize(req.body.user);
  if (target === 'GOD HIMSELF') {
    return res.send({ success: false, message: 'Cannot ban GOD HIMSELF' });
  }
  const list = read('blacklist.json');
  if (!list.includes(target)) {
    write('blacklist.json', [...list, target]);
  }
  res.send({ success: true });
});

// UNBAN
app.post('/unban', (req, res) => {
  const target = sanitize(req.body.user);
  const list = read('blacklist.json').filter(u => u !== target);
  write('blacklist.json', list);
  res.send({ success: true });
});

// WARN
app.post('/warn', (req, res) => {
  const { user: target, reason } = req.body;
  if (target === 'GOD HIMSELF') {
    return res.send({ success: false, message: 'Cannot warn GOD HIMSELF' });
  }

  const warns = read('warns.json');
  warns[target] = reason;
  write('warns.json', warns);

  // System‐log it so it appears in chat
  const log = read('log.json');
  log.push(`<<SYSTEM>> ${target} was warned: ${reason}`);
  write('log.json', log);

  res.send({ success: true });
});

// OFF — kick everyone except GOD HIMSELF
app.post('/off', (req, res) => {
  const status = read('status.json');
  status.off = true;
  write('status.json', status);

  const log = read('log.json');
  log.push(`<<SYSTEM>> Chat turned OFF by admin. Only GOD HIMSELF may return.`);
  write('log.json', log);

  res.send('OK');
});

// UNOFF
app.post('/on', (req, res) => {
  const status = read('status.json');
  status.off = false;
  write('status.json', status);

  const log = read('log.json');
  log.push(`<<SYSTEM>> Chat turned ON by admin.`);
  write('log.json', log);

  res.send('OK');
});

// …other routes: /pause, /unpause, /stats as before…

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
