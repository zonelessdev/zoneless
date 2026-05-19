import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
  inject,
  WritableSignal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
  imports: [PlatformLogoComponent, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SideMenuComponent {
  private readonly storage = inject(StorageService);

  /** Route prefix that every menu item id is appended to */
  @Input() basePath: (string | number)[] = ['/account'];

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

  LinkFor(itemId: string): (string | number)[] {
    return [...this.basePath, itemId];
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
