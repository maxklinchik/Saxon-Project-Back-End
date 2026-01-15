/* Vanilla backend server for Bowling Project
   Minimal Express + SQLite DB with role-based access (player vs coach)
*/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { createLowdb } = require('./db/lowdb');
const { createSupabaseClient } = require('./supabaseClient');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const SQL_MODE = process.env.USE_SQL === '1';
const DB_PATH = SQL_MODE ? (__dirname + '/db.sqlite3') : (__dirname + '/db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dev-key';
const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/public'));

let lowdb = null;
let db = null;
let supabase = null;
if (SQL_MODE) {
  const sqlite3 = require('sqlite3').verbose();
  const dbExists = fs.existsSync(DB_PATH);
  db = new sqlite3.Database(DB_PATH);
} else {
  lowdb = createLowdb(DB_PATH);
}

// initialize supabase if credentials provided
const supabaseConfig = require('./supabase-config');
const SUPABASE_URL = supabaseConfig.url;
const SUPABASE_SERVICE_KEY = supabaseConfig.serviceKey;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('Supabase client initialized');
}

// nodemailer transporter if configured
let transporter = null;
if (supabaseConfig.email && supabaseConfig.email.auth && supabaseConfig.email.auth.user) {
  transporter = nodemailer.createTransport({
    host: supabaseConfig.email.host,
    port: supabaseConfig.email.port || 587,
    secure: supabaseConfig.email.secure || false,
    auth: {
      user: supabaseConfig.email.auth.user,
      pass: supabaseConfig.email.auth.pass,
    },
  });
  // verify transporter
  transporter.verify().then(() => console.log('Email transporter configured')).catch(err => console.warn('Email transporter verify failed', err.message || err));
}

function runQuery(q, params = []) {
  // SQLite helper
  if (SQL_MODE) {
    return new Promise((resolve, reject) => db.run(q, params, function (err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    }));
  }
  // lowdb fallback: No raw SQL here; ignore
  return Promise.reject(new Error('runQuery(SQL) not allowed in lowdb mode'));
}

function getOne(q, params = []){
  if (SQL_MODE) {
    return new Promise((resolve, reject) => db.get(q, params, (err, row) => (err ? reject(err) : resolve(row))));
  }
  return Promise.reject(new Error('getOne(SQL) not allowed in lowdb mode'));
}

function all(q, params = []){
  if (SQL_MODE) {
    return new Promise((resolve, reject) => db.all(q, params, (err, rows) => (err ? reject(err) : resolve(rows))));
  }
  return Promise.reject(new Error('all(SQL) not allowed in lowdb mode'));
}

