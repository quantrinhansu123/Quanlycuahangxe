import * as XLSX from 'xlsx-js-style';
export const createReportWorkbook = () => XLSX.utils.book_new();
export function appendReportSheet(book: XLSX.WorkBook, name: string, headers: string[], rows: (string | number)[][]) {
  const border = Object.fromEntries(['top','bottom','left','right'].map(side => [side, { style: 'thin', color: { rgb: 'D1D5DB' } }]));
  const matrix = [headers, ...rows].map((row, r) => row.map((value, c) => {
    const date = r > 0 && headers[c]?.includes('Ngày') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const numeric = typeof value === 'number';
    const format = date ? 'dd/mm/yyyy' : numeric ? /Biên|Tỷ trọng/.test(headers[c]) ? '0.0%' : Number.isInteger(value) ? '#,##0;[Red](#,##0)' : '#,##0.00;[Red](#,##0.00)' : '@';
    return { v: date ? (Date.parse(`${value}T00:00:00Z`) - Date.UTC(1899,11,30)) / 86400000 : value, t: date || numeric ? 'n' : 's', z: format,
      s: { border, font: { name: 'Calibri', sz: 11, bold: r === 0 }, numFmt: format, alignment: { vertical: 'center', horizontal: r === 0 ? 'center' : numeric || date ? 'right' : 'left', wrapText: true }, fill: { fgColor: { rgb: r === 0 ? 'E5E7EB' : r % 2 ? 'FFFFFF' : 'F9FAFB' } } } };
  }));
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet['!cols'] = headers.map((h,c) => ({ wch: Math.min(45,Math.max(16,h.length + 3,...rows.slice(0,200).map(row => typeof row[c] === 'number' ? 18 : String(row[c] || '').length + 2))) }));
  sheet['!rows'] = [{ hpt: 32 }];
  if (rows.length) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0,c: 0 }, e: { r: rows.length,c: headers.length - 1 } }) };
  XLSX.utils.book_append_sheet(book,sheet,name);
}
export function saveReportWorkbook(book: XLSX.WorkBook, filename: string) { XLSX.writeFile(book,filename); }
