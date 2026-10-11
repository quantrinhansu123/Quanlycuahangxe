import * as XLSX from 'xlsx-js-style';
import { createReportWorkbook,appendReportSheet } from '../lib/reportExcel';
import type { ReportSheet } from '../lib/financialReportExport';
const workerScope = self as unknown as { onmessage: ((event: MessageEvent<{id:number;sheets:ReportSheet[]}>) => void) | null; postMessage: (value: unknown, transfer?: Transferable[]) => void };
workerScope.onmessage = ({data}) => {
  try {
    const book=createReportWorkbook();
    for (const sheet of data.sheets) appendReportSheet(book,sheet.name,sheet.headers,sheet.rows);
    const buffer=XLSX.write(book,{type:'array',bookType:'xlsx',compression:true}) as ArrayBuffer;
    workerScope.postMessage({id:data.id,buffer},[buffer]);
  } catch (error) { workerScope.postMessage({id:data.id,error:error instanceof Error ? error.message : 'Không tạo được file Excel.'}); }
};
