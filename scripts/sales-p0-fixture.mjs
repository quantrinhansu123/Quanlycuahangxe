import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
export const migration = () => read('supabase/migrations/202610040001_sales_p0.sql');
export const rollback = () => read('supabase/rollback/202610040001_sales_p0.sql');
export const cid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export async function fixture() {
  const db = new PGlite();
  for (const name of ['khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'dich_vu', 'nhan_su']) {
    const ddl = (await read(`src/database/${name}.sql`)).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0];
    await db.exec(ddl.replaceAll('uuid_generate_v4()', 'gen_random_uuid()'));
  }
  for (const path of [
    '20260413_add_customer_info_to_sales', '202609080001_sales_customer_queries',
    '202609090001_query_timeout_fix', '202609090004_sales_date_scope',
    '202609100001_sales_search_timeout', '202609100002_short_numeric_sales_search',
  ]) await db.exec(await read(`supabase/migrations/${path}.sql`));
  // Use the actual audited definitions as OLD, including its customer projection.
  const backup = JSON.parse(await read('docs/performance-sales-p0/definitions-before.json'));
  await db.exec('ALTER TABLE khach_hang ADD COLUMN nhan_vien_id text, ADD COLUMN last_order_at timestamptz');
  for (const fn of backup.functions ?? backup) await db.exec(fn.definition);
  await db.exec(`CREATE ROLE p0_reader; CREATE ROLE p0_other;
    ALTER TABLE the_ban_hang_ct ALTER COLUMN san_pham SET DEFAULT 'Fixture detail';
    GRANT USAGE ON SCHEMA public TO p0_reader, p0_other;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO p0_reader, p0_other;
    GRANT EXECUTE ON FUNCTION sales_query(text,date,date,text,text,integer,integer,text,text) TO p0_reader;
    CREATE INDEX IF NOT EXISTS sales_date_page ON the_ban_hang(ngay DESC,gio DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_the_ban_hang_id_bh_ref ON the_ban_hang(lower(btrim(coalesce(id_bh,''))))
      WHERE id_bh IS NOT NULL AND length(btrim(id_bh))>0;
    INSERT INTO khach_hang(id,ma_khach_hang,ho_va_ten,so_dien_thoai,bien_so_xe,dia_chi_hien_tai,anh) VALUES
      ('${cid(1)}',' KH-A ','Đinh Thị Thiều','0392.251.537','27AZ-04620','Bắc Ninh','image-must-stay-out'),
      ('${cid(2)}','KH-B','Khách khác xe','+84 392251537','29A-12345','Bắc Giang',''),
      ('${cid(3)}','KH-C','---','0984050141','30A-88888','Bắc Giang',''),
      ('${cid(4)}','KH-D','—','0987654321','31A-11111','Bắc Ninh',''),
      ('${cid(5)}','COLLISION','E','','32A-11111','Bắc Ninh',''),
      ('${cid(6)}',' collision ','F','','33A-11111','Bắc Giang',''),
      ('${cid(7)}','${cid(1)}','G','','34A-11111','Bắc Ninh',''),
      ('${cid(8)}','${cid(8)}','H','','35A-11111',NULL,'');
    INSERT INTO nhan_su(ho_ten,id_nhan_su,vi_tri,co_so) VALUES
      ('An','NV1','quản lý','Bắc Ninh'),('Anh','NV2','kỹ thuật viên','Bắc Giang');
    INSERT INTO dich_vu(id,id_dich_vu,ten_dich_vu,gia_ban,co_so) VALUES
      ('${cid(901)}','SERVICE','Thay dầu',300,'Bắc Ninh'),
      ('${cid(902)}',' SERVICE ','Whitespace service',9999,'Bắc Giang');
    INSERT INTO the_ban_hang(id,id_bh,ngay,gio,khach_hang_id,nhan_vien_id,tong_tien,dich_vu_id) SELECT
      ('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,'BH-'||n,
      CASE WHEN n=1 THEN '2026-08-01'::date ELSE '2026-10-02'::date END,
      CASE WHEN n%2=0 THEN '10:00'::time ELSE '11:00'::time END,
      CASE WHEN n%2=0 THEN '${cid(1)}' ELSE ' kh-a ' END,
      'NV1, Anh',100+n,CASE WHEN n%3=0 THEN 'SERVICE' ELSE NULL END FROM generate_series(1,65) n;
    INSERT INTO the_ban_hang_ct(id_don_hang,co_so,gia_ban,so_luong) SELECT
      CASE WHEN id_bh='BH-1' THEN id::text ELSE id_bh END,
      CASE WHEN id_bh='BH-2' THEN 'Bắc Giang' ELSE 'Cơ sở Bắc Ninh' END,
      tong_tien,1 FROM the_ban_hang;
    INSERT INTO the_ban_hang(id,id_bh,ngay,gio,khach_hang_id,so_dien_thoai,ten_khach_hang,tong_tien,dich_vu_id) VALUES
      ('${cid(101)}','NAME','2026-09-01','10:00','KH-C',NULL,'Nguyễn Văn Bình',100,NULL),
      ('${cid(102)}','UUID-C','2026-10-01','11:00','${cid(3)}',NULL,NULL,9999,NULL),
      ('${cid(103)}','AMBIGUOUS','2026-10-01','10:00',NULL,'0392251537',NULL,5000,NULL),
      ('${cid(104)}','EXPLICIT-B','2026-10-01','10:00','KH-B','0984050141',NULL,200,NULL),
      ('${cid(105)}','PHONE-C','2026-10-01','10:00',NULL,'+84 984 050 141',NULL,400,NULL),
      ('${cid(106)}','DELETED-C','2026-10-01','11:00','DELETED','0984050141',NULL,500,NULL),
      ('${cid(107)}','SERVICE-C','2026-10-01','11:00','KH-C',NULL,NULL,0,'service'),
      ('${cid(108)}','ZERO-C','2026-10-01','10:00','KH-C',NULL,NULL,9999,'SERVICE'),
      ('${cid(109)}','PHONE-REF-C','2026-10-01','10:00','0984050141',NULL,NULL,50,NULL),
      ('${cid(110)}','CODE-COLLISION','2026-10-01','10:00','collision',NULL,NULL,60,NULL),
      ('${cid(111)}','${cid(111)}','2026-10-01','10:00','${cid(8)}',NULL,NULL,9999,NULL),
      ('${cid(112)}','PHONE-NO-NAME','2026-10-01','10:00',NULL,'0987654321','Unlinked name',80,NULL),
      ('${cid(113)}','LEGACY-ABC/09','2026-10-01','10:00','KH-DELETED',NULL,NULL,90,NULL),
      ('${cid(114)}',' RAW-CODE ','2026-10-01','10:00',NULL,NULL,NULL,90,NULL);
    INSERT INTO the_ban_hang_ct(id_don_hang,co_so,gia_ban,so_luong) VALUES
      ('UUID-C','Bắc Ninh',100,1),('${cid(102)}','Bắc Giang',25,2),
      ('ZERO-C','Bắc Ninh',100,0),('${cid(111)}','',70,1),
      ('LEGACY-ABC/09','  ',120,1),('BH-2','Bắc Ninh',50,2);
  `);
  return db;
}

