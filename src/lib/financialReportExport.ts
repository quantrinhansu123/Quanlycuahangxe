export interface ReportSheet { name: string; headers: string[]; rows: (string | number)[][] }
type Result = { id: number; buffer?: ArrayBuffer; error?: string };

/** Only the workbook generation runs in the worker; no API/session/token enters it. */
export class FinancialReportExporter {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void; cleanup: () => void }>();
  constructor() {
    this.ensureWorker();
  }
  private ensureWorker(): Worker {
    if(this.worker)return this.worker;
    this.worker = new Worker(new URL('../workers/financialReportExcel.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<Result>) => {
      const task = this.pending.get(data.id);
      if (!task) return;
      this.pending.delete(data.id); task.cleanup();
      if (data.error || !data.buffer) task.reject(new Error(data.error || 'Không tạo được file Excel.'));
      else task.resolve(data.buffer);
    };
    this.worker.onerror = () => this.dispose(new Error('Không tải được bộ xuất Excel. Vui lòng thử lại.'));
    return this.worker;
  }
  generate(sheets: ReportSheet[], signal?: AbortSignal): Promise<ArrayBuffer> {
    signal?.throwIfAborted();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const abort = () => { this.pending.delete(id); cleanup(); reject(new DOMException('Đã hủy xuất báo cáo.', 'AbortError')); };
      const cleanup = () => signal?.removeEventListener('abort', abort);
      this.pending.set(id, { resolve,reject,cleanup });
      signal?.addEventListener('abort', abort, { once: true });
      try { this.ensureWorker().postMessage({ id,sheets }); }
      catch (error) { this.pending.delete(id); cleanup(); reject(error instanceof Error ? error : new Error('Không gửi được dữ liệu xuất Excel.')); }
    });
  }
  dispose(reason: Error = new DOMException('Đã hủy xuất báo cáo.', 'AbortError')) {
    this.worker?.terminate(); this.worker=null;
    for (const task of this.pending.values()) { task.cleanup(); task.reject(reason); }
    this.pending.clear();
  }
}
export function downloadReportExcel(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Keep the URL until the browser starts consuming the download.
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
