import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const performanceMigration = 'supabase/migrations/202610240001_sales_payment_lookup_performance.sql';

export async function createSalesDatabase({ optimized = true } = {}) {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA app_private;
      CREATE TABLE nhan_su(id uuid PRIMARY KEY,ho_ten text,vi_tri text,co_so text);
      INSERT INTO nhan_su VALUES
        ('00000000-0000-0000-0000-000000000001','Admin','Admin','A'),
        ('00000000-0000-0000-0000-000000000002','Worker','Tho','A'),
        ('00000000-0000-0000-0000-000000000003','Accountant','Ke toan','A'),
        ('00000000-0000-0000-0000-000000000004','Manager','quan ly','B');
      CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
      CREATE FUNCTION app_search_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(t,'')) $$;
      CREATE FUNCTION app_is_technician() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM nhan_su WHERE id=current_app_nhan_su_uuid() AND vi_tri='Tho') $$;
      CREATE FUNCTION app_branch(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(t,'')) $$;
      CREATE FUNCTION can_manage_business_finance(p_branch text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION can_manage_purchase_receipt(t text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT can_manage_business_finance(t) $$;
      CREATE FUNCTION validate_sales_order_branch(branch text,staff text,customer text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF branch NOT IN ('A','B') OR branch IS NULL THEN RAISE EXCEPTION 'Invalid branch'; END IF; END $$;
      CREATE TABLE ds_san_pham(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_san_pham text,ten_san_pham text,ton_dau_ky numeric);
      CREATE TABLE khach_hang(id uuid PRIMARY KEY,ma_khach_hang text);
      CREATE TABLE the_ban_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_bh text UNIQUE,ngay date,gio time,co_so text,khach_hang_id text,nhan_vien_id text,dich_vu_id text,danh_gia text,so_km integer,ngay_nhac_thay_dau date,ghi_chu text,ten_khach_hang text,so_dien_thoai text,tong_tien numeric,phuong_thuc_thanh_toan text,updated_at timestamptz DEFAULT now());
      CREATE VIEW the_ban_hang_visible AS SELECT * FROM the_ban_hang;
      CREATE TABLE the_ban_hang_ct(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,ten_don_hang text,san_pham text,co_so text,gia_ban numeric,gia_von numeric,so_luong numeric,chi_phi numeric,ghi_chu text,ngay date,thanh_tien numeric GENERATED ALWAYS AS (gia_ban*so_luong) STORED);
      CREATE TABLE nhap_xuat_kho(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,loai_phieu text,source_type text);
      CREATE TABLE phieu_nhap_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_phieu text,ngay date,co_so text,nha_cung_cap text,tong_tien numeric,da_thanh_toan numeric DEFAULT 0,con_no numeric DEFAULT 0,trang_thai_thanh_toan text);
      CREATE TABLE thu_chi(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),loai_phieu text,id_don text,source_type text,source_id uuid,co_so text,id_khach_hang text,nguoi_nhan text,danh_muc text,so_tien numeric,trang_thai text,phuong_thuc text,ngay date,gio time,ghi_chu text);
      CREATE UNIQUE INDEX thu_chi_sales_order_source_unique ON thu_chi(source_id) WHERE source_type='sales_order' AND source_id IS NOT NULL;
      CREATE FUNCTION save_purchase_receipt(p_receipt jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_receipt $$;
      SELECT set_config('app.actor','00000000-0000-0000-0000-000000000001',false);
    `);
    const catalog = fs.readFileSync('supabase/migrations/202609080002_branch_catalog.sql', 'utf8');
    await db.exec(catalog.slice(catalog.indexOf('CREATE OR REPLACE FUNCTION public.can_create_branch'), catalog.indexOf('ALTER TABLE public.co_so ENABLE')));
    for (const name of ['202610100003_purchase_payment_reconciliation.sql', '202610110001_anc_accounting_details.sql',
      '202610120001_technician_initial_sales_receipt.sql', '202610190001_delete_sales_order_atomic.sql', '202610230001_save_sales_order_atomic.sql']) {
      await db.exec(fs.readFileSync(`supabase/migrations/${name}`, 'utf8'));
    }
    if (optimized) {
      await db.exec(fs.readFileSync(performanceMigration, 'utf8'));
      await db.exec(fs.readFileSync(performanceMigration, 'utf8'));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
