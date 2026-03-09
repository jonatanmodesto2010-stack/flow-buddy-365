import { AppLayout } from '@/components/AppLayout';
import { CalendarView } from '@/components/CalendarView';

const Calendar = () => {
  return (
    <AppLayout>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <CalendarView />
        </div>
      </div>
    </AppLayout>
  );
};

export default Calendar;
