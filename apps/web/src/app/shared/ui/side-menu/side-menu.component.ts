import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  inject,
  WritableSignal,
} from '@angular/core';
import { StorageService } from '../../../core';
import { PlatformLogoComponent } from '../platform-logo/platform-logo.component';

export interface SideMenuItem {
  title: string;
  icon: string;
  id: string;
  hidden?: boolean;
  /** If true, item will be positioned at the bottom of the sidebar (desktop only) */
  bottom?: boolean;
}

@Component({
  selector: 'app-side-menu',
  templateUrl: './side-menu.component.html',
  styleUrls: ['./side-menu.component.scss'],
  standalone: true,
  imports: [PlatformLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SideMenuComponent {
  private readonly storage = inject(StorageService);

  @Input() selected = '';
  @Output() selectedChange = new EventEmitter<string>();
  @Output() selectedChanged = new EventEmitter<void>();

  @Input() sideMenu: SideMenuItem[][] = [];

  expanded: WritableSignal<boolean> = signal(true);

  constructor() {
    const expandedValue = this.storage.GetItemString('sidebar-expanded');
    if (expandedValue === 'false') {
      this.expanded.set(false);
    } else {
      this.expanded.set(true);
    }
  }

  ToggleSidebar(): void {
    this.expanded.update((value) => !value);
    this.storage.StoreItemString('sidebar-expanded', String(this.expanded()));
  }

  SelectItem(id: string): void {
    this.selected = id;
    this.ScrollToSelectedItem();
    this.selectedChange.emit(this.selected);
    this.selectedChanged.emit();
  }

  ScrollToSelectedItem(): void {
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.innerWidth <= 1000) {
        const selectedItem = document.querySelector('.menu-icon-selected');
        if (selectedItem) {
          const subMenusWrapper = document.querySelector('.sub-menus-wrapper');
          if (subMenusWrapper) {
            const scrollLeft = (selectedItem as HTMLElement).offsetLeft - 16;
            subMenusWrapper.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          }
        }
      }
    }, 0);
  }
}
