import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LineChartComponent,
  DateRangePickerComponent,
  MetricChartCardComponent,
  DATE_RANGE_PRESETS,
  INTERVAL_OPTIONS,
  ResolveDateRangePreset,
  GetAllowedIntervals,
  ClampInterval,
  type DateRangePresetId,
  type DateRangeValue,
} from '../../../../shared';
import { TransactionListComponent } from '../../components';
import type { PaginatedListColumn } from '../../../../shared';
import { BalanceService, ReportingService } from '../../../../data';
import { MetaService, StorageService } from '../../../../core';
import type { MetricCompare, MetricInterval } from '@zoneless/shared-types';

interface OverviewSettings {
  preset: DateRangePresetId;
  start?: number;
  end?: number;
  label?: string;
  interval: MetricInterval;
  compare: MetricCompare;
}

const OVERVIEW_SETTINGS_KEY = 'dashboard_overview_settings';
const DEFAULT_PRESET: DateRangePresetId = 'last_7_days';

@Component({
  selector: 'app-full-home',
  imports: [
    DecimalPipe,
    RouterLink,
    TransactionListComponent,
    LineChartComponent,
    DateRangePickerComponent,
    MetricChartCardComponent,
  ],
  templateUrl: './full-home.component.html',
  styleUrl: './full-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullHomeComponent implements OnInit {
  private readonly balanceService = inject(BalanceService);
  private readonly reportingService = inject(ReportingService);
  private readonly metaService = inject(MetaService);
  private readonly storage = inject(StorageService);

  readonly availableBalance = computed(
    () => this.balanceService.GetAvailableBalance('usdc') / 100
  );
  readonly pendingBalance = computed(
    () => this.balanceService.GetPendingBalance('usdc') / 100
  );

  readonly dateRange: WritableSignal<DateRangeValue>;
  readonly interval: WritableSignal<MetricInterval>;
  readonly compare: WritableSignal<MetricCompare>;

  readonly availableIntervals = computed(() => {
    const range = this.dateRange();
    const allowed = new Set(GetAllowedIntervals(range.start, range.end));
    return INTERVAL_OPTIONS.filter((option) => allowed.has(option.id));
  });

  readonly todayGross = computed(
    () => this.reportingService.todayMetrics()?.metrics.gross_volume ?? null
  );
  readonly overviewGross = computed(
    () => this.reportingService.overviewMetrics()?.metrics.gross_volume ?? null
  );
  readonly overviewNet = computed(
    () => this.reportingService.overviewMetrics()?.metrics.net_volume ?? null
  );
  readonly overviewCustomers = computed(
    () => this.reportingService.overviewMetrics()?.metrics.new_customers ?? null
  );
  readonly todayLoading = computed(() => this.reportingService.todayLoading());
  readonly overviewLoading = computed(() =>
    this.reportingService.overviewLoading()
  );

  readonly todayVolumeLabel = computed(() => {
    const series = this.todayGross();
    if (!series) return '—';
    return `$${(series.total / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  });

  readonly yesterdayVolumeLabel = computed(() => {
    const series = this.todayGross();
    if (!series || series.previous_total === null) return '—';
    return `$${(series.previous_total / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  });

  readonly todayAsOfLabel = new Date().toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  /**
   * Cumulative running totals for the Today chart: the
   * current line stops at the current hour; yesterday spans the full day.
   */
  readonly todayCumulative = computed(() => {
    const series = this.todayGross();
    if (!series) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    let runningToday = 0;
    const current = series.data
      .filter((point) => point.start <= nowSec)
      .map((point) => {
        runningToday += point.value;
        return { ...point, value: runningToday };
      });

    let runningYesterday = 0;
    const previous = (series.previous_data ?? []).map((point) => {
      runningYesterday += point.value;
      return { ...point, value: runningYesterday };
    });

    return {
      current,
      previous: previous.length > 0 ? previous : null,
    };
  });

  readonly formatTodayValue = (value: number): string => {
    const dollars = value / 100;
    if (dollars >= 1000) {
      return `$${(dollars / 1000).toFixed(1)}K`;
    }
    if (dollars >= 10) {
      return `$${Math.round(dollars)}`;
    }
    return `$${dollars.toFixed(2)}`;
  };

  readonly formatTodayTooltipValue = (value: number): string =>
    `$${(value / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  readonly formatTodayX = (unix: number): string =>
    new Date(unix * 1000).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  readonly formatTodayTooltipDate = (point: { start: number }): string =>
    new Date(point.start * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  recentTransactionColumns: PaginatedListColumn[] = [
    { header: 'Date', field: 'created', type: 'date' },
    { header: 'Status', field: 'status', type: 'status' },
    {
      header: 'Type',
      field: 'type',
      type: 'text',
      capitalize: true,
      dimmed: true,
    },
    {
      header: 'Amount',
      field: 'amount',
      type: 'currency-with-code',
      currencyField: 'currency',
    },
    {
      header: 'Net',
      field: 'net',
      type: 'currency-with-code',
      currencyField: 'currency',
      bolded: true,
    },
  ];

  constructor() {
    const saved = this.LoadSavedSettings();
    this.dateRange = signal(saved.range);
    this.interval = signal(saved.interval);
    this.compare = signal(saved.compare);
  }

  ngOnInit(): void {
    this.metaService.SetMetaTitle('Home');
    void this.LoadToday();
    void this.LoadOverview();
  }

  async LoadToday(): Promise<void> {
    try {
      await this.reportingService.GetTodayMetrics();
    } catch {
      // Keep the page usable if metrics fail; balance/transactions still show.
    }
  }

  async LoadOverview(): Promise<void> {
    const range = this.dateRange();
    try {
      await this.reportingService.GetOverviewMetrics({
        start: range.start,
        end: range.end,
        interval: this.interval(),
        compare: this.compare(),
      });
    } catch {
      // Keep the page usable if metrics fail.
    }
  }

  OnDateRangeChange(range: DateRangeValue): void {
    this.dateRange.set(range);

    const preset = DATE_RANGE_PRESETS.find((p) => p.id === range.preset);
    const preferred = preset?.defaultInterval ?? this.interval();
    this.interval.set(ClampInterval(preferred, range.start, range.end));

    this.PersistSettings();
    void this.LoadOverview();
  }

  OnIntervalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as MetricInterval;
    const range = this.dateRange();
    this.interval.set(ClampInterval(value, range.start, range.end));
    this.PersistSettings();
    void this.LoadOverview();
  }

  OnCompareChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as MetricCompare;
    this.compare.set(value);
    this.PersistSettings();
    void this.LoadOverview();
  }

  ToggleCompare(): void {
    this.compare.set(this.compare() === 'none' ? 'previous_period' : 'none');
    this.PersistSettings();
    void this.LoadOverview();
  }

  private PersistSettings(): void {
    const range = this.dateRange();
    const settings: OverviewSettings = {
      preset: range.preset,
      interval: this.interval(),
      compare: this.compare(),
    };

    if (range.preset === 'custom') {
      settings.start = range.start;
      settings.end = range.end;
      settings.label = range.label;
    }

    this.storage.StoreItem(OVERVIEW_SETTINGS_KEY, settings);
  }

  private LoadSavedSettings(): {
    range: DateRangeValue;
    interval: MetricInterval;
    compare: MetricCompare;
  } {
    const saved = this.storage.GetItem<OverviewSettings>(OVERVIEW_SETTINGS_KEY);
    const compare: MetricCompare =
      saved?.compare === 'none' || saved?.compare === 'previous_period'
        ? saved.compare
        : 'previous_period';

    if (saved?.preset === 'custom' && saved.start && saved.end) {
      const range: DateRangeValue = {
        start: saved.start,
        end: saved.end,
        preset: 'custom',
        label: saved.label || 'Custom',
      };
      return {
        range,
        interval: ClampInterval(
          saved.interval ?? 'day',
          range.start,
          range.end
        ),
        compare,
      };
    }

    const presetId =
      saved?.preset &&
      DATE_RANGE_PRESETS.some((preset) => preset.id === saved.preset)
        ? saved.preset
        : DEFAULT_PRESET;

    const resolved = ResolveDateRangePreset(presetId);
    const range: DateRangeValue = {
      start: resolved.start,
      end: resolved.end,
      preset: presetId,
      label: resolved.label,
    };

    const preferred =
      saved?.interval ??
      DATE_RANGE_PRESETS.find((preset) => preset.id === presetId)
        ?.defaultInterval ??
      'day';

    return {
      range,
      interval: ClampInterval(preferred, range.start, range.end),
      compare,
    };
  }
}
