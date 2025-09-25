import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent {
  displayName = '';
  roomId = signal<string|undefined>(undefined);

  constructor(
    private router: Router
  ) {
    const lastRoom = localStorage.getItem('pp_lastRoomId');
    if (lastRoom){
      this.roomId.set(lastRoom);
    }
  }

  joinRoom() {
    if (!this.displayName || !this.roomId) return;
    localStorage.setItem('pp_displayName', this.displayName);
    this.router.navigate(['/room', this.roomId()]).then(r =>{});
  }
}
