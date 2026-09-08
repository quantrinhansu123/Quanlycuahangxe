import { supabase } from '../lib/supabase';
import type { AttendanceRecord } from './attendanceData';
import { enrichSalesCards, type SalesCard } from './salesCardData';

export interface PersonnelDailyStats {
  date: string;
  totalOrders: number;
  totalSales: number;
  salesCards: SalesCard[];
  attendance: AttendanceRecord[];
}

export const getPersonnelDailyStats = async (
  personnelId: string,
  personnelName: string,
  startDateStr: string,
  endDateStr: string
): Promise<PersonnelDailyStats> => {
  try {
    // 1. Fetch Sales Cards (the_ban_hang) where the personnel is responsible on the specific date
    const { data: salesData, error: salesError } = await supabase
      .from('the_ban_hang')
      .select('*')
      .ilike('nhan_vien_id', `%${personnelId}%`)
      .gte('ngay', startDateStr)
      .lte('ngay', endDateStr);

    if (salesError) throw salesError;

    const validSales = (salesData || []) as SalesCard[];
    await enrichSalesCards(validSales);
    
    const totalOrders = validSales.length;

    let totalSalesValue = 0;
    validSales.forEach((card) => {
      // Check if there are detail items
      if (card.the_ban_hang_ct && card.the_ban_hang_ct.length > 0) {
        card.the_ban_hang_ct.forEach((ct) => {
          totalSalesValue += (ct.gia_ban || 0) * (ct.so_luong || 1);
        });
      } else if (card.dich_vu) {
        // Fallback to single service if no details
        totalSalesValue += card.dich_vu.gia_ban || 0;
      }
    });

    // 2. Fetch Attendance (cham_cong) for the personnel on the specific date
    const { data: attendanceData, error: attError } = await supabase
      .from('cham_cong')
      .select('*')
      .gte('ngay', startDateStr)
      .lte('ngay', endDateStr)
      .or(`nhan_su.eq.${personnelId},nhan_su.eq.${personnelName}`)
      .order('ngay', { ascending: false });

    if (attError) throw attError;

    return {
      date: `${startDateStr} - ${endDateStr}`,
      totalOrders,
      totalSales: totalSalesValue,
      salesCards: validSales,
      attendance: attendanceData || []
    };

  } catch (error) {
    console.error('Error in getPersonnelDailyStats:', error);
    throw error;
  }
};
