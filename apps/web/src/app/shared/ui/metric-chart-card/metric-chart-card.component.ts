import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  MetricInterval,
  MetricPoint,
  MetricSeries,
} from '@zoneless/shared-types';
import { MoreInfoHoverComponent } from '../more-info-hover/more-info-hover.component';
import { LineChartComponent } from '../line-chart/line-chart.component';

/** Axis tick label for a bucket start, based on the active interval. */
export function FormatMetricAxisLabel(
  unix: number,
  interval: MetricInterval
): string {
  const date = new Date(unix * 1000);
  switch (interval) {
    case 'hour':
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        hour12: true,
      });
    case 'day':
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    case 'week':
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    case 'month':
    default:
      return date.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
  }
}

/** Tooltip label for a bucket, based on the active interval. */
export function FormatMetricTooltipLabel(
  point: MetricPoint,
  interval: MetricInterval
): string {
  const start = new Date(point.start * 1000);
  // end is exclusive — show the last included instant for week ranges
  const endInclusive = new Date(Math.max(point.start, point.end - 1) * 1000);

  switch (interval) {
    case 'hour':
      return start.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    case 'day':
      return start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    case 'week': {
      const startLabel = start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const endLabel = endInclusive.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      return `${startLabel} – ${endLabel}`;
    }
    case 'month':
    default:
      return start.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
  }
}

@Component({
  selector: 'app-metric-chart-card',
  imports: [RouterLink, MoreInfoHoverComponent, LineChartComponent],
  templateUrl: './metric-chart-card.component.html',
  styleUrl: './metric-chart-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricChartCardComponent {
  readonly title = input.required<string>();
  readonly infoText = input('');
  readonly series = input<MetricSeries | null>(null);
  readonly interval = input<MetricInterval>('day');
  readonly loading = input(false);
  readonly chartHeight = input(160);
  readonly updatedLabel = input('Updated just now');
  readonly moreDetailsHref = input<string | null>(null);

  readonly displayTotal = computed(() => {
    const series = this.series();
    if (!series) return '—';
    if (series.unit === 'currency') {
      return `$${(series.total / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return series.total.toLocaleString();
  });

  readonly previousLabel = computed(() => {
    const series = this.series();
    if (!series || series.previous_total === null) return null;
    if (series.unit === 'currency') {
      return `$${(series.previous_total / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} previous period`;
    }
    return `${series.previous_total.toLocaleString()} previous period`;
  });

  readonly changePercent = computed(
    () => this.series()?.change_percent ?? null
  );

  readonly formatValue = computed(() => {
    const series = this.series();
    const unit = series?.unit ?? 'currency';
    return (value: number) => {
      if (unit === 'count') {
        if (value >= 1000) {
          return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
        }
        return String(Math.round(value));
      }
      const dollars = value / 100;
      if (dollars >= 1000) {
        return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}K`;
      }
      if (dollars >= 10) {
        return `$${Math.round(dollars)}`;
      }
      return `$${dollars.toFixed(2)}`;
    };
  });

  readonly formatTooltipValue = computed(() => {
    const series = this.series();
    const unit = series?.unit ?? 'currency';
    return (value: number) => {
      if (unit === 'count') {
        return value.toLocaleString();
      }
      return `$${(value / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };
  });

  readonly formatX = computed(() => {
    const interval = this.interval();
    return (unix: number) => FormatMetricAxisLabel(unix, interval);
  });

  readonly formatTooltipDate = computed(() => {
    const interval = this.interval();
    return (point: MetricPoint) => FormatMetricTooltipLabel(point, interval);
  });

  FormatChange(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }
}
