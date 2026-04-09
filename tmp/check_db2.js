import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkIds() {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .select('id, id_bh, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
    
  if (error) console.error(error);
  console.log("Recent IDs:", data);
  
  const { count } = await supabase.from('the_ban_hang').select('*', { count: 'exact', head: true });
  console.log("Total count:", count);
}
checkIds();
