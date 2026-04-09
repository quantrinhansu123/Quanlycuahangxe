import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('khach_hang').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log("Keys in khach_hang:", Object.keys(data[0] || {}));
  }
}

check();
