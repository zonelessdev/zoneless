import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  signal,
  WritableSignal,
} from '@angular/core';
import type { MetricPoint } from '@zoneless/shared-types';

export interface LineChartTooltipRow {
  color: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-line-chart',
  imports: [],
  templateUrl: './line-chart.component.html',
  styleUrl: './line-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChartComponent implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private resizeObserver: ResizeObserver | null = null;

  /** Current-period series. */
  readonly current = input<MetricPoint[]>([]);
  /** Previous-period series (optional comparison overlay). */
  readonly previous = input<MetricPoint[] | null>(null);
  /** Chart height in px. */
  readonly height = input(180);
  /** Show horizontal grid + right-side Y labels. */
  readonly showGrid = input(true);
  /** Soft fill under the current line (Today chart). */
  readonly showFill = input(false);
  /** Use integer Y-axis ticks (count metrics). Avoids duplicate labels like 1,1,1. */
  readonly integerTicks = input(false);
  /** Metric title shown in the hover tooltip. */
  readonly metricLabel = input('Metric');
  /** Format a Y-axis value. */
  readonly formatValue = input<(value: number) => string>((value: number) =>
    String(value)
  );
  /** Format tooltip values (defaults to formatValue). */
  readonly formatTooltipValue = input<((value: number) => string) | null>(null);
  /** Format an X-axis tick label from a bucket start unix. */
  readonly formatX = input<(unix: number) => string>((unix: number) =>
    new Date(unix * 1000).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    })
  );
  /** Format a tooltip date row from a metric point (interval-aware). */
  readonly formatTooltipDate = input<(point: MetricPoint) => string>(
    (point: MetricPoint) =>
      new Date(point.start * 1000).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
  );

  readonly hoverIndex: WritableSignal<number | null> = signal(null);
  /** Measured host width so SVG viewBox matches CSS pixels 1:1 (no letterboxing/warping). */
  readonly measuredWidth: WritableSignal<number> = signal(0);

  readonly padding = { top: 12, right: 48, bottom: 24, left: 4 };

  readonly plotWidth = computed(() =>
    Math.max(this.measuredWidth() - this.padding.left - this.padding.right, 10)
  );

  readonly plotHeight = computed(
    () => this.height() - this.padding.top - this.padding.bottom
  );

  /**
   * Number of x slots. Current and previous share one domain so a partial
   * current series (e.g. today so far) ends mid-chart while the previous
   * series spans the full width. Overview series are length-aligned by the API.
   */
  readonly domainCount = computed(() =>
    Math.max(this.current().length, this.previous()?.length ?? 0)
  );

  /** Bucket starts used for x labels — longest series wins. */
  readonly domainPoints = computed(() => {
    const current = this.current();
    const previous = this.previous();
    return (previous?.length ?? 0) > current.length ? previous ?? [] : current;
  });

  readonly maxY = computed(() => {
    const values = [
      ...this.current().map((p) => p.value),
      ...(this.previous() ?? []).map((p) => p.value),
    ];
    const max = Math.max(0, ...values);
    if (this.integerTicks()) {
      return Math.max(1, Math.ceil(max));
    }
    return max === 0 ? 1 : max * 1.1;
  });

  readonly yTicks = computed(() => {
    const max = this.maxY();

    if (this.integerTicks()) {
      const step = Math.max(1, Math.ceil(max / 4));
      const ticks: number[] = [];
      for (let value = step; value < max; value += step) {
        ticks.push(value);
      }
      ticks.push(max);
      return ticks;
    }

    const steps = 4;
    const ticks: number[] = [];
    const seen = new Set<string>();
    const format = this.formatValue();
    for (let i = 1; i <= steps; i++) {
      const value = (max / steps) * i;
      const label = format(value);
      if (!seen.has(label)) {
        seen.add(label);
        ticks.push(value);
      }
    }
    return ticks;
  });

  readonly currentPath = computed(() => this.BuildLinePath(this.current()));

  readonly previousPath = computed(() => {
    const previous = this.previous();
    if (!previous?.length) return '';
    return this.BuildLinePath(previous);
  });

  readonly fillPath = computed(() => {
    if (!this.showFill()) return '';
    const points = this.current();
    if (points.length === 0) return '';
    const line = this.BuildLinePath(points);
    const lastX = this.GetX(points.length - 1);
    const firstX = this.GetX(0);
    const baseline = this.padding.top + this.plotHeight();
    return `${line} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
  });

  readonly xLabels = computed(() => {
    const points = this.domainPoints();
    if (points.length === 0) return [];

    const labels: { x: number; text: string; anchor: string }[] = [
      {
        x: this.GetX(0),
        text: this.formatX()(points[0].start),
        anchor: 'start',
      },
    ];

    if (points.length > 1) {
      const last = points.length - 1;
      labels.push({
        x: this.GetX(last),
        text: this.formatX()(points[last].start),
        anchor: 'end',
      });
    }

    return labels;
  });

  readonly hoverX = computed(() => {
    const index = this.hoverIndex();
    if (index === null) return null;
    return this.GetX(index);
  });

  readonly hoverCurrentPoint = computed(() => {
    const index = this.hoverIndex();
    if (index === null) return null;
    const point = this.current()[index];
    if (!point) return null;
    return {
      x: this.GetX(index),
      y: this.GetY(point.value),
      point,
    };
  });

  readonly hoverPreviousPoint = computed(() => {
    const index = this.hoverIndex();
    const previous = this.previous();
    if (index === null || !previous?.[index]) return null;
    const point = previous[index];
    return {
      x: this.GetX(index),
      y: this.GetY(point.value),
      point,
    };
  });

  readonly tooltipChangePercent = computed(() => {
    const current = this.hoverCurrentPoint()?.point.value;
    const previous = this.hoverPreviousPoint()?.point.value;
    if (current === undefined || previous === undefined || previous === 0) {
      return null;
    }
    return ((current - previous) / previous) * 100;
  });

  readonly tooltipRows = computed((): LineChartTooltipRow[] => {
    const formatTooltip = this.formatTooltipValue() ?? this.formatValue();
    const rows: LineChartTooltipRow[] = [];

    const current = this.hoverCurrentPoint();
    if (current) {
      rows.push({
        color: 'var(--chart-current, #0055ff)',
        label: this.formatTooltipDate()(current.point),
        value: formatTooltip(current.point.value),
      });
    }

    const previous = this.hoverPreviousPoint();
    if (previous) {
      rows.push({
        color: 'var(--chart-previous, #94a3b8)',
        label: this.formatTooltipDate()(previous.point),
        value: formatTooltip(previous.point.value),
      });
    }

    return rows;
  });

  /** Position the tooltip next to the hovered data point. */
  readonly tooltipStyle = computed(() => {
    const current = this.hoverCurrentPoint();
    const previous = this.hoverPreviousPoint();
    const anchor = current ?? previous;
    if (!anchor || this.tooltipRows().length === 0) {
      return { display: 'none', left: '0', top: '0', transform: 'none' };
    }

    const width = this.measuredWidth() || 1;
    const preferRight = anchor.x < width * 0.55;
    const top = Math.max(8, anchor.y - 12);

    return {
      display: 'block',
      left: preferRight ? `${anchor.x + 14}px` : `${anchor.x - 14}px`,
      top: `${top}px`,
      transform: preferRight ? 'none' : 'translateX(-100%)',
    };
  });

  constructor() {
    afterNextRender(
      () => {
        this.MeasureWidth();
        this.resizeObserver = new ResizeObserver(() => this.MeasureWidth());
        this.resizeObserver.observe(this.host.nativeElement);
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  OnPointerMove(event: PointerEvent): void {
    const count = this.domainCount();
    const width = this.measuredWidth();
    if (count === 0 || width <= 0) return;

    const svg = event.currentTarget as SVGSVGElement;
    // Map client coordinates into the SVG viewBox (handles any CSS scaling).
    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const cursor = point.matrixTransform(ctm.inverse());

    const plotX = cursor.x - this.padding.left;
    const ratio = Math.max(0, Math.min(1, plotX / this.plotWidth()));
    const index = Math.round(ratio * Math.max(count - 1, 0));
    this.hoverIndex.set(index);
  }

  OnPointerLeave(): void {
    this.hoverIndex.set(null);
  }

  GetYTickY(value: number): number {
    return this.GetY(value);
  }

  FormatYTick(value: number): string {
    return this.formatValue()(value);
  }

  FormatChangePercent(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  private MeasureWidth(): void {
    const width = Math.floor(
      this.host.nativeElement.getBoundingClientRect().width
    );
    if (width > 0 && width !== this.measuredWidth()) {
      this.measuredWidth.set(width);
    }
  }

  private BuildLinePath(points: MetricPoint[]): string {
    if (points.length === 0) return '';

    return points
      .map((point, index) => {
        const x = this.GetX(index);
        const y = this.GetY(point.value);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  private GetX(index: number): number {
    const count = this.domainCount();
    if (count <= 1) {
      return this.padding.left + this.plotWidth() / 2;
    }
    return this.padding.left + (index / (count - 1)) * this.plotWidth();
  }

  private GetY(value: number): number {
    const ratio = value / this.maxY();
    return this.padding.top + this.plotHeight() * (1 - ratio);
  }
}
