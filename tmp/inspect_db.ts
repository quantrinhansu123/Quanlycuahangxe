import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
  console.log('--- Inspecting the_ban_hang table ---');
  
  // 1. Get raw count
  const { count } = await supabase.from('the_ban_hang').select('*', { count: 'exact', head: true });
  console.log('Total records:', count);

  // 2. Get top 20 by id_bh descending (lexicographical)
  const { data: topLex, error: err1 } = await supabase
    .from('the_ban_hang')
    .select('id_bh, created_at')
    .is('id_bh', 'not.null')
    .order('id_bh', { ascending: false })
    .limit(20);
  
  if (err1) console.error('Error Lex:', err1);
  console.log('\nTop 20 (Lexicographical Desc):');
  topLex?.forEach(r => console.log(`- ${r.id_bh} (Created: ${r.created_at})`));

  // 3. Get any record that might be causing regex failure
  // In JS, check which one fails the regex
  const fails = topLex?.filter(r => !r.id_bh.match(/^BH-(\d+)$/));
  if (fails && fails.length > 0) {
    console.log('\nRecords FAILING regex ^BH-(\\d+)$:');
    fails.forEach(r => console.log(`- "${r.id_bh}"`));
  } else {
    console.log('\nAll top 20 match the regex pattern.');
  }

  // 4. Try to find the TRUE numeric maximum if possible
  // We can't do numeric cast easily in JS without fetching data, 
  // but let's check if there are any records missing padding.
}

inspectData();
