import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"

import { cn } from "../../lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface Option {
  value: string
  label: string
  price?: string
}

interface MultiSearchableSelectProps {
  options: Option[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
}

export function MultiSearchableSelect({
  options,
  value = [],
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyMessage = "Không có kết quả.",
  className,
  disabled = false,
}: MultiSearchableSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleUnselect = (item: string) => {
    onValueChange(value.filter((i) => i !== item))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex min-h-10 w-full flex-wrap items-center justify-between gap-1 px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus-within:ring-2 focus-within:ring-primary/20 text-[14px] font-bold transition-all cursor-pointer",
            open && "ring-2 ring-primary/20 border-primary/50",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          onClick={() => !disabled && setOpen(!open)}
        >
          <div className="flex flex-wrap gap-1">
            {value.length > 0 ? (
              value.map((val) => {
                const opt = options.find((o) => o.value === val)
                return (
                  <div
                    key={val}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary group transition-colors hover:bg-primary/20"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUnselect(val)
                    }}
                  >
                    {opt?.label || val}
                    <X size={12} className="text-primary/40 group-hover:text-primary" />
                  </div>
                )
              })
            ) : (
              <span className="text-muted-foreground/60 font-medium">{placeholder}</span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground/40 transition-transform duration-200 shrink-0",
              open && "rotate-180"
            )}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-border/60" style={{ zIndex: 1100 }}>
        <Command className="rounded-xl overflow-hidden">
          <div className="flex items-center border-b border-border/40 px-3 bg-muted/5">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-40" />
            <CommandInput 
              placeholder={searchPlaceholder} 
              className="h-10 border-none px-0 text-[13px] focus:ring-0"
            />
          </div>
          <CommandList className="max-h-60 p-1">
            <CommandEmpty className="py-6 text-[12px] text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    const isSelected = value.includes(option.value)
                    if (isSelected) {
                      onValueChange(value.filter((v) => v !== option.value))
                    } else {
                      onValueChange([...value, option.value])
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-[13px] font-bold transition-colors text-popover-foreground",
                    value.includes(option.value) ? "bg-primary text-white" : "hover:bg-primary/10"
                  )}
                >
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.price && (
                      <span className={cn(
                        "text-[11px] font-medium",
                        value.includes(option.value) ? "text-white/80" : "text-emerald-600"
                      )}>
                        {option.price}
                      </span>
                    )}
                  </div>
                  {value.includes(option.value) && (
                    <Check className="h-4 w-4 text-white" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
