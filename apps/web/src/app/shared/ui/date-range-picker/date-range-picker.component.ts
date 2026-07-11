import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  input,
  output,
  signal,
  WritableSignal,
} from '@angular/core';
import type { MetricInterval } from '@zoneless/shared-types';

export type DateRangePresetId =
  | 'today'
  | 'last_7_days'
  | 'last_4_weeks'
  | 'last_6_months'
  | 'last_12_months'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'
  | 'custom';

export interface DateRangeValue {
  start: number;
  end: number;
  preset: DateRangePresetId;
  label: string;
}

export interface DateRangePreset {
  id: DateRangePresetId;
  label: string;
  defaultInterval: MetricInterval;
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: 'today', label: 'Today', defaultInterval: 'hour' },
  { id: 'last_7_days', label: 'Last 7 days', defaultInterval: 'day' },
  { id: 'last_4_weeks', label: 'Last 4 weeks', defaultInterval: 'day' },
  { id: 'last_6_months', label: 'Last 6 months', defaultInterval: 'month' },
  { id: 'last_12_months', label: 'Last 12 months', defaultInterval: 'month' },
  { id: 'month_to_date', label: 'Month to date', defaultInterval: 'day' },
  { id: 'quarter_to_date', label: 'Quarter to date', defaultInterval: 'week' },
  { id: 'year_to_date', label: 'Year to date', defaultInterval: 'month' },
];

export const INTERVAL_OPTIONS: { id: MetricInterval; label: string }[] = [
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

/**
 * Intervals Stripe-style dashboards allow for a given window length.
 * Caps bucket count so e.g. "Last 6 months + Hourly" is impossible.
 */
export function GetAllowedIntervals(
  start: number,
  end: number
): MetricInterval[] {
  const days = Math.max((end - start) / 86400, 0);

  if (days <= 2) {
    return ['hour', 'day'];
  }
  if (days <= 14) {
    return ['day', 'week'];
  }
  if (days <= 90) {
    return ['day', 'week', 'month'];
  }
  if (days <= 366) {
    return ['week', 'month'];
  }
  return ['month'];
}

/** Prefer `preferred` when allowed; otherwise the first allowed interval. */
export function ClampInterval(
  preferred: MetricInterval,
  start: number,
  end: number
): MetricInterval {
  const allowed = GetAllowedIntervals(start, end);
  return allowed.includes(preferred) ? preferred : allowed[0];
}

/**
 * Resolve a preset id to a [start, end) unix window (local timezone for UX).
 *
 * `end` is always the start of tomorrow so day/week/month buckets line up
 * evenly for current vs previous-period comparison (avoids an off-by-one
 * when "now" falls mid-bucket).
 */
export function ResolveDateRangePreset(
  preset: DateRangePresetId,
  nowMs: number = Date.now()
): { start: number; end: number; label: string } {
  const now = new Date(nowMs);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const endMs = startOfDay(now) + 24 * 60 * 60 * 1000;
  let startMs = startOfDay(now);
  const label =
    DATE_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? 'Custom';

  switch (preset) {
    case 'today': {
      startMs = startOfDay(now);
      break;
    }
    case 'last_7_days': {
      startMs = startOfDay(now) - 6 * 24 * 60 * 60 * 1000;
      break;
    }
    case 'last_4_weeks': {
      startMs = startOfDay(now) - 27 * 24 * 60 * 60 * 1000;
      break;
    }
    case 'last_6_months': {
      startMs = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
      break;
    }
    case 'last_12_months': {
      startMs = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime();
      break;
    }
    case 'month_to_date': {
      startMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
    }
    case 'quarter_to_date': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startMs = new Date(now.getFullYear(), quarterMonth, 1).getTime();
      break;
    }
    case 'year_to_date': {
      startMs = new Date(now.getFullYear(), 0, 1).getTime();
      break;
    }
    default:
      break;
  }

  return {
    start: Math.floor(startMs / 1000),
    end: Math.floor(endMs / 1000),
    label,
  };
}