function genCoachCode() {
  // generate 6-char alphanumeric uppercase
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function initDb() {
  if (SQL_MODE) {
    // sqlite schema creation
    const dbExists = fs.existsSync(DB_PATH);
    if (!dbExists) {
      console.log('Creating SQLite DB...');
      await runQuery(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('player','coach','admin')),
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      await runQuery(`CREATE TABLE locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        created_by INTEGER
      )`);

      await runQuery(`CREATE TABLE games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        location_id INTEGER,
        date TEXT,
        players TEXT,
        created_by INTEGER
      )`);

      const pwd = await bcrypt.hash('coachpass', 10);
      await runQuery('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)', ['Coach Admin', 'coach@club.local', 'coach', pwd]);
      await runQuery('INSERT INTO users (name, role) VALUES (?, ?)', ['Alice Student', 'player']);
      await runQuery('INSERT INTO users (name, role) VALUES (?, ?)', ['Bob Student', 'player']);

      await runQuery('INSERT INTO locations (name, address) VALUES (?, ?)', ['Lane 1', '123 Bowling St.']);
      const playersJSON = JSON.stringify([{ id: 2, name: 'Alice Student', score: 120 }, { id: 3, name: 'Bob Student', score: 90 }]);
      await runQuery('INSERT INTO games (title, location_id, date, players) VALUES (?, ?, ?, ?)', ['Weekly Fun', 1, '2025-11-01', playersJSON]);
      console.log('SQLite DB initialized.');
    } else {
      console.log('SQLite DB exists, skipping creation');
    }
  } else {
    // lowdb
    await lowdb.read();
    lowdb.data = lowdb.data || { users: [], locations: [], games: [] };
    // existing coach may not have coach_code; add if missing
    const existingCoach = (lowdb.data.users || []).find(u => u.email === 'coach@club.local');
    if (existingCoach && !existingCoach.coach_code) {
      existingCoach.coach_code = genCoachCode();
      console.log('Added coach_code to existing coach:', existingCoach.coach_code);
      await lowdb.write();
    }
    if (!lowdb.data.users.some(u => u.email === 'coach@club.local')) {
      const pwd = await bcrypt.hash('coachpass', 10);
      const coachCode = genCoachCode();
      lowdb.data.users.push({ id: 1, name: 'Coach Admin', email: 'coach@club.local', role: 'coach', password: pwd, coach_code: coachCode, created_at: new Date().toISOString() });
      lowdb.data.users.push({ id: 2, name: 'Alice Student', role: 'player' });
      lowdb.data.users.push({ id: 3, name: 'Bob Student', role: 'player' });
      lowdb.data.locations.push({ id: 1, name: 'Lane 1', address: '123 Bowling St.' });
      lowdb.data.games.push({ id: 1, title: 'Weekly Fun', location_id: 1, date: '2025-11-01', players: [{ id: 2, name: 'Alice Student', score: 120 }, { id: 3, name: 'Bob Student', score: 90 }] });
      await lowdb.write();
      console.log('lowdb JSON DB initialized. Coach code:', coachCode);
    }
  }
}

initDb().catch((err) => console.error('DB init error:', err));

// Auth helpers
function generateToken(user) {
  const payload = { id: user.id, name: user.name, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  }
}

// Endpoints
app.post('/api/auth/signin', async (req, res) => {
  // Accepts: {email?, name?, password?, role?}
  const { email, name, password, role } = req.body;
  try {
    if (email && password) {
      let user;
      if (supabase) {
        const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
        if (error) return res.status(500).json({ message: 'Server error' });
        user = data;
      } else if (SQL_MODE) user = await getOne('SELECT * FROM users WHERE email = ?', [email]);
      else { await lowdb.read(); user = (lowdb.data.users || []).find(u => u.email === email); }
      if (!user) return res.status(401).json({ message: 'No user found with that email' });
      if (!user.password) return res.status(401).json({ message: 'User has no password set' });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      // no email verification required — allow coaches to sign in immediately
      const token = generateToken(user);
        const payloadUser = { id: user.id, name: user.name, role: user.role };
        if (user.coach_code) payloadUser.coach_code = user.coach_code;
        return res.json({ user: payloadUser, token });
    }

    // Student-friendly sign-in: provide name, automatic player account creation
    if (!name) return res.status(400).json({ message: 'Name required for quick sign-in' });
    // Try to find by name
    let user;
    if (supabase) {
      const coach_code = genCoachCode();
      const { data: inserted, error } = await supabase.from('users').insert([{ name, email, role: 'coach', password: hashed, coach_code }]).select().single();
      if (error) return res.status(500).json({ message: 'Error creating coach' });
      const token = generateToken(inserted);
      return res.json({ user: { id: inserted.id, name: inserted.name, role: inserted.role, coach_code: inserted.coach_code }, token });
    } else if (SQL_MODE) {
      user = await getOne('SELECT * FROM users WHERE name = ?', [name]);
      if (!user) {
        const r = await runQuery('INSERT INTO users (name, role) VALUES (?, ?)', [name, 'player']);
        user = { id: r.lastID, name, role: 'player' };
      }
    } else {
      await lowdb.read();
      user = (lowdb.data.users || []).find(u => u.name === name);
      if (!user) {
        const id = (lowdb.data.users || []).reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
        user = { id, name, role: 'player', created_at: new Date().toISOString() };
        lowdb.data.users.push(user);
        await lowdb.write();
      }
    }
    const token = generateToken(user);
    res.json({ user: { id: user.id, name: user.name, role: user.role }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Student sign-in via coach code
app.post('/api/auth/signin-code', async (req, res) => {
  const { coachCode } = req.body;
  if (!coachCode) return res.status(400).json({ message: 'Coach code required' });
  try {
    if (supabase) {
      const { data: coach, error } = await supabase.from('users').select('*').eq('coach_code', coachCode).eq('role','coach').maybeSingle();
      if (error) return res.status(500).json({ message: 'Server error' });
      if (!coach) return res.status(404).json({ message: 'Coach not found' });
      // create guest player row
      const { data: newUser, error: insertErr } = await supabase.from('users').insert([{ name: `Guest ${Date.now()}`, role: 'player', coach_id: coach.id }]).select().single();
      if (insertErr) return res.status(500).json({ message: 'Server error' });
      const token = generateToken(newUser);
      return res.json({ user: { id: newUser.id, name: newUser.name, role: newUser.role, coachId: coach.id, coach_code: coach.coach_code }, token });
    } else if (SQL_MODE) {
      await runQuery('PRAGMA foreign_keys = ON');
      const coach = await getOne('SELECT * FROM users WHERE coach_code = ? AND role = "coach"', [coachCode]);
      if (!coach) return res.status(404).json({ message: 'Coach not found' });
      // create a guest player user tied to coach? For simplicity we just issue a token representing a player
      const guest = { id: `g_${Date.now()}`, name: 'Guest', role: 'player' };
      const token = generateToken(guest);
      return res.json({ user: { id: guest.id, name: 'Guest', role: 'player', coachId: coach.id }, token });
    }
    await lowdb.read();
    const coach = (lowdb.data.users || []).find(u => u.coach_code === coachCode && u.role === 'coach');
    if (!coach) return res.status(404).json({ message: 'Coach not found' });
    // create or reuse a guest player entry in lowdb
    const id = (lowdb.data.users || []).reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
    const user = { id, name: `Guest ${id}`, role: 'player', created_at: new Date().toISOString(), coachId: coach.id };
    lowdb.data.users.push(user);
    await lowdb.write();
      const token = generateToken(user);
      res.json({ user: { id: user.id, name: user.name, role: user.role, coachId: coach.id, coach_code: coach.coach_code }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// sign-up for coaches (admin-type) - requires a secret admin pass from env - keep simple here
const crypto = require('crypto');

app.post('/api/auth/signup-coach', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: 'Email, name and password required' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    // Open signup: create coach immediately and mark verified
    if (supabase) {
      const { data: inserted, error } = await supabase.from('users').insert([{ name, email, role: 'coach', password: hashed, coach_code: genCoachCode(), verified: true }]).select().single();
      if (error) return res.status(500).json({ message: 'Server error' });
      const token = generateToken(inserted);
      return res.json({ user: { id: inserted.id, name: inserted.name, role: inserted.role, coach_code: inserted.coach_code }, token, message: 'Created' });
    }
    if (SQL_MODE) {
      const r = await runQuery('INSERT INTO users (name, email, role, password, verified) VALUES (?, ?, ?, ?, ?)', [name, email, 'coach', hashed, 1]);
      const user = await getOne('SELECT * FROM users WHERE id = ?', [r.lastID]);
      const token = generateToken(user);
      return res.json({ user: { id: user.id, name: user.name, role: user.role }, token, message: 'Created' });
    }
    await lowdb.read();
    const id = (lowdb.data.users || []).reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
    const coach_code = genCoachCode();
    const u = { id, name, email, role: 'coach', password: hashed, coach_code, created_at: new Date().toISOString(), verified: true };
    lowdb.data.users.push(u);
    await lowdb.write();
    const token = generateToken(u);
    return res.json({ user: { id: u.id, name: u.name, role: u.role, coach_code: u.coach_code }, token, message: 'Created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating coach' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const id = req.user.id;
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ user: data });
    }
    if (SQL_MODE) {
      const user = await getOne('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) return res.status(404).json({ message: 'Not found' });
      return res.json({ user });
    }
    await lowdb.read();
    const u = (lowdb.data.users || []).find(x => String(x.id) === String(id));
    if (!u) return res.status(404).json({ message: 'Not found' });
    return res.json({ user: u });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update current user's preferences (e.g., prefs.accent)
app.put('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const id = req.user.id;
    const { prefs } = req.body;
    if (supabase) {
      const { error } = await supabase.from('users').update({ prefs }).eq('id', id);
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ message: 'Updated' });
    }
    if (SQL_MODE) {
      await runQuery('UPDATE users SET prefs = ? WHERE id = ?', [JSON.stringify(prefs || {}), id]);
      return res.json({ message: 'Updated' });
    }
    await lowdb.read();
    const idx = (lowdb.data.users || []).findIndex(u => String(u.id) === String(id));
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    lowdb.data.users[idx].prefs = prefs || {};
    await lowdb.write();
    return res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete current user's account
app.delete('/api/auth/delete-me', authMiddleware, async (req, res) => {
  try {
    const id = req.user.id;
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ message: 'Deleted' });
    }
    if (SQL_MODE) {
      await runQuery('DELETE FROM users WHERE id = ?', [id]);
      return res.json({ message: 'Deleted' });
    }
    await lowdb.read();
    lowdb.data.users = (lowdb.data.users || []).filter(u => String(u.id) !== String(id));
    await lowdb.write();
    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// verify a coach's email
app.get('/api/auth/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ message: 'Token required' });
  try {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').eq('verify_token', token).maybeSingle();
      if (error) return res.status(500).json({ message: 'Server error' });
      const user = data;
      if (!user) return res.status(404).json({ message: 'Invalid token' });
      await supabase.from('users').update({ verified: true, verify_token: null }).eq('id', user.id);
      return res.json({ message: 'Verified' });
    }
    if (SQL_MODE) {
      const user = await getOne('SELECT * FROM users WHERE verify_token = ?', [token]);
      if (!user) return res.status(404).json({ message: 'Invalid token' });
      await runQuery('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?', [user.id]);
      return res.json({ message: 'Verified' });
    }
    await lowdb.read();
    const u = (lowdb.data.users || []).find(x => x.verify_token === token);
    if (!u) return res.status(404).json({ message: 'Invalid token' });
    u.verified = true; u.verify_token = null; await lowdb.write();
    return res.json({ message: 'Verified' });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: 'Server error' });
  }
});

// Public GET endpoints
app.get('/api/locations', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('locations').select('*').order('id', { ascending: true });
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json(data);
  }
  if (SQL_MODE) {
    const rows = await all('SELECT * FROM locations ORDER BY id');
    return res.json(rows);
  }
  await lowdb.read();
  res.json(lowdb.data.locations || []);
});

app.get('/api/games', async (req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from('games').select('*').order('date', { ascending: false });
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json(data.map(d => ({ ...d, playersJSON: d.players }))); // normalize with playersJSON for front-end
  }
  if (SQL_MODE) {
    const rows = await all('SELECT * FROM games ORDER BY date DESC');
    rows.forEach(r => { try { r.playersJSON = JSON.parse(r.players || '[]'); } catch (e) { r.playersJSON = []; } });
    return res.json(rows);
  }
  await lowdb.read();
  res.json(lowdb.data.games || []);
});

app.get('/api/players', async (req, res) => {
  const team = req.query.team;
  const nameQuery = req.query.name;
  if (supabase) {
    let q = supabase.from('users').select('id, name, email, role, team, created_at').eq('role', 'player');
    if (team) q = q.eq('team', team);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json(data);
  }
  if (SQL_MODE) {
    const rows = await all('SELECT id, name, email, role, created_at, team FROM users WHERE role = "player"' + (team ? ' AND team = ?' : ''), team ? [team] : []);
    return res.json(rows);
  }
  await lowdb.read();
  let rows = (lowdb.data.users || []).filter(u => u.role === 'player').map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at, team: u.team }));
  if (team) rows = rows.filter(r => r.team === team);
  if (nameQuery) {
    const nq = String(nameQuery).toLowerCase();
    rows = rows.filter(r => String(r.name || '').toLowerCase().includes(nq));
  }
  res.json(rows);
});

// Legacy compatibility: allow GET /players/:name and DELETE /players/:name
app.get('/players/:name', async (req, res) => {
  const name = req.params.name;
  try {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('id,name,email,role,team,created_at').ilike('name', `%${name}%`).maybeSingle();
      if (error) return res.status(500).json({ message: 'Server error' });
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data);
    }
    if (SQL_MODE) {
      const row = await getOne('SELECT id, name, email, role, team, created_at FROM users WHERE name = ?', [name]);
      if (!row) return res.status(404).json({ message: 'Not found' });
      return res.json(row);
    }
    await lowdb.read();
    const u = (lowdb.data.users || []).find(x => String(x.name) === String(name));
    if (!u) return res.status(404).json({ message: 'Not found' });
    res.json(u);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/players/:name', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const name = req.params.name;
  try {
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('name', name);
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ message: 'Deleted' });
    }
    if (SQL_MODE) {
      await runQuery('DELETE FROM users WHERE name = ?', [name]);
      return res.json({ message: 'Deleted' });
    }
    await lowdb.read();
    lowdb.data.users = (lowdb.data.users || []).filter(u => String(u.name) !== String(name));
    await lowdb.write();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Minimal teams endpoint: derive teams from users
