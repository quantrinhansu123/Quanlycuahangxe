import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const PRODUCTS = [
  { name: 'Thay dầu Castrol', price: 150000, cost: 80000 },
  { name: 'Bảo dưỡng xe ga', price: 500000, cost: 200000 },
  { name: 'Thay lốp Michelin', price: 1200000, cost: 900000 },
  { name: 'Rửa xe bọt tuyết', price: 50000, cost: 10000 },
  { name: 'Thay má phanh', price: 250000, cost: 120000 },
];

const STAFF = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Văn D'];
const BRANCHES = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh', 'Cơ sở Hải Dương'];

async function generate() {
  console.log('Generating test data...');

  const orders = [];
  const details = [];

  for (let i = 0; i < 50; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    const dateStr = date.toISOString().split('T')[0];
    
    // 1-3 staff members
    const numStaff = Math.floor(Math.random() * 3) + 1;
    const shuffledStaff = [...STAFF].sort(() => 0.5 - Math.random());
    const orderStaff = shuffledStaff.slice(0, numStaff).join(',');
    
    const id_bh = `BH-${(100000 + i).toString()}`;
    const branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)];

    orders.push({
      id_bh,
      ngay: dateStr,
      nhan_vien_id: orderStaff,
    });

    // 1-4 products per order
    const numProd = Math.floor(Math.random() * 4) + 1;
    for (let j = 0; j < numProd; j++) {
      const prod = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const qty = Math.floor(Math.random() * 3) + 1;
      details.push({
        id_don_hang: id_bh,
        san_pham: prod.name,
        gia_ban: prod.price,
        gia_von: prod.cost,
        so_luong: qty,
        thanh_tien: prod.price * qty,
        co_so: branch,
        ngay: dateStr
      });
    }
  }

  console.log(`Inserting ${orders.length} orders...`);
  const { error: err1 } = await supabase.from('the_ban_hang').insert(orders);
  if (err1) {
    console.error('Error inserting orders:', err1);
    return;
  }
  console.log('Inserted orders successfully.');

  console.log(`Inserting ${details.length} order details...`);
  const { error: err2 } = await supabase.from('the_ban_hang_ct').insert(details);
  if (err2) {
    console.error('Error inserting details:', err2);
    return;
  }
  console.log('Inserted order details successfully.');
  console.log('Test data generation complete!');
}

generate().catch(console.error);
