import { Check, ChevronDown, Search, X } from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "../../lib/utils"

interface Option {
  value: string
  label: React.ReactNode | string
  searchKey?: string
}

interface SearchableSelectProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
}

const MAX_VISIBLE_ITEMS = 50;

export const SearchableSelect = React.memo(function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyMessage = "Không có kết quả.",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  )

  // Filter + limit items for performance
  const filteredOptions = React.useMemo(() => {
    if (!search) return options.slice(0, MAX_VISIBLE_ITEMS);
    const q = search.toLowerCase();
    const matched = options.filter(o => {
      const targetStr = o.searchKey ? o.searchKey.toLowerCase() : (typeof o.label === 'string' ? o.label.toLowerCase() : '');
      return targetStr.includes(q);
    });
    return matched.slice(0, MAX_VISIBLE_ITEMS);
  }, [options, search]);

  const remainingCount = React.useMemo(() => {
    if (!search) return Math.max(0, options.length - MAX_VISIBLE_ITEMS);
    const q = search.toLowerCase();
    const totalMatched = options.filter(o => {
      const targetStr = o.searchKey ? o.searchKey.toLowerCase() : (typeof o.label === 'string' ? o.label.toLowerCase() : '');
      return targetStr.includes(q);
    }).length;
    return Math.max(0, totalMatched - MAX_VISIBLE_ITEMS);
  }, [options, search]);

  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);

      // Scroll lock on mobile
      if (isMobile) {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = originalStyle;
        };
      }
    }
  }, [open, isMobile]);

  const dropdownContent = (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
        style={{ zIndex: 1999 }}
        onClick={() => setOpen(false)}
      />

      <div
        className={cn(
          "fixed inset-0 flex flex-col bg-background sm:absolute sm:inset-auto sm:left-0 sm:right-0 sm:top-full sm:mt-1 sm:bg-popover sm:border sm:border-border sm:rounded-xl sm:shadow-xl sm:overflow-hidden",
          isMobile ? "z-2000" : "z-1100"
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sm:hidden bg-muted/30">
          <span className="font-bold text-base text-foreground">{placeholder}</span>
          <button
            type="button"
            className="p-2 -mr-2 bg-muted text-muted-foreground rounded-full hover:bg-muted-foreground hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center border-b border-border/40 px-3 bg-muted/5">
          <Search className="mr-2 h-5 w-5 sm:h-4 sm:w-4 shrink-0 opacity-40" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-12 sm:h-10 w-full bg-transparent py-3 text-[15px] sm:text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex-1 overflow-y-auto sm:max-h-60 p-1 sm:flex-none">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <>
              {filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 sm:px-3 sm:py-2 rounded-lg cursor-pointer text-[14px] sm:text-[13px] font-bold transition-colors hover:bg-primary hover:text-white text-popover-foreground",
                    value === option.value && "bg-primary text-white"
                  )}
                >
                  {option.label}
                  {value === option.value && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="py-2 px-3 text-center text-[11px] text-muted-foreground italic border-t border-border/30 mt-1">
                  Còn {remainingCount} kết quả khác. Gõ thêm để thu hẹp...
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold transition-all",
          open && "ring-2 ring-primary/20 border-primary/50",
          !selectedOption && "text-muted-foreground/60",
          className
        )}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 ml-2">
          {value && !disabled && (
            <X
              size={14}
              className="text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onValueChange("")
              }}
            />
          )}
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground/40 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (isMobile ? createPortal(dropdownContent, document.body) : dropdownContent)}
    </div>
  )
})
