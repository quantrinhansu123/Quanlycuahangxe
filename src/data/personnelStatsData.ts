import { supabase } from '../lib/supabase';

export interface PersonnelDailyStats {
  date: string;
  totalOrders: number;
  totalSales: number;
  salesCards: any[];
  attendance: any | null;
}

export const getPersonnelDailyStats = async (
  personnelId: string,
  personnelName: string,
  dateStr: string
): Promise<PersonnelDailyStats> => {
  try {
    // 1. Fetch Sales Cards (the_ban_hang) where the personnel is responsible on the specific date
    const { data: salesData, error: salesError } = await supabase
      .from('the_ban_hang')
      .select('*, nhan_su(ho_ten), the_ban_hang_ct(*), khach_hang(ho_va_ten), dich_vu(ten_dich_vu, gia_ban)')
      .eq('nhan_vien_id', personnelId)
      .eq('ngay', dateStr);

    if (salesError) throw salesError;

    // Calculate total orders and sales
    const validSales = salesData || [];
    const totalOrders = validSales.length;

    let totalSalesValue = 0;
    validSales.forEach((card: any) => {
      // Check if there are detail items
      if (card.the_ban_hang_ct && card.the_ban_hang_ct.length > 0) {
        card.the_ban_hang_ct.forEach((ct: any) => {
          totalSalesValue += (ct.gia_ban || 0) * (ct.so_luong || 1);
        });
      } else if (card.dich_vu) {
        // Fallback to single service if no details
        totalSalesValue += card.dich_vu.gia_ban || 0;
      }
    });

    // 2. Fetch Attendance (cham_cong) for the personnel on the specific date
    // Some implementations store personnelName in the 'nhan_su' column, others store ID. 
    // We check both just to be safe.
    const { data: attendanceData, error: attError } = await supabase
      .from('cham_cong')
      .select('*')
      .eq('ngay', dateStr)
      .or(`nhan_su.eq.${personnelId},nhan_su.eq.${personnelName}`);

    if (attError) throw attError;

    const attendanceRecord = attendanceData && attendanceData.length > 0 ? attendanceData[0] : null;

    return {
      date: dateStr,
      totalOrders,
      totalSales: totalSalesValue,
      salesCards: validSales,
      attendance: attendanceRecord
    };

  } catch (error) {
    console.error('Error in getPersonnelDailyStats:', error);
    throw error;
  }
};
