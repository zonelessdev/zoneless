import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Account } from '@zoneless/shared-types';
import { AccountService } from '../../../../../data';

@Component({
  selector: 'app-dashboard-search',
  imports: [FormsModule, RouterLink],
  templateUrl: './dashboard-search.component.html',
  styleUrl: './dashboard-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSearchComponent implements OnDestroy {
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  query: WritableSignal<string> = signal('');
  results: WritableSignal<Account[]> = signal([]);
  open: WritableSignal<boolean> = signal(false);
  loading: WritableSignal<boolean> = signal(false);
  activeIndex: WritableSignal<number> = signal(-1);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;

  ngOnDestroy(): void {
    this.ClearSearchTimer();
  }

  OnFocus(): void {
    if (this.query().trim()) {
      this.open.set(true);
    }
  }

  OnQueryChange(value: string): void {
    this.query.set(value);
    this.activeIndex.set(-1);

    const trimmed = value.trim();
    if (!trimmed) {
      this.ClearSearchTimer();
      this.results.set([]);
      this.open.set(false);
      this.loading.set(false);
      return;
    }

    this.open.set(true);
    this.loading.set(true);
    this.ClearSearchTimer();
    this.searchTimer = setTimeout(() => {
      void this.RunSearch(trimmed);
    }, 200);
  }

  OnKeyDown(event: KeyboardEvent): void {
    if (!this.open()) return;

    const results = this.results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length === 0) return;
      this.activeIndex.update((index) =>
        index < results.length - 1 ? index + 1 : 0
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      this.activeIndex.update((index) =>
        index <= 0 ? results.length - 1 : index - 1
      );
      return;
    }

    if (event.key === 'Enter') {
      const index = this.activeIndex();
      const account = index >= 0 ? results[index] : results[0];
      if (account) {
        event.preventDefault();
        this.SelectAccount(account);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.Close();
    }
  }

  SelectAccount(account: Account): void {
    this.OnResultClick();
    void this.router.navigate(['/account/connected-accounts', account.id]);
  }

  OnResultClick(): void {
    this.query.set('');
    this.results.set([]);
    this.Close();
  }

  GetDisplayName(account: Account): string {
    return this.accountService.GetConnectedAccountDisplayName(account);
  }

  GetMatchValue(account: Account): string {
    return this.accountService.GetConnectedAccountSearchMatch(
      account,
      this.query()
    );
  }

  MatchesQuery(value: string): boolean {
    const query = this.query().trim().toLowerCase();
    if (!query) return false;
    return value.toLowerCase().includes(query);
  }

  @HostListener('document:click', ['$event'])
  OnDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.Close();
    }
  }

  private async RunSearch(query: string): Promise<void> {
    const requestId = ++this.searchRequestId;
    try {
      const response = await this.accountService.SearchConnectedAccounts(query);
      if (requestId !== this.searchRequestId) return;
      this.results.set(response.data);
      this.open.set(true);
    } catch (error) {
      if (requestId !== this.searchRequestId) return;
      console.error('Failed to search connected accounts:', error);
      this.results.set([]);
    } finally {
      if (requestId === this.searchRequestId) {
        this.loading.set(false);
      }
    }
  }

  private Close(): void {
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  private ClearSearchTimer(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }
}
