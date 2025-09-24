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

  displayName = signal<string|undefined>(undefined);
  roomId = signal<string|undefined>(undefined);
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
      this.displayName.set(lastName!);

      if (lastRoom && lastName) {
        // Versuch Rejoin
        await this.connection.invoke('JoinRoom', lastRoom, lastName, this.userId());
        this.roomId.set(lastRoom);
      }
    } else {
      // Server-Kontext: kein localStorage verfügbar
      console.log('Running on server – skipping localStorage');
    }
  }

  private unregisterAllHandlers(){
    this.connection.off("presence");
    this.connection.off("state");
    this.connection.off("voteProgress");
    this.connection.off("revealed");
    this.connection.off("roomDeleted");
    this.connection.off("kicked");
  }

  private registerHandlers() {
    this.unregisterAllHandlers()

    this.connection.onreconnecting(() => this.zone.run(() => this.isReconnecting.set(true)));
    this.connection.onreconnected(() => this.zone.run(() => {
      const lastRoom = localStorage.getItem('pp_lastRoomId');
      const lastName = localStorage.getItem('pp_displayName');

      this.connection.invoke('JoinRoom', lastRoom, lastName, this.userId())
        .then(() => {
          this.roomId.set(lastRoom!);
          this.displayName.set(lastName!);
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
        if (this.roomId() === roomId) {
          alert('Room deleted');
          this.snapshot.set(undefined);
          this.roomId.set('');
        }
      })
    );
    this.connection.on('kicked', (msg: string) => {
      this.leaveRoom().then(()=>{
        this.snapshot.set(undefined);
        this.roomId.set('');
        alert(msg);
      })
    });
  }

  async createRoom() {
    if (!this.displayName()) return;
    this.roomId.set(await this.connection.invoke<string>('CreateAndJoin', this.displayName(), this.userId()));
    localStorage.setItem('pp_lastRoomId', this.roomId()!);
    localStorage.setItem('pp_displayName', this.displayName()!);
  }

  async joinRoom() {
    if (!this.displayName() || !this.roomId()) return;
    await this.connection.invoke('JoinRoom', this.roomId(), this.displayName(), this.userId());
    localStorage.setItem('pp_lastRoomId', this.roomId()!);
    localStorage.setItem('pp_displayName', this.displayName()!);
  }

  async leaveRoom() {
    if (!this.roomId()) return;
    await this.connection.invoke('LeaveRoom', this.roomId());
    this.snapshot.set(undefined);
    this.roomId.set('')

    localStorage.removeItem('pp_lastRoomId');
    localStorage.removeItem('pp_displayName');
  }

  async setStory(title: string) {
    if (!this.roomId()) return;
    await this.connection.invoke('SetStory', this.roomId(), title);
  }

  async chooseCard(card: string) {
    if (!this.roomId()) return;
    await this.connection.invoke('ChooseCard', this.roomId(), card);
    this.chosenCard.set(card);
  }

  async reveal() {
    if (!this.roomId()) return;
    await this.connection.invoke('Reveal', this.roomId());
  }

  async reset() {
    if (!this.roomId()) return;
    await this.connection.invoke('ResetRound', this.roomId());
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

  async kickUser(userId: string) {
    if (!this.roomId()) return;
    await this.connection.invoke('KickUser', this.roomId(), userId, this.userId());
  }
}
