import { lineCost, lineQuantity, lineRevenue, type BusinessOrderDetailInput } from './businessReportMetrics';

/** Keep order amounts when several saved rows share one service selector item. */
export function mergeSalesLineAmounts(lines: Array<BusinessOrderDetailInput & { chi_phi?: number | null }>) {
  const quantity = lines.reduce((sum, line) => sum + lineQuantity(line), 0);
  const revenue = lines.reduce((sum, line) => sum + lineRevenue(line), 0);
  const cost = lines.reduce((sum, line) => sum + lineCost(line), 0);
  return {
    gia_ban: quantity > 0 ? revenue / quantity : Number(lines[0]?.gia_ban ?? 0),
    gia_von: quantity > 0 ? cost / quantity : Number(lines[0]?.gia_von ?? 0),
    so_luong: quantity,
    chi_phi: lines.reduce((sum, line) => sum + (Number(line.chi_phi) || 0), 0),
  };
}
