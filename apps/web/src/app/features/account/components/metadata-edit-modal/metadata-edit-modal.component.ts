import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';

import { ModalComponent } from '../../../../shared';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor.component';

@Component({
  selector: 'app-metadata-edit-modal',
  imports: [ModalComponent, MetadataEditorComponent],
  templateUrl: './metadata-edit-modal.component.html',
  styleUrl: './metadata-edit-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataEditModalComponent {
  @Input() title = 'Edit';

  @Input() loading = false;

  @Input() isOpen = false;

  @Output() confirmed = new EventEmitter<void>();

  @Output() cancelled = new EventEmitter<void>();

  @Input() metadata: Record<string, string> = {};

  @Output() formChange = new EventEmitter<Record<string, string>>();
}
