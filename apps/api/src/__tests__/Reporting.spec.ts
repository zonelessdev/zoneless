import {
  AdvanceBucket,
  AlignSeriesLength,
  ComputeChangePercent,
  ComputePreviousPeriod,
  FillBuckets,
  ParseCompare,
  ParseInterval,
  ParseMetricIds,
  ResolveTodayPreset,
  TruncateToBucket,
} from '../modules/Reporting';

describe('Reporting helpers', () => {
  describe('ParseMetricIds', () => {
    it('returns all metrics when raw is empty', () => {
      expect(ParseMetricIds(undefined)).toEqual([
        'gross_volume',
        'net_volume',
        'new_customers',
      ]);
      expect(ParseMetricIds('')).toEqual([
        'gross_volume',
        'net_volume',
        'new_customers',
      ]);
    });

    it('parses a comma-separated list and drops unknowns', () => {
      expect(ParseMetricIds('gross_volume,new_customers,foo')).toEqual([
        'gross_volume',
        'new_customers',
      ]);
    });

    it('falls back to all when only unknowns are provided', () => {
      expect(ParseMetricIds('foo,bar')).toEqual([
        'gross_volume',
        'net_volume',
        'new_customers',
      ]);
    });
  });

  describe('ParseInterval / ParseCompare', () => {
    it('parses valid intervals and defaults otherwise', () => {
      expect(ParseInterval('hour')).toBe('hour');
      expect(ParseInterval('month')).toBe('month');
      expect(ParseInterval('nope')).toBe('day');
      expect(ParseInterval(undefined)).toBe('day');
    });

    it('parses valid compare modes and defaults otherwise', () => {
      expect(ParseCompare('none')).toBe('none');
      expect(ParseCompare('previous_period')).toBe('previous_period');
      expect(ParseCompare('nope')).toBe('previous_period');
    });
  });

  describe('ResolveTodayPreset', () => {
    it('returns the UTC day window containing the given instant', () => {
      // 2026-07-10 15:30:00 UTC
      const now = Date.UTC(2026, 6, 10, 15, 30, 0);
      const { start, end } = ResolveTodayPreset(now);

      expect(start).toBe(Math.floor(Date.UTC(2026, 6, 10) / 1000));
      expect(end).toBe(Math.floor(Date.UTC(2026, 6, 11) / 1000));
    });
  });

  describe('ComputePreviousPeriod', () => {
    it('returns an equal-length window immediately before start', () => {
      expect(ComputePreviousPeriod(1000, 1300)).toEqual({
        start: 700,
        end: 1000,
      });
    });
  });

  describe('ComputeChangePercent', () => {
    it('computes percent change', () => {
      expect(ComputeChangePercent(120, 100)).toBeCloseTo(20);
      expect(ComputeChangePercent(80, 100)).toBeCloseTo(-20);
    });

    it('returns null when previous is 0 or null', () => {
      expect(ComputeChangePercent(50, 0)).toBeNull();
      expect(ComputeChangePercent(50, null)).toBeNull();
    });
  });

  describe('TruncateToBucket / AdvanceBucket', () => {
    it('truncates and advances hourly buckets', () => {
      const ts = Math.floor(Date.UTC(2026, 6, 10, 15, 42) / 1000);
      const truncated = TruncateToBucket(ts, 'hour');
      expect(truncated).toBe(Math.floor(Date.UTC(2026, 6, 10, 15) / 1000));
      expect(AdvanceBucket(truncated, 'hour')).toBe(
        Math.floor(Date.UTC(2026, 6, 10, 16) / 1000)
      );
    });

    it('truncates and advances monthly buckets', () => {
      const ts = Math.floor(Date.UTC(2026, 6, 15) / 1000);
      const truncated = TruncateToBucket(ts, 'month');
      expect(truncated).toBe(Math.floor(Date.UTC(2026, 6, 1) / 1000));
      expect(AdvanceBucket(truncated, 'month')).toBe(
        Math.floor(Date.UTC(2026, 7, 1) / 1000)
      );
    });

    it('truncates weeks to Monday UTC', () => {
      // Thursday 2026-07-09 → week starting Monday 2026-07-06
      const thursday = Math.floor(Date.UTC(2026, 6, 9, 12) / 1000);
      expect(TruncateToBucket(thursday, 'week')).toBe(
        Math.floor(Date.UTC(2026, 6, 6) / 1000)
      );
    });

    it('truncates to local calendar days in America/Los_Angeles', () => {
      // 2026-07-10 19:12 UTC = 12:12 PM PDT — must land on Jul 10 local, not Jul 11
      const afternoonUtc = Math.floor(Date.UTC(2026, 6, 10, 19, 12) / 1000);
      const bucket = TruncateToBucket(
        afternoonUtc,
        'day',
        'America/Los_Angeles'
      );
      // Jul 10 00:00 PDT = Jul 10 07:00 UTC
      expect(bucket).toBe(Math.floor(Date.UTC(2026, 6, 10, 7) / 1000));
    });
  });

  describe('AlignSeriesLength', () => {
    it('trims a longer previous series to match current', () => {
      const current = [
        { start: 3, end: 4, value: 1 },
        { start: 4, end: 5, value: 2 },
      ];
      const previous = [
        { start: 0, end: 1, value: 9 },
        { start: 1, end: 2, value: 8 },
        { start: 2, end: 3, value: 7 },
      ];
      expect(AlignSeriesLength(current, previous)).toEqual([
        { start: 1, end: 2, value: 8 },
        { start: 2, end: 3, value: 7 },
      ]);
    });

    it('returns null when previous is null', () => {
      expect(
        AlignSeriesLength([{ start: 1, end: 2, value: 0 }], null)
      ).toBeNull();
    });
  });

  describe('FillBuckets', () => {
    it('fills missing day buckets with zeros', () => {
      const start = Math.floor(Date.UTC(2026, 6, 1) / 1000);
      const end = Math.floor(Date.UTC(2026, 6, 4) / 1000);
      const mid = Math.floor(Date.UTC(2026, 6, 2) / 1000);

      const points = FillBuckets(start, end, 'day', new Map([[mid, 1500]]));

      expect(points).toHaveLength(3);
      expect(points[0]).toEqual({
        start,
        end: mid,
        value: 0,
      });
      expect(points[1]).toEqual({
        start: mid,
        end: Math.floor(Date.UTC(2026, 6, 3) / 1000),
        value: 1500,
      });
      expect(points[2].value).toBe(0);
    });
  });
});
