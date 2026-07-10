import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SideMenuComponent, SideMenuGroup } from '../../../../shared';

@Component({
  selector: 'app-full-shell',
  imports: [SideMenuComponent, RouterLink],
  templateUrl: './full-shell.component.html',
  styleUrl: './full-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullShellComponent {
  @Input({ required: true }) sideMenu: SideMenuGroup[] = [];
  @Input() showTestMode = false;
}
