const supabase = require('../lib/supabaseClient');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  const method = req.method;
  try {
    if (method === 'POST') {
      // create user (coach/admin only)
      const body = req.body || await getJson(req);
      const auth = verifyToken(req.headers && req.headers.authorization);
      if (!auth || !['coach','admin'].includes(auth.role)) return res.status(401).json({ message: 'Unauthorized' });
      const { name, email, role = 'player', team } = body;
      if (!name) return res.status(400).json({ message: 'Name required' });
      const { data, error } = await supabase.from('users').insert([{ name, email, role, team }]).select().single();
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ user: data });
    }

    if (method === 'DELETE') {
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/');
      const id = parts[parts.length-1];
      const auth = verifyToken(req.headers && req.headers.authorization);
      if (!auth || !['coach','admin'].includes(auth.role)) return res.status(401).json({ message: 'Unauthorized' });
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ message: 'Deleted' });
    }

    res.status(405).end();
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

async function getJson(req){
  return new Promise((resolve)=>{
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ try{ resolve(JSON.parse(body||'{}')) }catch(e){ resolve({}) } });
  });
}
