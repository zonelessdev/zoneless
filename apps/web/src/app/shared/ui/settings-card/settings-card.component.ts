import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';

export interface SettingsCardRow {
  label: string;
  value: string | string[] | null;
  type?: 'text' | 'multiline';
}

export interface SettingsCardAction {
  /** Unique identifier for the action */
  id: string;
  /** Icon path (relative to assets/icons/) */
  icon: string;
  /** Accessible label for the action */
  label: string;
  /** Optional: 'default' | 'danger' - affects hover color */
  variant?: 'default' | 'danger';
}

@Component({
  selector: 'app-settings-card',
  standalone: true,
  imports: [],
  templateUrl: './settings-card.component.html',
  styleUrls: ['./settings-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsCardComponent {
  @Input() title = '';
  @Input() rows: SettingsCardRow[] = [];
  @Input() showEditButton = true;
  @Input() editLabel = 'Edit';
  @Input() actions: SettingsCardAction[] = [];

  @Output() editClicked = new EventEmitter<void>();
  @Output() actionClicked = new EventEmitter<string>();

  OnEditClick(): void {
    this.editClicked.emit();
  }

  OnActionClick(actionId: string): void {
    this.actionClicked.emit(actionId);
  }

  IsArray(value: unknown): boolean {
    return Array.isArray(value);
  }

  AsArray(value: string | string[] | null): string[] {
    if (Array.isArray(value)) {
      return value;
    }
    return [];
  }

  AsString(value: string | string[] | null): string {
    if (typeof value === 'string') {
      return value;
    }
    return '';
  }
}
