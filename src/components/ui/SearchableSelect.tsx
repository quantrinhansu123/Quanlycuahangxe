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

export function SearchableSelect({
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

  const selectedOption = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-xl border border-border/80 bg-muted/10 px-4 py-2 text-[13px] font-medium transition-all hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/10",
            open && "border-primary ring-2 ring-primary/5",
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
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-(--radix-popover-trigger-width) p-0 shadow-xl border-border/60">
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
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-[13px] font-medium transition-colors hover:bg-primary/5",
                    value === option.value && "bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                >
                  {option.label}
                  {value === option.value && (
                    <Check className="h-4 w-4 text-primary" />
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
