"use client";

import { useMemo } from 'react';
import { CalendarSelect } from './CalendarSelect';

function labelFor(value: string) { const [hourText, minute = '00'] = value.split(':'); const hour = Number(hourText); return `${String(hour % 12 || 12).padStart(2, '0')}:${minute} ${hour < 12 ? 'AM' : 'PM'}`; }
export function CalendarTimePicker({ value, onChange, disabled = false, ariaLabel }: { value: string; onChange: (value: string) => void; disabled?: boolean; ariaLabel: string }) {
  const options = useMemo(() => { const values = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`); if (value && !values.includes(value)) values.push(value); return values.sort().map((item) => ({ value: item, label: labelFor(item) })); }, [value]);
  return <CalendarSelect value={value} options={options} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />;
}
