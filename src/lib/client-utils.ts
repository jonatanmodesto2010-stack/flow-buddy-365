export interface ClientTimeline {
  id: string;
  client_name: string;
  client_id?: string | null;
  start_date: string;
  boleto_value?: number | null;
  due_date?: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
  updated_at?: string;
  organization_id?: string;
  completed_at?: string | null;
  completion_notes?: string | null;
  user_id: string;
  ixc_filial_id?: string | null;
  ixc_filial_name?: string | null;
}

export interface GroupedClient {
  client_id: string | null;
  client_name: string;
  is_active: boolean;
  status: string;
  primaryTimeline: ClientTimeline;
  timelines: ClientTimeline[];
}

/**
 * Groups multiple timelines by client_id, selecting the most relevant one as primary.
 * Priority: archived > blocked > active > completed
 */
export function groupTimelinesByClient(timelines: ClientTimeline[]): GroupedClient[] {
  const groups = new Map<string, ClientTimeline[]>();

  for (const t of timelines) {
    const key = t.client_id || t.id; // fallback to id if no client_id
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(t);
  }

  const results: GroupedClient[] = [];

  for (const [clientId, clientTimelines] of groups) {
    // Sort by priority
    const sorted = [...clientTimelines].sort((a, b) => {
      const priority = (t: ClientTimeline) => {
        if (t.status === 'archived') return 0; // highest
        if (!t.is_active && t.status !== 'completed') return 1;
        if (t.status === 'active' && t.is_active) return 2;
        if (t.status === 'completed') return 3;
        return 4;
      };
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      // Within same priority, most recently updated first
      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });

    const primary = sorted[0];

    results.push({
      client_id: primary.client_id || null,
      client_name: primary.client_name,
      is_active: primary.is_active,
      status: primary.status,
      primaryTimeline: primary,
      timelines: clientTimelines,
    });
  }

  return results;
}

/**
 * Calculates the maximum overdue days for a client based on their unpaid boletos
 */
export function calculateOverdueDays(boletos: { due_date: string; status: string }[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let maxDays = 0;

  for (const b of boletos) {
    if (b.status === 'pago' || b.status === 'cancelado') continue;
    const dueDate = new Date(b.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      maxDays = diffDays;
    }
  }

  return maxDays;
}

/**
 * Sort clients by priority: blocked > overdue > active > inactive/completed
 */
export function sortClients(
  clients: GroupedClient[],
  overdueDaysMap: Map<string, number>
): GroupedClient[] {
  return [...clients].sort((a, b) => {
    const groupPriority = (c: GroupedClient) => {
      if (!c.is_active && c.status !== 'archived' && c.status !== 'completed') return 0; // blocked
      if (c.is_active && c.status === 'active' && (overdueDaysMap.get(c.primaryTimeline.id) || 0) > 0) return 1; // overdue
      if (c.is_active && c.status === 'active') return 2; // active
      if (c.status === 'archived') return 3; // inactive
      if (c.status === 'completed') return 4; // completed
      return 5;
    };

    const pa = groupPriority(a);
    const pb = groupPriority(b);
    if (pa !== pb) return pa - pb;

    // Within blocked or overdue groups, sort by most days overdue (desc)
    if (pa === 0 || pa === 1) {
      const daysA = overdueDaysMap.get(a.primaryTimeline.id) || 0;
      const daysB = overdueDaysMap.get(b.primaryTimeline.id) || 0;
      if (daysA !== daysB) return daysB - daysA;
    }

    // Alphabetical tie-breaker
    return a.client_name.localeCompare(b.client_name);
  });
}

/**
 * Badge info for a client timeline (used in card rendering)
 */
export interface ClientBadgeInfo {
  overdueDays: number;
  isBlocked: boolean;
  isOverdue: boolean;
  isInactive: boolean;
  isCompleted: boolean;
}

export function getClientBadgeInfo(
  client: { id: string; is_active: boolean; status: string },
  overdueDaysMap: Map<string, number>
): ClientBadgeInfo {
  const overdueDays = overdueDaysMap.get(client.id) || 0;
  const isBlocked = !client.is_active && client.status !== 'archived' && client.status !== 'completed';
  const isOverdue = client.is_active && client.status === 'active' && overdueDays > 0;
  const isInactive = client.status === 'archived';
  const isCompleted = client.status === 'completed';
  return { overdueDays, isBlocked, isOverdue, isInactive, isCompleted };
}

export function getCardStyle(info: ClientBadgeInfo): string {
  if (info.isBlocked) return 'bg-red-500/10 border border-red-500/30';
  if (info.isOverdue) return 'bg-yellow-500/10 border border-yellow-500/30';
  if (info.isInactive || info.isCompleted) return 'bg-muted border border-border opacity-70';
  return 'bg-card border border-border';
}

/**
 * Formats connection duration from a timestamp to a human-readable string.
 * Returns null if the input is invalid.
 */
export function formatConnectionDuration(since: string | null | undefined): string | null {
  if (!since) return null;
  try {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) return null;
    const diffMs = Date.now() - sinceDate.getTime();
    if (diffMs < 0) return null;
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  } catch {
    return null;
  }
}
