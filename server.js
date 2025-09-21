const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const read = file => JSON.parse(fs.readFileSync(file));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

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
  if (status.paused && !read('admins.json').includes(user)) return res.send('Chat is paused');
  if (blacklist.includes(user)) return res.send('You are banned');

  const log = read('log.json');
  log.push(`${user}>>${message}`);
  write('log.json', log);
  res.send('Message saved');
});

app.post('/ban', (req, res) => {
  const list = read('blacklist.json');
  if (!list.includes(req.body.user)) list.push(req.body.user);
  write('blacklist.json', list);
  res.send('Banned');
});

app.post('/unban', (req, res) => {
  const list = read('blacklist.json').filter(u => u !== req.body.user);
  write('blacklist.json', list);
  res.send('Unbanned');
});

app.post('/warn', (req, res) => {
  const { reason, message } = req.body;
  write('warn.json', { reason, message });
  res.send('Warned');
});

app.get('/warn.json', (req, res) => res.json(read('warn.json')));

app.post('/del', (req, res) => {
  const log = read('log.json');
  log.splice(req.body.line, 1);
  write('log.json', log);
  res.send('Deleted');
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


