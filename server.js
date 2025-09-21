const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const read = file => JSON.parse(fs.readFileSync(file));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const sanitize = str => decodeURIComponent(str).trim();

app.get('/', (req, res) => res.send('✅ Chat backend is running!'));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins = read('admins.json');
  const blacklist = read('blacklist.json');
  const status = read('status.json');

  if (status.off && !admins.includes(username)) return res.send({ redirect: 'off.html' });
  if (accounts[username] !== password) return res.send({ success: false });

  const lastlogin = read('lastlogin.json');
  const now = new Date().toLocaleString();
  const log = read('log.json');
  log.push(`<<${username} Logged on! Last logged in: ${lastlogin[username] || 'Never'}>>`);
  lastlogin[username] = now;
  write('lastlogin.json', lastlogin);
  write('log.json', log);

  res.send({ success: true, isAdmin: admins.includes(username) });
});

app.post('/logoff', (req, res) => {
  const { username } = req.body;
  const log = read('log.json');
  log.push(`<<${username} Logged Off! Tell them goodbye!>>`);
  write('log.json', log);
  res.send('Logged off');
});

app.get('/log', (req, res) => res.json(read('log.json')));

app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const blacklist = read('blacklist.json');
  const status = read('status.json');
  const admins = read('admins.json');

  if (status.paused && !admins.includes(user)) return res.send('Chat is paused');
  if (blacklist.includes(user)) return res.send('You are banned');

  const log = read('log.json');
  log.push(`${user}>>${message}`);
  write('log.json', log);
  res.send('Message saved');
});

app.post('/ban', (req, res) => {
  const user = sanitize(req.body.user);
  const list = read('blacklist.json');
  if (!list.includes(user)) {
    list.push(user);
    write('blacklist.json', list);
  }
  res.send({ success: true });
});

app.post('/unban', (req, res) => {
  const user = sanitize(req.body.user);
  const list = read('blacklist.json').filter(u => u !== user);
  write('blacklist.json', list);
  res.send({ success: true });
});

app.post('/warn', (req, res) => {
  const { user, reason, message } = req.body;
  const warns = read('warns.json');
  warns[sanitize(user)] = { reason, message };
  write('warns.json', warns);
  res.send({ success: true });
});

app.get('/warn/:user', (req, res) => {
  const user = sanitize(req.params.user);
  const warns = read('warns.json');
  res.json(warns[user] || { reason: '', message: '' });
});

app.post('/del', (req, res) => {
  const { line } = req.body;
  const log = read('log.json');
  if (line >= 0 && line < log.length) {
    log.splice(line, 1);
    write('log.json', log);
    res.send('Deleted');
  } else {
    res.status(400).send('Invalid line number');
  }
});

app.post('/clear', (req, res) => {
  write('log.json', []);
  res.send('Cleared');
});

app.post('/pause', (req, res) => {
  const status = read('status.json');
  status.paused = true;
  write('status.json', status);
  res.send('Paused');
});

app.post('/unpause', (req, res) => {
  const status = read('status.json');
  status.paused = false;
  write('status.json', status);
  res.send('Unpaused');
});

app.post('/off', (req, res) => {
  const status = read('status.json');
  status.off = true;
  write('status.json', status);
  res.send('Turned off');
});

app.post('/on', (req, res) => {
  const status = read('status.json');
  status.off = false;
  write('status.json', status);
  res.send('Turned on');
});

app.get('/status', (req, res) => res.json(read('status.json')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
