const supabase = require('../lib/supabaseClient');
const bcrypt = require('bcryptjs');
const { signToken } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = req.body || (await getJson(req));
    const { email, password, name } = body;
    if (email && password) {
      // sign in existing user
      const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if (error) return res.status(500).json({ message: 'Server error' });
      const user = data;
      if (!user || !user.password) return res.status(401).json({ message: 'No user or no password set' });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = signToken(user);
      return res.json({ user: { id: user.id, name: user.name, role: user.role }, token });
    }

    // Quick sign-in by name (student flow) - create player if missing
    if (!name) return res.status(400).json({ message: 'Name required' });
    const { data: existing } = await supabase.from('users').select('*').ilike('name', name).maybeSingle();
    if (existing) {
      const token = signToken(existing);
      return res.json({ user: { id: existing.id, name: existing.name, role: existing.role }, token });
    }
    const { data: created, error: insertErr } = await supabase.from('users').insert([{ name, role: 'player', created_at: new Date().toISOString() }]).select().single();
    if (insertErr) return res.status(500).json({ message: 'Error creating player' });
    const token = signToken(created);
    return res.json({ user: { id: created.id, name: created.name, role: created.role }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

async function getJson(req){
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',chunk=>body+=chunk);
    req.on('end',()=>{ try{ resolve(JSON.parse(body||'{}')) }catch(e){ resolve({}) } });
    req.on('error',reject);
  })
}