export async function sales(db, args = {}) {
  const keys = Object.keys(args);
  return (await db.query(`SELECT sales_query(${keys.map((k,i) => `${k} => $${i+1}`).join(',')}) result`, Object.values(args))).rows[0].result;
}
export const cases = [
  {}, {p_page:2}, {p_page:3}, {p_page:4}, {p_limit:0}, {p_limit:-1}, {p_page:0}, {p_page:null,p_limit:null},
  {p_start:'2026-10-01',p_end:'2026-10-31'}, {p_start:'2026-08-01',p_end:'2026-08-01'},
  {p_start:'2030-01-01'}, {p_start:'2026-10-31',p_end:'2026-01-01'},
  ...['27az04620','04620','dinh thieu','+84 392251537','KH-A','BH-2','thay dau','service','nguyen binh','(),%_','','  ',null].map(p_search=>({p_search})),
  ...['An','NV1','Anh','NV2','A','','  ',null].map(p_staff=>({p_staff})),
  ...['Bắc Ninh',' cơ sở bắc giang ','unknown','','  ',null].map(p_branch=>({p_branch})),
  ...[cid(102),cid(102).toUpperCase(),'UUID-C','uuid-c',' UUID-C ','LEGACY-ABC/09',' RAW-CODE ',cid(111),'missing','not-a-uuid','','  ',null].map(p_reference=>({p_reference,p_limit:1})),
  ...[cid(1),' KH-A ','kh-a','KH-C',cid(6),cid(7),cid(8),'missing','',null].map(p_customer=>({p_customer})),
  {p_start:'2026-10-01',p_end:'2026-10-31',p_staff:'An',p_branch:'Bắc Ninh',p_search:'27AZ04620',p_page:2},
  {p_search:'thay dau',p_branch:'Bắc Ninh'}, {p_reference:'UUID-C',p_branch:'Bắc Giang'},
  {p_reference:'PHONE-NO-NAME'}, {p_reference:'ZERO-C'},
];