app.get('/api/teams', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('users').select('team').neq('team', null);
      if (error) return res.status(500).json({ message: 'Server error' });
      const teams = Array.from(new Set((data || []).map(t => t.team).filter(Boolean)));
      return res.json(teams);
    }
    if (SQL_MODE) {
      const rows = await all('SELECT DISTINCT team FROM users WHERE team IS NOT NULL');
      const teams = (rows || []).map(r => r.team).filter(Boolean);
      return res.json(teams);
    }
    await lowdb.read();
    const teams = Array.from(new Set((lowdb.data.users || []).map(u => u.team).filter(Boolean)));
    res.json(teams);
  } catch (err) {
    console.error('teams error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Protected endpoints: only coaches (role: coach/admin) can modify
// Scores endpoints for recording per-player daily scores
app.get('/api/scores', async (req, res) => {
  const player_id = req.query.player_id ? Number(req.query.player_id) : null;
  const location_id = req.query.location_id ? Number(req.query.location_id) : null;
  if (supabase) {
    let q = supabase.from('scores').select('*').order('date', { ascending: false });
    if (player_id) q = q.eq('player_id', player_id);
    if (location_id) q = q.eq('location_id', location_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json(data);
  }
  if (SQL_MODE) {
    const rows = await all('SELECT * FROM scores ORDER BY date DESC');
    return res.json(rows.filter(r => (player_id ? r.player_id === player_id : true) && (location_id ? r.location_id === location_id : true)));
  }
  await lowdb.read();
  let rows = lowdb.data.scores || [];
  if (player_id) rows = rows.filter(r => r.player_id === player_id);
  if (location_id) rows = rows.filter(r => r.location_id === location_id);
  res.json(rows);
});

app.post('/api/scores', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { player_id, date, location_id, level, scores, spares, strikes, substitute_for, opponent } = req.body;
  if (!player_id || !scores || !Array.isArray(scores) || scores.length !== 3) return res.status(400).json({ message: 'player_id and three scores required' });
  const avg = Math.round(scores.reduce((a,b)=>a+b,0) / 3);
  const totalWood = scores.reduce((a,b)=>a+b,0);
  if (supabase) {
    const { data, error } = await supabase.from('scores').insert([{ player_id, date, location_id, level, opponent, scores, avg, totalWood, spares, strikes, substitute_for, created_by: req.user.id }]).select().single();
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ id: data.id });
  }
  if (SQL_MODE) {
    const r = await runQuery('INSERT INTO scores (player_id, date, location_id, level, opponent, scores, avg, totalWood, spares, strikes, substitute_for, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [player_id, date, location_id, level, opponent, JSON.stringify(scores), avg, totalWood, spares, strikes, substitute_for, req.user.id]);
    return res.json({ id: r.lastID });
  }
  await lowdb.read();
  const id = (lowdb.data.scores || []).reduce((m, s) => s.id > m ? s.id : m, 0) + 1;
  const entry = { id, player_id, date, location_id, level, opponent, scores, avg, totalWood, spares, strikes, substitute_for, created_by: req.user.id, created_at: new Date().toISOString() };
  lowdb.data.scores.push(entry);
  await lowdb.write();
  res.json({ id });
});

app.put('/api/scores/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { scores, spares, strikes, substitute_for } = req.body;
  if (supabase) {
    const { error } = await supabase.from('scores').update({ scores, spares, strikes, substitute_for }).eq('id', id);
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ message: 'Updated' });
  }
  if (SQL_MODE) {
    await runQuery('UPDATE scores SET scores = ?, spares = ?, strikes = ?, substitute_for = ? WHERE id = ?', [JSON.stringify(scores), spares, strikes, substitute_for, id]);
    return res.json({ message: 'Updated' });
  }
  await lowdb.read();
  const idx = (lowdb.data.scores || []).findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  lowdb.data.scores[idx] = { ...lowdb.data.scores[idx], scores, spares, strikes, substitute_for };
  await lowdb.write();
  res.json({ message: 'Updated' });
});
app.post('/api/locations', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { name, address } = req.body;
  if (supabase) {
    const { data, error } = await supabase.from('locations').insert([{ name, address, created_by: req.user.id }]).select().single();
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ id: data.id });
  }
  if (SQL_MODE) {
    const r = await runQuery('INSERT INTO locations (name, address, created_by) VALUES (?, ?, ?)', [name, address, req.user.id]);
    return res.json({ id: r.lastID });
  }
  await lowdb.read();
  const id = (lowdb.data.locations || []).reduce((max, l) => (l.id > max ? l.id : max), 0) + 1;
  lowdb.data.locations.push({ id, name, address, created_by: req.user.id });
  await lowdb.write();
  res.json({ id });
});

