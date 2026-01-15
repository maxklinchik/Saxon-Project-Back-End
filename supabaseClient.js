const { createClient } = require('@supabase/supabase-js');

function createSupabaseClient(url, serviceKey) {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}

module.exports = { createSupabaseClient };
