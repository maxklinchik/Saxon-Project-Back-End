const supabase = require('../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const url = new URL(req.url, 'http://localhost');
    const team = url.searchParams.get('team');
    const name = url.searchParams.get('name');
    let q = supabase.from('users').select('id,name,email,role,team,created_at').eq('role','player');
    if (team) q = q.eq('team', team);
    if (name) q = q.ilike('name', `%${name}%`);
    const { data, error } = await q;
    if (error) return res.status(500).json({ message: 'Server error' });
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
