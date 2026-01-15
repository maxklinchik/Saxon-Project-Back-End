const supabase = require('../lib/supabaseClient');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const { data, error } = await supabase.from('users').select('team').not('team', 'is', null);
    if (error) return res.status(500).json({ message: 'Server error' });
    const teams = Array.from(new Set((data || []).map(t => t.team).filter(Boolean)));
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
