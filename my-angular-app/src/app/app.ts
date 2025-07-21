import { Component, signal } from '@angular/core';
import { NetworkGraphComponent } from './network-graph/network-graph';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NetworkGraphComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('my-angular-app');
}
