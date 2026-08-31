import { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  allowPastDates?: boolean;
}

export function DatePicker({ value, onChange, placeholder = "mm/dd/yyyy", className = "", allowPastDates = false }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(value ? new Date(value) : new Date());
  const popupRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Format YYYY-MM-DD to local string for display, or just display the value
  let displayValue = "";
  if (value) {
    const [y, m, d] = value.split('-');
    if (y && m && d) {
       displayValue = `${m}/${d}/${y}`;
    } else {
       displayValue = value;
    }
  }

  return (
    <div className="relative w-full" ref={popupRef}>
      <div 
        className={`w-full bg-[#252728] border border-[#4E4F50] rounded-xl px-3 py-2.5 text-slate-100 text-sm cursor-pointer flex items-center justify-between transition-colors hover:border-[#6b6c6d] ${isOpen ? 'border-[#C7F33C]' : ''} ${className}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={value ? "text-slate-100" : "text-slate-500"}>
          {displayValue || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-slate-500" />
      </div>

      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 bg-[#3A3B3C] border border-[#4E4F50] rounded-2xl shadow-xl p-4 z-50 w-full">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={(e) => { e.stopPropagation(); setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)); }}
              className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="font-bold text-slate-100 text-sm">
              {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button 
              onClick={(e) => { e.stopPropagation(); setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)); }}
              className="p-1 hover:bg-[#4E4F50] rounded-full text-slate-400"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-[10px] font-bold text-slate-400">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8"></div>
            ))}
            {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
              const date = i + 1;
              const cellDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const isToday = date === new Date().getDate() && calendarMonth.getMonth() === new Date().getMonth() && calendarMonth.getFullYear() === new Date().getFullYear();
              const isPast = !allowPastDates && cellDate < today;
              const isSelected = value && new Date(value).getDate() === date && new Date(value).getMonth() === calendarMonth.getMonth() && new Date(value).getFullYear() === calendarMonth.getFullYear();
              
              return (
                <button
                  key={date}
                  onClick={(e) => {
                    e.stopPropagation();
                    const newDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), date);
                    const year = newDate.getFullYear();
                    const month = String(newDate.getMonth() + 1).padStart(2, '0');
                    const d = String(newDate.getDate()).padStart(2, '0');
                    onChange(`${year}-${month}-${d}`);
                    setIsOpen(false);
                  }}
                  disabled={isPast}
                  type="button"
                  className={`
                    w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium transition-all
                    ${isPast ? 'text-slate-500 cursor-not-allowed' : 'cursor-pointer'}
                    ${!isPast && !isSelected ? 'hover:bg-[#4E4F50] text-slate-300' : ''}
                    ${isToday && !isSelected ? 'border border-[#C7F33C]' : ''}
                    ${isSelected ? 'bg-[#C7F33C] !text-black hover:bg-[#b0d635]' : ''}
                  `}
                >
                  {date}
                </button>
              );
            })}
          </div>
          
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#4E4F50]">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); setIsOpen(false); }}
              className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-medium"
            >
              Clear
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                onChange(`${year}-${month}-${d}`);
                setIsOpen(false);
              }}
              className="text-xs text-[#3b82f6] hover:text-[#60a5fa] font-medium"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
