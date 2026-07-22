import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  HostListener,
  signal,
  WritableSignal,
  inject,
} from '@angular/core';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';

import { ApiService } from '../../../core';
import { ListResponse } from '@zoneless/shared-types';
import { StatusChipComponent } from '../status-chip/status-chip.component';
import {
  PopupMenuComponent,
  PopupMenuAction,
} from '../popup-menu/popup-menu.component';

export interface PaginatedListColumn {
  /** Column header text */
  header: string;
  /** Field name from data item */
  field: string;
  /** Column type for rendering */
  type:
    | 'text'
    | 'currency'
    | 'currency-with-code'
    | 'date'
    | 'status'
    | 'number'
    | 'actions';
  /** Whether to bold the cell */
  bolded?: boolean;
  /** Whether to dim the cell text */
  dimmed?: boolean;
  /** Whether to capitalize the text (for text type) */
  capitalize?: boolean;
  /** Currency field to use for currency-with-code type */
  currencyField?: string;
  /** Optional formatter function for computed/custom values */
  formatter?: (item: unknown) => string;
  /**
   * Optional 0–1 progress value for a leading ring indicator
   * (e.g. subscription billing-period progress).
   */
  progressGetter?: (item: unknown) => number | null;
  /** If specified, an image with this field will be displayed*/
  imageField?: string;
  /** Fallback icon to display if the image field is not found */
  placeholderIcon?: string;
  /** Optional date format for date type (Angular DatePipe format) */
  dateFormat?: string;
  /** Optional actions to display in the row */
  actions?: PopupMenuAction[];
}

interface ListItem {
  id: string;
  created: number;
  [key: string]: unknown;
}

