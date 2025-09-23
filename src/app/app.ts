import {Component, inject, NgZone, OnInit, signal, PLATFORM_ID, Inject} from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../environments/environment';
import {FormsModule} from '@angular/forms';
import {isPlatformBrowser} from '@angular/common';

interface Participant {
  connectionId: string;
  displayName: string;
  vote: string | null;
  userId: string;
}

interface Snapshot {
  roomId: string;
  storyTitle?: string;
  revealed: boolean;
  participants: Participant[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  imports: [
    FormsModule
  ]
})
export class App implements OnInit {
  connection!: signalR.HubConnection;
  connected = false;

  displayName = '';
  roomId = '';
  snapshot = signal<Snapshot|undefined>(undefined);
  userId = signal<string|undefined>(undefined);
  chosenCard = signal<string|undefined>(undefined);
  isReconnecting = signal<boolean>(false);

  cards = ['1', '2', '3', '5', '8', '13', '20', '?', '☕'];

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private zone: NgZone) {}


  async ngOnInit() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .build();

    this.registerHandlers();

    await this.connection.start();
    this.connected = true;

    if (isPlatformBrowser(this.platformId)) {
      let uid = localStorage.getItem('pp_userId');
      if (!uid) {
        uid = crypto.randomUUID();
        localStorage.setItem('pp_userId', uid);
      }
      this.userId.set(uid);

      const lastRoom = localStorage.getItem('pp_lastRoomId');
      const lastName = localStorage.getItem('pp_displayName');

      if (lastRoom && lastName) {
        // Versuch Rejoin
        await this.connection.invoke('JoinRoom', lastRoom, lastName, this.userId());
        this.roomId = lastRoom;
      }
    } else {
      // Server-Kontext: kein localStorage verfügbar
      console.log('Running on server – skipping localStorage');
    }
  }

  private registerHandlers() {
    this.connection.onreconnecting(() => this.zone.run(() => this.isReconnecting.set(true)));
    this.connection.onreconnected(() => this.zone.run(() => {
      const lastRoom = localStorage.getItem('pp_lastRoomId');
      const lastName = localStorage.getItem('pp_displayName');

      this.connection.invoke('JoinRoom', lastRoom, lastName, this.userId())
        .then(() => {
          this.roomId = lastRoom!;
          this.displayName = lastName!;
          this.registerHandlers();
          if (this.chosenCard())
          {
            this.chooseCard(this.chosenCard()!).then(()=>{})
          }
        }).finally(()=>this.isReconnecting.set(false))
    }));
    this.connection.on('presence', snap => this.zone.run(() => (this.snapshot.set(snap))));
    this.connection.on('state', snap => this.zone.run(() => (this.snapshot.set(snap))));
    this.connection.on('voteProgress', snap => this.zone.run(() => (this.snapshot.set(snap))));
    this.connection.on('revealed', snap => this.zone.run(() => (this.snapshot.set(snap))));
    this.connection.on('roomDeleted', (roomId: string) =>
      this.zone.run(() => {
        if (this.roomId === roomId) {
          alert('Room deleted');
          this.snapshot.set(undefined);
          this.roomId = '';
        }
      })
    );
    this.connection.on('kicked', (msg: string) => {
      alert(msg);
      this.snapshot.set(undefined);
      this.roomId = '';
    });
  }

  async createRoom() {
    if (!this.displayName) return;
    this.roomId = await this.connection.invoke<string>('CreateAndJoin', this.displayName, this.userId());
    localStorage.setItem('pp_lastRoomId', this.roomId);
    localStorage.setItem('pp_displayName', this.displayName);
  }

  async joinRoom() {
    if (!this.displayName || !this.roomId) return;
    await this.connection.invoke('JoinRoom', this.roomId, this.displayName, this.userId());
    localStorage.setItem('pp_lastRoomId', this.roomId);
    localStorage.setItem('pp_displayName', this.displayName);
  }

  async leaveRoom() {
    if (!this.roomId) return;
    await this.connection.invoke('LeaveRoom', this.roomId);
    this.snapshot.set(undefined);
    this.roomId = '';

    localStorage.removeItem('pp_lastRoomId');
    localStorage.removeItem('pp_displayName');
  }

  async setStory(title: string) {
    if (!this.roomId) return;
    await this.connection.invoke('SetStory', this.roomId, title);
  }

  async chooseCard(card: string) {
    if (!this.roomId) return;
    await this.connection.invoke('ChooseCard', this.roomId, card);
    this.chosenCard.set(card);
  }

  async reveal() {
    if (!this.roomId) return;
    await this.connection.invoke('Reveal', this.roomId);
  }

  async reset() {
    if (!this.roomId) return;
    await this.connection.invoke('ResetRound', this.roomId);
    this.chosenCard.set(undefined);
  }

  trackByConnection(index: number, item: Participant) {
    return item.connectionId;
  }

  isCardSelected(card: string): boolean {
    if (!this.snapshot() || !this.userId()) return false;
    return this.chosenCard() === card;
  }

  isCurrentUser(participant: Participant): boolean {
    return participant.userId === this.userId();
  }
}
