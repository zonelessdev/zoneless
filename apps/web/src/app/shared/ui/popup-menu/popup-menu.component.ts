import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
  WritableSignal,
  HostListener,
} from '@angular/core';

export interface PopupMenuAction {
  /** Title of the action */
  title: string;
  /** Description of the action */
  description?: string;
  /** Optional section heading rendered above this item when it changes */
  section?: string;
  /** Action to perform when the action is clicked */
  action: (item: any) => void;
  /** Optional predicate to disable the action for a given item */
  disabled?: (item: any) => boolean;
  /** Optional predicate to hide the action for a given item */
  hidden?: (item: any) => boolean;
  /** Style the action as destructive (red) */
  destructive?: boolean;
  /** Show an external-link affordance next to the title */
  external?: boolean;
}

@Component({
  selector: 'app-popup-menu',
  imports: [],
  templateUrl: './popup-menu.component.html',
  styleUrl: './popup-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopupMenuComponent {
  @Input() actions: PopupMenuAction[] = [];
  @Input() item: any;
  @Input() highlightIcon = false;

  menuOpen: WritableSignal<boolean> = signal(false);

  GetVisibleActions(): PopupMenuAction[] {
    return this.actions.filter((action) =>
      action.hidden ? !action.hidden(this.item) : true
    );
  }

  ToggleActionsMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(!this.menuOpen());
  }

  OnActionClick(
    event: Event,
    action: PopupMenuAction,
    item: any,
    isDisabled: boolean
  ): void {
    event.stopPropagation();
    if (isDisabled) return;
    this.menuOpen.set(false);
    action.action(item);
  }

  ShouldShowSection(
    action: PopupMenuAction,
    index: number,
    visible: PopupMenuAction[]
  ): boolean {
    if (!action.section) return false;
    if (index === 0) return true;
    return visible[index - 1]?.section !== action.section;
  }

  @HostListener('document:click')
  CloseActionsMenu(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }
}
