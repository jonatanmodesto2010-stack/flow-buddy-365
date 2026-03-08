import { useState, useRef, useEffect } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface DateRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

interface DashboardDateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const presets: { label: string; getRange: () => { from: Date; to: Date } }[] = [
  {
    label: 'Últimos 30 dias',
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: 'Últimos 60 dias',
    getRange: () => ({ from: subDays(new Date(), 60), to: new Date() }),
  },
  {
    label: 'Últimos 90 dias',
    getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
  {
    label: 'Este mês',
    getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: 'Mês passado',
    getRange: () => {
      const prev = subMonths(new Date(), 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    },
  },
  {
    label: 'Este ano',
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

export const DashboardDateFilter = ({ value, onChange }: DashboardDateFilterProps) => {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const handlePreset = (preset: typeof presets[0]) => {
    const range = preset.getRange();
    onChange({ from: range.from, to: range.to, label: preset.label });
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (!customFrom || !customTo) return;
    const from = new Date(customFrom + 'T00:00:00');
    const to = new Date(customTo + 'T23:59:59');
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return;
    onChange({
      from,
      to,
      label: `${format(from, 'dd/MM/yy')} - ${format(to, 'dd/MM/yy')}`,
    });
    setOpen(false);
  };

  const handleClear = () => {
    onChange({ from: null, to: null, label: 'Todo período' });
    setCustomFrom('');
    setCustomTo('');
    setOpen(false);
  };

  const displayLabel = value.label || 'Todo período';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs font-medium"
        >
          <CalendarDays size={14} />
          {displayLabel}
          {value.from && (
            <X
              size={14}
              className="ml-1 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-foreground mb-2">Período rápido</p>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className={`text-xs px-2.5 py-1.5 rounded-md text-left transition-colors ${
                  value.label === preset.label
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Período personalizado</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" className="flex-1 text-xs h-7" onClick={handleCustomApply}>
              Aplicar
            </Button>
            {value.from && (
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={handleClear}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