app.post('/api/games', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { title, location_id, date, players } = req.body;
  if (supabase) {
    const { data, error } = await supabase.from('games').insert([{ title, location_id, date, players, created_by: req.user.id }]).select().single();
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ id: data.id });
  }
  if (SQL_MODE) {
    const playersJSON = JSON.stringify(players || []);
    const r = await runQuery('INSERT INTO games (title, location_id, date, players, created_by) VALUES (?, ?, ?, ?, ?)', [title, location_id, date, playersJSON, req.user.id]);
    return res.json({ id: r.lastID });
  }
  await lowdb.read();
  const id = (lowdb.data.games || []).reduce((max, l) => (l.id > max ? l.id : max), 0) + 1;
  lowdb.data.games.push({ id, title, location_id, date, players });
  await lowdb.write();
  res.json({ id });
});

// Create a new user (coach/admin only) - primarily used to create players manually
app.post('/api/users', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { name, email, role = 'player', password, team } = req.body;
  if (!name) return res.status(400).json({ message: 'Name required' });
  if (supabase) {
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const { data, error } = await supabase.from('users').insert([{ name, email, role, password: hashed, team }]).select('id, name, email, role, team, created_at').single();
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ user: data });
  }
  if (SQL_MODE) {
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const r = await runQuery('INSERT INTO users (name, email, role, password, team) VALUES (?, ?, ?, ?, ?)', [name, email, role, hashed, team]);
    const user = await getOne('SELECT id, name, email, role, team, created_at FROM users WHERE id = ?', [r.lastID]);
    return res.json({ user });
  }
  await lowdb.read();
  const id = (lowdb.data.users || []).reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
  const hashed = password ? await bcrypt.hash(password, 10) : undefined;
  const u = { id, name, email, role, password: hashed, team: team || null, created_at: new Date().toISOString() };
  lowdb.data.users.push(u);
  await lowdb.write();
  res.json({ user: { id: u.id, name: u.name, role: u.role, email: u.email, created_at: u.created_at } });
});

