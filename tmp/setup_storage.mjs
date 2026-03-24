
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setup() {
  console.log('Checking buckets...');
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error('List error:', listError);
    return;
  }

  const exists = buckets.some(b => b.name === 'images');
  if (exists) {
    console.log('Bucket "images" already exists.');
  } else {
    console.log('Creating bucket "images"...');
    const { data, error } = await supabase.storage.createBucket('images', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif'],
      fileSizeLimit: 10485760 // 10MB
    });
    if (error) {
       console.error('Create error:', error);
       console.log('NOTE: You might need to use the Service Role Key for this operation, or create it manually in the Dashboard.');
    } else {
       console.log('Bucket "images" created successfully.');
    }
  }
}

setup();
