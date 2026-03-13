import * as React from 'react';
import { cn } from '@/lib/utils';

interface ClientCardProps {
  title: string;
  subtitle?: string;
  subtitleIcon?: string;
  subtitleSuffix?: string;
  secondarySubtitle?: string;
  secondarySubtitleIcon?: string;
  secondarySubtitleSuffix?: string;
  cardStyle?: string;
  badges?: React.ReactNode;
  onClick?: () => void;
}

export const ClientCard = ({
  title,
  subtitle,
  subtitleIcon,
  subtitleSuffix,
  secondarySubtitle,
  secondarySubtitleIcon,
  secondarySubtitleSuffix,
  cardStyle,
  badges,
  onClick,
}: ClientCardProps) => {
  return (
    <div
      className={cn(
        'w-full rounded-lg p-4 flex items-center gap-4 transition-all duration-150 hover:opacity-90 cursor-pointer border border-border bg-card',
        cardStyle
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-card-foreground font-bold text-base uppercase tracking-wide truncate">
          {title}
        </h3>
        {(subtitle || subtitleIcon) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {subtitleIcon && <span className="mr-1">{subtitleIcon}</span>}
            {subtitle}
            {subtitleSuffix && <span className="ml-2 opacity-70">{subtitleSuffix}</span>}
          </p>
        )}
        {(secondarySubtitle || secondarySubtitleIcon) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {secondarySubtitleIcon && <span className="mr-1">{secondarySubtitleIcon}</span>}
            {secondarySubtitle}
            {secondarySubtitleSuffix && <span className="ml-2 opacity-70">{secondarySubtitleSuffix}</span>}
          </p>
        )}
      </div>

      {badges && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {badges}
        </div>
      )}
    </div>
  );
};
