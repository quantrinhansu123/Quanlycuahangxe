import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
}) => {
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalCount);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      if (end === totalPages) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-3 sm:px-4 py-3 bg-card border-t border-border mt-auto">
      {/* Description */}
      <div className="text-[12px] sm:text-[13px] text-muted-foreground order-2 sm:order-1 text-center sm:text-left">
        Hiển thị <span className="font-bold text-foreground">{totalCount === 0 ? 0 : startRange}</span>
        -
        <span className="font-bold text-foreground">{endRange}</span>
        trong tổng số
        <span className="font-bold text-foreground"> {totalCount.toLocaleString()}</span> bản ghi
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 order-1 sm:order-2">
        {onPageSizeChange && (
          <select 
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1.5 bg-background border border-border rounded-lg text-[12px] sm:text-[13px] outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            disabled={loading}
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>
                {size} / trang
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1 || loading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all hidden xs:flex"
            title="Trang đầu"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || loading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Trang trước"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1 mx-0.5">
            {getPageNumbers().map(pageNum => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                disabled={loading}
                className={clsx(
                  "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[12px] sm:text-[13px] font-bold transition-all",
                  currentPage === pageNum 
                    ? "bg-primary text-white shadow-lg shadow-primary/25" 
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || loading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Trang sau"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages || loading}
            className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all hidden xs:flex"
            title="Trang cuối"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