@Component({
  selector: 'app-date-range-picker',
  imports: [],
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateRangePickerComponent {
  readonly value = input.required<DateRangeValue>();
  readonly valueChange = output<DateRangeValue>();

  readonly open: WritableSignal<boolean> = signal(false);
  readonly draftPreset: WritableSignal<DateRangePresetId> =
    signal('last_6_months');
  readonly draftStart: WritableSignal<string> = signal('');
  readonly draftEnd: WritableSignal<string> = signal('');
  readonly leftMonth: WritableSignal<Date> = signal(new Date());

  readonly presets = DATE_RANGE_PRESETS;

  readonly rightMonth = computed(() => {
    const left = this.leftMonth();
    return new Date(left.getFullYear(), left.getMonth() + 1, 1);
  });

  readonly triggerLabel = computed(() => this.value().label);

  Toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.OpenDraft();
  }

  OpenDraft(): void {
    const current = this.value();
    this.draftPreset.set(current.preset);
    this.draftStart.set(this.FormatInputDate(current.start));
    this.draftEnd.set(this.FormatInputDate(current.end - 1));
    const startDate = new Date(current.start * 1000);
    this.leftMonth.set(
      new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    );
    this.open.set(true);
  }

  OnPresetClick(preset: DateRangePreset): void {
    const resolved = ResolveDateRangePreset(preset.id);
    this.draftPreset.set(preset.id);
    this.draftStart.set(this.FormatInputDate(resolved.start));
    this.draftEnd.set(this.FormatInputDate(resolved.end - 1));
    const startDate = new Date(resolved.start * 1000);
    this.leftMonth.set(
      new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    );
  }

  OnStartInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftStart.set(value);
    this.draftPreset.set('custom');
  }

  OnEndInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftEnd.set(value);
    this.draftPreset.set('custom');
  }

  ShiftMonths(delta: number): void {
    const left = this.leftMonth();
    this.leftMonth.set(
      new Date(left.getFullYear(), left.getMonth() + delta, 1)
    );
  }

  OnDayClick(day: Date): void {
    const iso = this.FormatDate(day);
    const start = this.draftStart();
    const end = this.draftEnd();

    if (!start || (start && end)) {
      this.draftStart.set(iso);
      this.draftEnd.set('');
    } else {
      if (iso < start) {
        this.draftEnd.set(start);
        this.draftStart.set(iso);
      } else {
        this.draftEnd.set(iso);
      }
    }
    this.draftPreset.set('custom');
  }

  Clear(): void {
    const resolved = ResolveDateRangePreset('last_6_months');
    this.draftPreset.set('last_6_months');
    this.draftStart.set(this.FormatInputDate(resolved.start));
    this.draftEnd.set(this.FormatInputDate(resolved.end - 1));
  }

  Apply(): void {
    const start = this.ParseInputDate(this.draftStart());
    const endDay = this.ParseInputDate(this.draftEnd() || this.draftStart());
    if (start === null || endDay === null) return;

    const end = endDay + 24 * 60 * 60;
    const preset = this.draftPreset();
    const label =
      preset === 'custom'
        ? `${this.draftStart()} – ${this.draftEnd() || this.draftStart()}`
        : DATE_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? 'Custom';

    this.valueChange.emit({
      start,
      end,
      preset,
      label,
    });
    this.open.set(false);
  }

  IsInRange(day: Date): boolean {
    const start = this.ParseInputDate(this.draftStart());
    const end = this.ParseInputDate(this.draftEnd() || this.draftStart());
    if (start === null || end === null) return false;
    const ts = Math.floor(day.getTime() / 1000);
    return ts >= start && ts <= end;
  }

  IsRangeStart(day: Date): boolean {
    const start = this.ParseInputDate(this.draftStart());
    if (start === null) return false;
    return Math.floor(day.getTime() / 1000) === start;
  }

  IsRangeEnd(day: Date): boolean {
    const end = this.ParseInputDate(this.draftEnd() || this.draftStart());
    if (end === null) return false;
    return Math.floor(day.getTime() / 1000) === end;
  }

  IsOutsideMonth(day: Date, month: Date): boolean {
    return (
      day.getMonth() !== month.getMonth() ||
      day.getFullYear() !== month.getFullYear()
    );
  }

  GetMonthDays(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = first.getDay();
    const gridStart = new Date(
      month.getFullYear(),
      month.getMonth(),
      1 - startOffset
    );
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(
        new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() + i
        )
      );
    }
    return days;
  }

  MonthTitle(month: Date): string {
    return month.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }

  @HostListener('document:click')
  CloseOnOutsideClick(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }

  private FormatInputDate(unix: number): string {
    const d = new Date(unix * 1000);
    return this.FormatDate(d);
  }

  private FormatDate(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm} / ${dd} / ${yyyy}`;
  }

  private ParseInputDate(raw: string): number | null {
    const match = raw
      .replace(/\s/g, '')
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return null;
    }
    return Math.floor(date.getTime() / 1000);
  }
}
