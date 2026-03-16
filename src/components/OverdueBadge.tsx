
export interface StatusRule {
  id?: string;
  min_days: number;
  max_days: number | null;
  bg_color: string;
  text_color: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

const DEFAULT_RULES: StatusRule[] = [
  { min_days: -5, max_days: 0, bg_color: '#22c55e', text_color: '#ffffff', label: 'EM DIA', sort_order: 0, is_active: true },
  { min_days: 1, max_days: 5, bg_color: '#f59e0b', text_color: '#000000', label: 'ATRASO', sort_order: 1, is_active: true },
  { min_days: 6, max_days: 15, bg_color: '#ef4444', text_color: '#ffffff', label: 'ATRASO', sort_order: 2, is_active: true },
  { min_days: 16, max_days: null, bg_color: '#991b1b', text_color: '#ffffff', label: 'ATRASO', sort_order: 3, is_active: true },
];

export function findMatchingRule(overdueDays: number, rules: StatusRule[]): StatusRule | null {
  const activeRules = rules.filter(r => r.is_active).sort((a, b) => a.sort_order - b.sort_order);
  for (const rule of activeRules) {
    const matchesMin = overdueDays >= rule.min_days;
    const matchesMax = rule.max_days === null || overdueDays <= rule.max_days;
    if (matchesMin && matchesMax) return rule;
  }
  return null;
}

export function getDefaultRules(): StatusRule[] {
  return DEFAULT_RULES;
}

interface OverdueBadgeProps {
  overdueDays: number;
  rules?: StatusRule[];
}

export const OverdueBadge = ({ overdueDays, rules }: OverdueBadgeProps) => {
  const effectiveRules = rules && rules.length > 0 ? rules : DEFAULT_RULES;
  const rule = findMatchingRule(overdueDays, effectiveRules);

  if (!rule) return null;

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg overflow-hidden min-w-[48px]"
      style={{ backgroundColor: rule.bg_color }}
    >
      <div
        className="w-full text-center font-bold text-lg leading-tight px-2 pt-1.5 pb-0.5"
        style={{ color: rule.text_color }}
      >
        {overdueDays}d
      </div>
      <div
        className="w-full text-center font-semibold text-[9px] leading-tight px-2 pb-1.5 pt-0 uppercase tracking-wide"
        style={{ color: rule.text_color, opacity: 0.9 }}
      >
        {rule.label}
      </div>
    </div>
  );
};
