import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationBarProps {
  totalItems: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  totalItems,
  page,
  pageSize,
  pageSizeOptions = [24, 48, 96],
  onPageChange,
  onPageSizeChange,
  itemLabel = 'позиций',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);

  if (totalItems === 0) return null;

  const getVisiblePages = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis')[] = [1];
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);

    if (start > 2) pages.push('ellipsis');
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#E4E6EB] text-xs text-[#5A606D]">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono tabular-nums">
          {startItem.toLocaleString('ru-RU')}–{endItem.toLocaleString('ru-RU')} из{' '}
          {totalItems.toLocaleString('ru-RU')} {itemLabel}
        </span>

        {onPageSizeChange && (
          <label className="inline-flex items-center gap-1.5">
            <span>На странице:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-xs font-mono tabular-nums bg-white border border-[#D5D9E0] rounded text-[#111317]"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Постраничная навигация" className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(1)}
            aria-label="Первая страница"
            className="w-8 h-8 rounded border border-[#D5D9E0] bg-white flex items-center justify-center text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Предыдущая страница"
            className="w-8 h-8 rounded border border-[#D5D9E0] bg-white flex items-center justify-center text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {getVisiblePages().map((entry, idx) =>
            entry === 'ellipsis' ? (
              <span key={`el-${idx}`} className="px-1.5 text-[#8A919E]">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === safePage ? 'page' : undefined}
                className={`min-w-8 h-8 px-2 rounded border font-mono tabular-nums text-xs transition-colors ${
                  entry === safePage
                    ? 'bg-[#1B365D] border-[#1B365D] text-white font-semibold'
                    : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                }`}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Следующая страница"
            className="w-8 h-8 rounded border border-[#D5D9E0] bg-white flex items-center justify-center text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Последняя страница"
            className="w-8 h-8 rounded border border-[#D5D9E0] bg-white flex items-center justify-center text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </nav>
      )}
    </div>
  );
};
