import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MetadataToArray, MetadataFromArray } from '../../util/metadata';

@Component({
  selector: 'app-metadata-editor',
  imports: [FormsModule],
  templateUrl: './metadata-editor.component.html',
  styleUrl: './metadata-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataEditorComponent implements OnChanges {
  @Input() metadata: Record<string, string> = {};

  metadataArray: WritableSignal<{ key: string; value: string }[]> = signal([]);

  private lastEmitted: Record<string, string> | null = null;

  @Output() formChange = new EventEmitter<Record<string, string>>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['metadata'] && this.metadata !== this.lastEmitted) {
      this.metadataArray.set(MetadataToArray(this.metadata));
    }
  }

  OnMetadataKeyChange(index: number, value: string): void {
    this.metadataArray.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, key: value } : row))
    );
    this.EmitFormChange();
  }

  OnMetadataValueChange(index: number, value: string): void {
    this.metadataArray.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, value } : row))
    );
    this.EmitFormChange();
  }

  AddMoreMetadata(): void {
    this.metadataArray.update((metadataArray) => [
      ...metadataArray,
      { key: '', value: '' },
    ]);
    this.EmitFormChange();
  }

  RemoveMetadata(index: number): void {
    this.metadataArray.update((metadataArray) =>
      metadataArray.filter((_, i) => i !== index)
    );
    this.EmitFormChange();
  }

  private EmitFormChange(): void {
    const next = MetadataFromArray(this.metadataArray());
    this.lastEmitted = next;
    this.formChange.emit(next);
  }
}
