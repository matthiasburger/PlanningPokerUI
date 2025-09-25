import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {RoomService} from '../../services/room-service';

@Component({
  selector: 'room',
  standalone: true,
  templateUrl: './room.html',
  styleUrls: ['./room.css'],
  imports: [FormsModule],
})
export class RoomComponent implements OnInit {
  constructor(
    public roomService: RoomService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit() {
    this.route.params.subscribe(async (params) => {
      const roomParam = params['id'];
      const displayName = localStorage.getItem('pp_displayName');

      if (!displayName) {
        await this.router.navigate(['/']);
        return;
      }

      await this.roomService.joinRoom(roomParam, displayName);
    });
  }

  // Delegate to service
  reveal() {
    this.roomService.reveal();
  }

  reset() {
    this.roomService.reset();
  }

  leaveRoom() {
    this.roomService.leaveRoom().then(() => {
      this.router.navigate(['/']);
    });
  }

  chooseCard(card: string) {
    this.roomService.chooseCard(card);
  }

  kickUser(userId: string) {
    this.roomService.kickUser(userId);
  }

  isCardSelected(card: string) {
    return this.roomService.isCardSelected(card);
  }

  isCurrentUser(participant: any) {
    return this.roomService.isCurrentUser(participant);
  }

  trackByConnection(index: number, item: any) {
    return item.connectionId;
  }
}
