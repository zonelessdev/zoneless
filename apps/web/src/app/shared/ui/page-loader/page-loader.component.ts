import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
  WritableSignal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { LoaderComponent } from '../loader/loader.component';

@Component({
  selector: 'app-page-loader',
  templateUrl: './page-loader.component.html',
  styleUrls: ['./page-loader.component.scss'],
  standalone: true,
  imports: [LoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageLoaderComponent implements OnChanges {
  @Input() loading = true;
  display: WritableSignal<boolean> = signal(true);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['loading']?.currentValue === false) {
      setTimeout(() => {
        this.display.set(false);
      }, 500);
    } else if (changes['loading']?.currentValue === true) {
      this.display.set(true);
    }
  }
}