@Component({
  selector: 'app-paginated-list',
  templateUrl: './paginated-list.component.html',
  styleUrls: ['./paginated-list.component.scss'],
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    TitleCasePipe,
    StatusChipComponent,
    PopupMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginatedListComponent<T extends ListItem>
  implements OnInit, OnChanges
{
  private readonly api = inject(ApiService);

  /** API endpoint path (e.g., 'balance_transactions') */
  @Input() endpoint = '';

  /** Column definitions */
  @Input() columns: PaginatedListColumn[] = [];

  /** Maximum items per page */
  @Input() limit = 10;

  /** Whether pagination controls are shown */
  @Input() paginationEnabled = true;

  /** Show a compact "N results" count when pagination is disabled */
  @Input() showResultCount = false;

  /** Whether to hide column headings */
  @Input() hideColumnHeadings = false;

  /** Additional query parameters for filtering */
  @Input() queryParams: Record<string, string> = {};

  /** Which fields to expand */
  @Input() expand: string[] = [];

  /** Emits when a row is clicked */
  @Output() rowClick = new EventEmitter<T>();

  loading: WritableSignal<boolean> = signal(false);
  items: WritableSignal<T[]> = signal([]);
  hasMore: WritableSignal<boolean> = signal(false);
  pageNumber: WritableSignal<number> = signal(0);
  initialLoadComplete: WritableSignal<boolean> = signal(false);
  totalCount: WritableSignal<number> = signal(0);
  openMenuItemId: WritableSignal<string | null> = signal(null);

  // Store last item ID of each page for pagination
  // pageLastItems[N] = last item ID of page N
  private pageLastItems: string[] = [];

  async ngOnInit(): Promise<void> {
    if (this.endpoint) {
      await this.LoadItems();
      this.initialLoadComplete.set(true);
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (
      changes['endpoint'] &&
      !changes['endpoint'].firstChange &&
      this.initialLoadComplete()
    ) {
      await this.Reset();
    }
    if (
      changes['queryParams'] &&
      !changes['queryParams'].firstChange &&
      this.initialLoadComplete()
    ) {
      await this.Reset();
    }
  }

  private async Reset(): Promise<void> {
    this.pageLastItems = [];
    this.pageNumber.set(0);
    await this.LoadItems();
  }

  /**
   * Reload the list from the server. Call this after a mutation
   * (archive, delete, create, etc.) to reflect the new state.
   * Preserves the current page when possible.
   */
  async Reload(): Promise<void> {
    if (this.pageNumber() === 0) {
      await this.LoadItems();
      return;
    }
    const cursor = this.pageLastItems[this.pageNumber() - 1];
    await this.LoadItems(cursor);
  }

  private async LoadItems(startingAfter?: string): Promise<void> {
    if (!this.endpoint) return;

    this.loading.set(true);
    try {
      let url = `${this.endpoint}?limit=${this.limit}`;
      if (startingAfter) {
        url += `&starting_after=${startingAfter}`;
      }

      // Add additional query params
      for (const [key, value] of Object.entries(this.queryParams)) {
        if (value) {
          url += `&${key}=${value}`;
        }
      }

      // Add expand info
      if (this.expand.length > 0) {
        url += `&expand[]=`;
        for (const expand of this.expand) {
          url += `data.${expand},`;
        }
        url = url.slice(0, -1);
      }

      const response = await this.api.Call<ListResponse<T>>('GET', url);

      this.items.set(response.data);
      this.hasMore.set(response.has_more);
      // Estimate total count based on page data
      if (this.pageNumber() === 0 && response.data.length > 0) {
        this.totalCount.set(
          response.has_more ? response.data.length * 10 : response.data.length
        );
      }
    } catch (error) {
      console.error('Failed to load items:', error);
      this.items.set([]);
      this.hasMore.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  async NextPage(): Promise<void> {
    if (!this.hasMore()) return;

    const currentItems = this.items();
    if (currentItems.length === 0) return;

    const lastItem = currentItems[currentItems.length - 1];

    // Store last item ID of current page before moving forward
    this.pageLastItems[this.pageNumber()] = lastItem.id;
    this.pageNumber.update((n) => n + 1);

    await this.LoadItems(lastItem.id);
  }

  async PreviousPage(): Promise<void> {
    if (this.pageNumber() === 0) return;

    this.pageNumber.update((n) => n - 1);

    if (this.pageNumber() === 0) {
      // First page - no cursor needed
      await this.LoadItems();
    } else {
      // Use the last item of the page before the one we want
      // To get page N (where N > 0), use starting_after = last item of page N-1
      const cursor = this.pageLastItems[this.pageNumber() - 1];
      await this.LoadItems(cursor);
    }
  }

  OnRowClick(item: T): void {
    if (this.openMenuItemId() !== null) {
      this.openMenuItemId.set(null);
      return;
    }
    this.rowClick.emit(item);
  }

  GetItemValue(item: T, field: string): unknown {
    if (field.includes('.')) {
      for (const part of field.split('.')) {
        item = item[part] as T;
      }
      return item;
    }
    if (field.includes('[')) {
      const [key, index] = field.split('[');
      const indexNumber = parseInt(index.replace(']', ''));
      const value = item[key] as unknown[];
      return value[indexNumber] ?? '';
    }
    return item[field];
  }

  GetItemNumber(item: T, field: string): number {
    const value = this.GetItemValue(item, field);
    return typeof value === 'number' ? value / 100 : 0;
  }

  GetItemDate(item: T, field: string): number {
    const value = this.GetItemValue(item, field);
    // API returns Unix timestamps in seconds, DatePipe expects milliseconds
    return typeof value === 'number' ? value * 1000 : 0;
  }

  GetItemString(item: T, column: PaginatedListColumn): string {
    // Use formatter if provided
    if (column.formatter) {
      return column.formatter(item);
    }
    const value = this.GetItemValue(item, column.field);
    return String(value ?? '');
  }

  GetItemImage(item: T, field: string): string {
    //An array field, e.g. "images[0]"
    if (field.includes('[')) {
      const [key, index] = field.split('[');
      const indexNumber = parseInt(index.replace(']', ''));
      const value = item[key] as unknown[];
      return String(value[indexNumber] ?? '');
    }
    //A single field, e.g. "imageUrl"
    const value = this.GetItemValue(item, field);
    return String(value ?? '');
  }

  GetColumnProgress(item: T, column: PaginatedListColumn): number | null {
    if (!column.progressGetter) return null;
    const value = column.progressGetter(item);
    if (value == null || Number.isNaN(value)) return null;
    return Math.min(1, Math.max(0, value));
  }

  /** SVG stroke-dasharray for a ring with radius 7. */
  GetProgressDasharray(progress: number): string {
    const circumference = 2 * Math.PI * 7;
    return `${progress * circumference} ${circumference}`;
  }

  GetItemCurrency(item: T, field: string): string {
    const value = this.GetItemValue(item, field);
    return String(value ?? 'usdc').toUpperCase();
  }

  /**
   * Format currency with code display
   * Returns { value: formatted number, currency: currency code, isNegative: boolean }
   */
  GetFormattedCurrency(
    item: T,
    amountField: string,
    currencyField: string
  ): { value: number; currency: string; isNegative: boolean } {
    const amount = this.GetItemNumber(item, amountField);
    const currency = this.GetItemCurrency(item, currencyField);
    return {
      value: Math.abs(amount),
      currency,
      isNegative: amount < 0,
    };
  }

  GetDisplayRange(): string {
    const start = this.pageNumber() * this.limit + 1;
    const end = start + this.items().length - 1;
    return `${start}-${end}`;
  }

  GetTotalDisplay(): string {
    if (this.hasMore()) {
      return `${this.totalCount()}+`;
    }
    const total = this.pageNumber() * this.limit + this.items().length;
    return String(total);
  }
}
