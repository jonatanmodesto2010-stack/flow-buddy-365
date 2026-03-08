import { useState, useEffect, useMemo, useRef } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseClient } from '@/lib/supabase-client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Event {
  id: string;
  client_name: string;
  event_date: string;
  event_time?: string;
  description: string | null;
  status: string;
  icon: string;
}

type ViewMode = 'today' | 'week' | 'month';

interface CalendarWidgetProps {
  organizationId: string | null;
  onClientClick?: (clientName: string) => void;
}

// Convert a Date to dd/MM format used in event_date
const toEventDateStr = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

// Build array of dd/MM strings for a date range
const buildDateRange = (start: Date, end: Date): string[] => {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(toEventDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export const CalendarWidget = ({ organizationId, onClientClick }: CalendarWidgetProps) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'today') {
      return buildDateRange(currentDate, currentDate);
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return buildDateRange(start, end);
    } else {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return buildDateRange(start, end);
    }
  }, [currentDate, viewMode]);

  useEffect(() => {
    if (organizationId) {
      loadEvents();
    }
  }, [organizationId, dateRange]);

  // Realtime
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel('calendar-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeline_events' }, () => loadEvents())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const loadEvents = async () => {
    if (!organizationId || dateRange.length === 0) return;
    if (!initialLoadDone.current) {
      setLoading(true);
    }

    try {
      // Query events filtered by date range directly
      // event_date is stored as dd/MM text, so we use .in() filter
      const { data: eventsData } = await supabaseClient
        .from('timeline_events')
        .select(`
          id, event_date, event_time, description, status, icon,
          line:timeline_lines!inner(
            timeline:client_timelines!inner(
              id, client_name, organization_id, is_active
            )
          )
        `)
        .in('event_date', dateRange);

      // Filter by organization on client side (RLS handles security, but we need org filter)
      const mapped: Event[] = [];
      for (const event of (eventsData || [])) {
        const line = event.line as any;
        const timeline = line?.timeline;
        if (timeline?.organization_id === organizationId && timeline?.is_active) {
          mapped.push({
            id: event.id,
            client_name: timeline.client_name || 'Cliente',
            event_date: event.event_date,
            event_time: event.event_time,
            description: event.description,
            status: event.status,
            icon: event.icon,
          });
        }
      }

      setEvents(mapped);
      initialLoadDone.current = true;
    } catch (err) {
      console.error('CalendarWidget load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date();
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getWeekDays = (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(start, i));
    }
    return days;
  };

  const weekDays = getWeekDays(currentDate);

  const getEventsForDate = (date: Date) => {
    const dateStr = toEventDateStr(date);
    return events.filter(e => e.event_date === dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500';
      case 'no_response': return 'bg-red-500';
      case 'created': return 'bg-yellow-500';
      default: return 'bg-muted';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'no_response': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'created': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const navigatePrev = () => {
    if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="h-6 w-32 bg-muted animate-pulse rounded mb-4" />
        <div className="h-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-lg font-bold text-center mb-3">Calendário de Eventos</h3>

      <div className="flex justify-center gap-2 mb-4">
        {(['today', 'week', 'month'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              viewMode === mode
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            {mode === 'today' ? '📅 Hoje' : mode === 'week' ? '📅 Semana' : '📅 Mês'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <button onClick={navigatePrev} className="p-1 hover:bg-muted rounded">
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">
            {monthNames[currentDate.getMonth()]} de {currentDate.getFullYear()}
          </span>
          <button onClick={goToToday} className="text-xs px-2 py-0.5 bg-muted rounded hover:bg-muted/80">
            Ir para Hoje
          </button>
        </div>
        <button onClick={navigateNext} className="p-1 hover:bg-muted rounded">
          <ChevronRight size={18} />
        </button>
      </div>

      {viewMode === 'week' && (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, i) => {
              const isToday = day.toDateString() === today.toDateString();
              return (
                <div key={i} className="text-center">
                  <div className="text-xs text-muted-foreground">{dayNames[day.getDay()]}</div>
                  <div className={cn(
                    'text-sm font-medium rounded-full w-7 h-7 flex items-center justify-center mx-auto',
                    isToday && 'bg-primary text-primary-foreground'
                  )}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {weekDays.map((day) => {
              const dayEvents = getEventsForDate(day);
              if (dayEvents.length === 0) return null;
              return dayEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => onClientClick?.(event.client_name)}
                >
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', getStatusColor(event.status))} />
                  <div className="min-w-0 flex-1">
                    <Badge className={cn('text-[10px] px-1 py-0 mb-0.5', getStatusBadgeColor(event.status))}>
                      {event.status === 'created' ? 'CRA' : event.status === 'resolved' ? 'CRA' : 'CRA'}
                    </Badge>
                    <p className="text-xs font-medium truncate">{event.client_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{event.description || 'Sem descrição'}</p>
                    <div className={cn('w-4 h-4 rounded-full flex items-center justify-center mt-1', getStatusColor(event.status))}>
                      <span className="text-[8px]">{event.icon}</span>
                    </div>
                  </div>
                </div>
              ));
            })}
          </div>
        </div>
      )}

      {viewMode === 'today' && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {getEventsForDate(today).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem eventos hoje</p>
          ) : (
            getEventsForDate(today).map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted"
                onClick={() => onClientClick?.(event.client_name)}
              >
                <span className="text-lg">{event.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.client_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                </div>
                <div className={cn('w-2 h-2 rounded-full', getStatusColor(event.status))} />
              </div>
            ))
          )}
        </div>
      )}

      {viewMode === 'month' && (
        <div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {dayNames.map(d => (
              <div key={d} className="text-[10px] text-muted-foreground py-1">{d}</div>
            ))}
            {(() => {
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDay; i++) {
                cells.push(<div key={`empty-${i}`} />);
              }
              for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(year, month, d);
                const dayEvents = getEventsForDate(date);
                const isToday = date.toDateString() === today.toDateString();
                cells.push(
                  <div
                    key={d}
                    className={cn(
                      'text-xs p-0.5 rounded text-center cursor-pointer hover:bg-muted',
                      isToday && 'bg-primary text-primary-foreground font-bold',
                      dayEvents.length > 0 && !isToday && 'font-bold'
                    )}
                  >
                    {d}
                    {dayEvents.length > 0 && (
                      <div className="flex justify-center gap-0.5 mt-0.5">
                        {dayEvents.length <= 3 ? dayEvents.map((e, i) => (
                          <div key={i} className={cn('w-1 h-1 rounded-full', getStatusColor(e.status))} />
                        )) : (
                          <span className="text-[8px] text-muted-foreground">{dayEvents.length}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