// Delete a location (coach/admin only)
app.delete('/api/locations/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (SQL_MODE) {
    await runQuery('DELETE FROM locations WHERE id = ?', [id]);
    return res.json({ message: 'Deleted' });
  }
  await lowdb.read();
  lowdb.data.locations = (lowdb.data.locations || []).filter(l => Number(l.id) !== id);
  await lowdb.write();
  res.json({ message: 'Deleted' });
});

app.put('/api/games/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { id } = req.params;
  const { title, location_id, date, players } = req.body;
  if (supabase) {
    const { data, error } = await supabase.from('games').update({ title, location_id, date, players }).eq('id', id).select().single();
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ message: 'Updated' });
  }
  if (SQL_MODE) {
    const playersJSON = JSON.stringify(players || []);
    await runQuery('UPDATE games SET title = ?, location_id = ?, date = ?, players = ? WHERE id = ?', [title, location_id, date, playersJSON, id]);
    return res.json({ message: 'Updated' });
  }
  await lowdb.read();
  const idx = (lowdb.data.games || []).findIndex(g => String(g.id) === String(id));
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  lowdb.data.games[idx] = { ...lowdb.data.games[idx], title, location_id, date, players };
  await lowdb.write();
  res.json({ message: 'Updated' });
});

app.delete('/api/games/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { id } = req.params;
  if (supabase) {
    const { error } = await supabase.from('games').delete().eq('id', id);
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ message: 'Deleted' });
  }
  if (SQL_MODE) {
    await runQuery('DELETE FROM games WHERE id = ?', [id]);
    return res.json({ message: 'Deleted' });
  }
  await lowdb.read();
  lowdb.data.games = (lowdb.data.games || []).filter(g => String(g.id) !== String(id));
  await lowdb.write();
  res.json({ message: 'Deleted' });
});

