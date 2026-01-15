const supabase = require('../lib/supabaseClient');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const player_id = url.searchParams.get('player_id');
      const location_id = url.searchParams.get('location_id');
      let q = supabase.from('scores').select('*').order('date', { ascending: false });
      if (player_id) q = q.eq('player_id', Number(player_id));
      if (location_id) q = q.eq('location_id', Number(location_id));
      const { data, error } = await q;
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      const auth = verifyToken(req.headers && req.headers.authorization);
      if (!auth || !['coach','admin'].includes(auth.role)) return res.status(401).json({ message: 'Unauthorized' });
      const body = req.body || await getJson(req);
      const { player_id, date, location_id, level, scores, spares, strikes, substitute_for, opponent } = body;
      if (!player_id || !scores || !Array.isArray(scores) || scores.length !== 3) return res.status(400).json({ message: 'player_id and three scores required' });
      const avg = Math.round(scores.reduce((a,b)=>a+b,0) / 3);
      const totalWood = scores.reduce((a,b)=>a+b,0);
      const { data, error } = await supabase.from('scores').insert([{ player_id, date, location_id, level, opponent, scores: JSON.stringify(scores), avg, totalWood, spares, strikes, substitute_for, created_by: auth.id }]).select().single();
      if (error) return res.status(500).json({ message: 'Server error' });
      return res.json({ id: data.id });
    }

    res.status(405).end();
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

async function getJson(req){
  return new Promise((resolve)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{ resolve(JSON.parse(b||'{}')) }catch(e){ resolve({}) } }); });
}
