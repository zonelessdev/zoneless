import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { SideMenuComponent, SideMenuGroup } from '../../../../shared';

@Component({
  selector: 'app-express-shell',
  imports: [SideMenuComponent],
  templateUrl: './express-shell.component.html',
  styleUrl: './express-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpressShellComponent {
  @Input({ required: true }) sideMenu: SideMenuGroup[] = [];
  @Input() showTestMode = false;
}