app.put('/api/users/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { id } = req.params;
  const { name, role } = req.body;
  if (supabase) {
    const { error } = await supabase.from('users').update({ name, role }).eq('id', id);
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ message: 'Updated' });
  }
  if (SQL_MODE) {
    await runQuery('UPDATE users SET name = ?, role = ? WHERE id = ?', [name, role, id]);
    return res.json({ message: 'Updated' });
  }
  await lowdb.read();
  const idx = (lowdb.data.users || []).findIndex(u => String(u.id) === String(id));
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  lowdb.data.users[idx] = { ...lowdb.data.users[idx], name, role };
  await lowdb.write();
  res.json({ message: 'Updated' });
});

// Delete a user (coach/admin only)
app.delete('/api/users/:id', authMiddleware, requireRole('coach','admin'), async (req, res) => {
  const { id } = req.params;
  if (supabase) {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ message: 'Server error' });
    return res.json({ message: 'Deleted' });
  }
  if (SQL_MODE) {
    await runQuery('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ message: 'Deleted' });
  }
  await lowdb.read();
  lowdb.data.users = (lowdb.data.users || []).filter(u => String(u.id) !== String(id));
  await lowdb.write();
  res.json({ message: 'Deleted' });
});

// Note: coach/admin can create players via POST /api/users earlier and delete locations via the single shared location delete endpoint.

app.listen(port, () => console.log(`Server listening on ${port}`));
