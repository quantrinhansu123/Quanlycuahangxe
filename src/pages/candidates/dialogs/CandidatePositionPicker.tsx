import { useEffect, useId, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, Loader2, Plus, RotateCw } from 'lucide-react';
import { clsx } from 'clsx';
import { Command, CommandInput, CommandItem, CommandList } from '../../../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { getCandidatePositions } from '../../../data/candidateData';
import { positionOptions } from '../data';

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
const searchKey = (name: string) => cleanName(name).toLocaleLowerCase('vi')
  .normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd');

type Catalog = { status: 'loading' | 'error' } | { status: 'ready'; names: string[] };

export default function CandidatePositionPicker({ value, onChange, disabled }: {
  value: string;
  onChange: (position: string) => void;
  disabled: boolean;
}) {
  const labelId = useId();
  const valueId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    getCandidatePositions(controller.signal).then(
      names => { if (!controller.signal.aborted) setCatalog({ status: 'ready', names }); },
      () => { if (!controller.signal.aborted) setCatalog({ status: 'error' }); },
    );
    return () => controller.abort();
  }, [attempt]);

  const names = new Map<string, string>();
  for (const name of [...positionOptions.map(option => option.label), ...(catalog.status === 'ready' ? catalog.names : [])]) {
    const key = searchKey(name);
    if (key && !names.has(key)) names.set(key, name.trim());
  }
  if (searchKey(value)) names.set(searchKey(value), value);

  const newName = cleanName(query);
  const key = searchKey(newName);
  const matches = [...names].filter(([nameKey]) => nameKey.includes(key))
    .sort(([first], [second]) => Number(second === key) - Number(first === key));
  const canAdd = catalog.status === 'ready' && !!key && !names.has(key);

  function changeOpen(next: boolean) {
    setQuery('');
    setOpen(next);
  }

  function choose(name: string) {
    onChange(name);
    changeOpen(false);
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <span id={labelId} className="block text-[13px] font-bold text-foreground">Vị trí</span>
      <Popover open={open && !disabled} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-labelledby={`${labelId} ${valueId}`}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-border bg-muted/10 px-3 py-2 text-left text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-muted/30 aria-expanded:border-primary disabled:opacity-60 sm:text-sm"
          >
            <Briefcase size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <span id={valueId} className={clsx('min-w-0 flex-1 wrap-anywhere', !value && 'text-muted-foreground')}>
              {value || 'Chọn hoặc thêm vị trí'}
            </span>
            <ChevronDown size={16} aria-hidden="true" className={clsx('shrink-0 text-muted-foreground', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-labelledby={labelId}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={event => {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          className="w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) overflow-hidden border-border bg-card shadow-lg motion-reduce:animate-none"
        >
          <Command label="Tìm hoặc thêm vị trí" shouldFilter={false} className="max-h-(--radix-popover-content-available-height) bg-card text-foreground">
            <CommandInput
              ref={inputRef}
              placeholder="Tìm hoặc nhập vị trí mới…"
              value={query}
              onValueChange={setQuery}
              className="min-w-0 text-base sm:text-sm"
            />
            <CommandList className="min-h-0 max-h-56 overscroll-contain p-1.5">
              {matches.map(([nameKey, name]) => (
                <CommandItem
                  key={nameKey}
                  value={`position:${nameKey}`}
                  onSelect={() => choose(name)}
                  className="min-h-11 cursor-pointer gap-2 rounded-lg px-2.5 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground"
                >
                  <span className="min-w-0 flex-1 wrap-anywhere">{name}</span>
                  {name === value && <Check size={16} className="shrink-0 text-primary" aria-label="Vị trí hiện tại" />}
                </CommandItem>
              ))}
              {canAdd && (
                <CommandItem
                  value="create-position"
                  onSelect={() => choose(newName)}
                  className="min-h-11 cursor-pointer gap-2 rounded-lg px-2.5 font-semibold text-primary data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                >
                  <Plus size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 wrap-anywhere">Thêm mới “{newName}”</span>
                </CommandItem>
              )}
              {catalog.status === 'error' && (
                <CommandItem
                  value="retry-positions"
                  onSelect={() => { setCatalog({ status: 'loading' }); setAttempt(n => n + 1); }}
                  className="min-h-11 cursor-pointer gap-2 rounded-lg text-sm"
                >
                  <RotateCw size={16} aria-hidden="true" className="shrink-0" />
                  Thử tải lại danh sách vị trí
                </CommandItem>
              )}
            </CommandList>
            <div role="status" className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {catalog.status === 'loading' ? (
                <span className="flex items-center gap-2"><Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Đang tải vị trí…</span>
              ) : catalog.status === 'error' ? (
                'Không tải được đầy đủ vị trí. Hãy thử lại để thêm mới.'
              ) : (
                'Vị trí mới được lưu cùng hồ sơ nhân sự.'
              )}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
