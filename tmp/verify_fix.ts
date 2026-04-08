import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { getNextSalesCardCode } from '../src/data/salesCardData';

dotenv.config();

async function verifyFix() {
  console.log('--- Verifying getNextSalesCardCode fix ---');
  try {
    const nextCode = await getNextSalesCardCode();
    console.log('Calculated Next Code:', nextCode);
    
    if (nextCode === 'BH-000001') {
      console.log('Warning: It still returned BH-000001. Checking if this is correct...');
    } else {
      console.log('Success: It returned a code other than BH-000001 (or correctly incremented).');
    }
  } catch (error) {
    console.error('Verification failed with error:', error);
  }
}

verifyFix();
