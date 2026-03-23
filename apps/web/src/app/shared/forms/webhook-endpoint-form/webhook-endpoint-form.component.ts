import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebhookEndpoint } from '@zoneless/shared-types';
import { VALID_EVENT_TYPES } from '../../../data/services/webhook-endpoint.service';

export type WebhookEndpointFormMode = 'create' | 'edit';

export interface WebhookEndpointFormData {
  url: string;
  enabled_events: string[];
  description: string;
  disabled: boolean;
}

@Component({
  selector: 'app-webhook-endpoint-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './webhook-endpoint-form.component.html',
  styleUrls: ['./webhook-endpoint-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhookEndpointFormComponent implements OnChanges {
  @Input() mode: WebhookEndpointFormMode = 'create';
  @Input() endpoint: WebhookEndpoint | null = null;
  @Input() showErrors = false;
  @Input() isOpen = false;
  @Input() createdSecret: string | null = null;

  @Output() formChange = new EventEmitter<WebhookEndpointFormData>();
  @Output() validationChange = new EventEmitter<boolean>();
  @Output() done = new EventEmitter<void>();

  url: WritableSignal<string> = signal('');
  urlError: WritableSignal<string> = signal('');
  description: WritableSignal<string> = signal('');
  disabled: WritableSignal<boolean> = signal(false);
  selectedEvents: WritableSignal<Set<string>> = signal(new Set(['*']));
  eventsError: WritableSignal<string> = signal('');
  showEventsDropdown: WritableSignal<boolean> = signal(false);

  readonly eventTypes = VALID_EVENT_TYPES;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.InitializeForm();
    }
  }

  InitializeForm(): void {
    if (this.endpoint && this.mode === 'edit') {
      this.url.set(this.endpoint.url || '');
      this.description.set(this.endpoint.description || '');
      this.disabled.set(this.endpoint.status === 'disabled');
      this.selectedEvents.set(new Set(this.endpoint.enabled_events || ['*']));
    } else {
      this.url.set('');
      this.description.set('');
      this.disabled.set(false);
      this.selectedEvents.set(new Set(['*']));
    }

    this.urlError.set('');
    this.eventsError.set('');
    this.showEventsDropdown.set(false);
    this.EmitFormChange();
  }

  OnUrlChange(value: string): void {
    this.url.set(value.trim());
    this.ValidateUrl();
    this.EmitFormChange();
  }

  OnDescriptionChange(value: string): void {
    this.description.set(value);
    this.EmitFormChange();
  }

  OnDisabledChange(value: boolean): void {
    this.disabled.set(value);
    this.EmitFormChange();
  }

  ToggleEventsDropdown(): void {
    this.showEventsDropdown.set(!this.showEventsDropdown());
  }

  ToggleEvent(eventValue: string): void {
    const events = new Set(this.selectedEvents());

    if (eventValue === '*') {
      // If selecting "all events", clear others and select only "*"
      events.clear();
      events.add('*');
    } else {
      // If selecting a specific event, remove "*" if present
      events.delete('*');

      if (events.has(eventValue)) {
        events.delete(eventValue);
      } else {
        events.add(eventValue);
      }

      // If no events selected, default to "*"
      if (events.size === 0) {
        events.add('*');
      }
    }

    this.selectedEvents.set(events);
    this.ValidateEvents();
    this.EmitFormChange();
  }

  IsEventSelected(eventValue: string): boolean {
    return this.selectedEvents().has(eventValue);
  }

  GetSelectedEventsDisplay(): string {
    const events = this.selectedEvents();
    if (events.has('*')) return 'All events';
    if (events.size === 0) return 'Select events...';
    if (events.size <= 2) {
      return Array.from(events).join(', ');
    }
    return `${events.size} events selected`;
  }

  ValidateUrl(): void {
    const urlValue = this.url();

    if (!urlValue) {
      this.urlError.set('Please enter a webhook URL');
      return;
    }

    try {
      const parsedUrl = new URL(urlValue);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        this.urlError.set('URL must use HTTP or HTTPS protocol');
        return;
      }
      this.urlError.set('');
    } catch {
      this.urlError.set('Please enter a valid URL');
    }
  }

  ValidateEvents(): void {
    if (this.selectedEvents().size === 0) {
      this.eventsError.set('Please select at least one event');
    } else {
      this.eventsError.set('');
    }
  }

  ValidateAll(): boolean {
    this.ValidateUrl();
    this.ValidateEvents();
    return !this.urlError() && !this.eventsError() && !!this.url();
  }

  IsValid(): boolean {
    return !!this.url() && !this.urlError() && this.selectedEvents().size > 0;
  }

  GetFormData(): WebhookEndpointFormData {
    return {
      url: this.url(),
      enabled_events: Array.from(this.selectedEvents()),
      description: this.description(),
      disabled: this.disabled(),
    };
  }

  private EmitFormChange(): void {
    this.formChange.emit(this.GetFormData());
    this.validationChange.emit(this.IsValid());
  }

  CopySecretToClipboard(): void {
    if (this.createdSecret) {
      navigator.clipboard.writeText(this.createdSecret);
    }
  }

  OnDoneClick(): void {
    this.done.emit();
  }
}
