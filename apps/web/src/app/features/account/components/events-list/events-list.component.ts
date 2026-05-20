import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Input,
  signal,
  WritableSignal,
} from '@angular/core';

import {
  PaginatedListColumn,
  PaginatedListComponent,
} from '../../../../shared';

import { Event } from '@zoneless/shared-types';

@Component({
  selector: 'app-events-list',
  imports: [PaginatedListComponent],
  templateUrl: './events-list.component.html',
  styleUrl: './events-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsListComponent implements OnInit {
  @Input() itemId = '';

  eventColumns: WritableSignal<PaginatedListColumn[]> = signal([]);
  eventQueryParams: WritableSignal<Record<string, string>> = signal({});

  ngOnInit(): void {
    this.InitEventList(this.itemId);
  }

  InitEventList(itemId: string): void {
    this.eventColumns.set([
      {
        header: 'Description',
        field: 'type',
        type: 'text',
        formatter: (item: unknown) => {
          const event = item as Event;
          if (event.type) {
            const parts = event.type.split('.');
            return `A ${parts[0]} with id ${event.data.object.id} was ${parts[1]}`;
          }
          return '—';
        },
        bolded: true,
      },
      {
        header: 'Created',
        field: 'created',
        type: 'date',
      },
    ]);
    this.eventQueryParams.set({
      related_object: itemId,
    });
  }
}
