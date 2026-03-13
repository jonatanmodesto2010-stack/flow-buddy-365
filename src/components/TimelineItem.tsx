import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, MessageSquare, FileText, CheckCircle2, AlertCircle, Phone, Wrench } from 'lucide-react';

// Map of legacy Lucide string keys to components
const LUCIDE_MAP: Record<string, React.ElementType> = {
  calendar: Calendar,
  note: FileText,
  check: CheckCircle2,
  message: MessageSquare,
  alert: AlertCircle,
  phone: Phone,
  wrench: Wrench,
};

const isEmoji = (str: string) => {
  // If it's a known Lucide key, it's not an emoji
  if (LUCIDE_MAP[str]) return false;
  // Otherwise treat as emoji (any non-ascii or multi-char string that isn't a known key)
  return true;
};

const TimelineItem = ({ event, index, onEdit, onColorChange }) => {
  const getStatusColor = () => {
    switch (event.color) {
      case 'green':
        return 'from-green-500 to-emerald-500';
      case 'yellow':
        return 'from-yellow-500 to-orange-500';
      case 'red':
        return 'from-red-500 to-rose-500';
      default:
        return 'from-purple-500 to-pink-500';
    }
  };

  const getCardColors = () => {
    switch (event.color) {
      case 'green':
        return 'bg-green-500/10 border-green-500/30 hover:border-green-500/60';
      case 'yellow':
        return 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/60';
      case 'red':
        return 'bg-red-500/10 border-red-500/30 hover:border-red-500/60';
      default:
        return 'bg-purple-500/10 border-purple-500/30 hover:border-pink-500/60';
    }
  };

  const isRightSide = event.color === 'green';

  const renderIcon = () => {
    const iconValue = event.icon || '💬';
    if (!isEmoji(iconValue)) {
      const LucideIcon = LUCIDE_MAP[iconValue] || FileText;
      return <LucideIcon className="h-4 w-4 text-white" />;
    }
    return <span className="text-sm leading-none">{iconValue}</span>;
  };

  const Card = () => (
    <motion.div
      onClick={onEdit}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className={`backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 hover:shadow-xl cursor-pointer w-[calc(50%-2.5rem)] ${getCardColors()}`}
    >
      <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>{new Date(event.date).toLocaleDateString('pt-BR')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{event.time}</span>
        </div>
      </div>
      <p className="text-gray-300 text-sm leading-snug break-words">
        {event.description}
      </p>
    </motion.div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative flex justify-between items-center w-full max-w-5xl pb-8"
    >
      {!isRightSide && <Card />}
      {!isRightSide && <div className="w-[calc(50%-2.5rem)]" />}

      <div
        onClick={onColorChange}
        className={`absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br ${getStatusColor()} flex items-center justify-center shadow-lg z-10 cursor-pointer`}
      >
        {renderIcon()}
      </div>

      {isRightSide && <div className="w-[calc(50%-2.5rem)]" />}
      {isRightSide && <Card />}
    </motion.div>
  );
};

export default TimelineItem;
