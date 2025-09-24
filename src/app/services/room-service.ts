import {Injectable, signal} from '@angular/core';
import * as signalR from '@microsoft/signalr';
import {environment} from '../../environments/environment';
import {Snapshot} from '../models/snapshot';
import {Participant} from '../models/participant';

@Injectable({providedIn: 'root'})
export class RoomService {
  private connection!: signalR.HubConnection;

  // === Signals for state ===
  connected = signal(false);
  isReconnecting = signal(false);
  snapshot = signal<Snapshot | undefined>(undefined);
  roomId = signal<string | undefined>(undefined);
  displayName = signal<string | undefined>(undefined);
  userId = signal<string | undefined>(undefined);
  chosenCard = signal<string | undefined>(undefined);
  private readonly ready: Promise<void>;

  cards = ['1', '2', '3', '5', '8', '13', '20', '?', '☕'];

  constructor() {
    this.ready = this.initConnection();
  }

  private async initConnection() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();

    this.registerHandlers();

    try {
      await this.connection.start();
      this.connected.set(true);
    } catch (err) {
      console.error('SignalR connection failed:', err);
    }

    // Ensure we have a persistent userId
    let uid = localStorage.getItem('pp_userId');
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem('pp_userId', uid);
    }
    this.userId.set(uid);
  }

  private unregisterAllHandlers() {
    this.connection.off("presence");
    this.connection.off("state");
    this.connection.off("voteProgress");
    this.connection.off("revealed");
    this.connection.off("roomDeleted");
    this.connection.off("kicked");
  }

  private registerHandlers() {
    this.unregisterAllHandlers();

    this.connection.onreconnecting(() => this.isReconnecting.set(true));
    this.connection.onreconnected(() => {
      const lastRoom = localStorage.getItem('pp_lastRoomId');
      const lastName = localStorage.getItem('pp_displayName');
      this.connection.invoke('JoinRoom', lastRoom, lastName, this.userId()).then(() => {
        //this.roomId.set(lastRoom!);
        //this.displayName.set(lastName!);
        this.registerHandlers();
        if (this.chosenCard()) {
          this.chooseCard(this.chosenCard()!).then(() => {
          })
        }
      }).finally(() => this.isReconnecting.set(false))
    });
    this.connection.on('presence', snap => this.snapshot.set(snap));
    this.connection.on('state', snap => this.snapshot.set(snap));
    this.connection.on('voteProgress', snap => this.snapshot.set(snap));
    this.connection.on('revealed', snap => this.snapshot.set(snap));

    this.connection.on('roomDeleted', (roomId: string) => {
      if (this.roomId() === roomId) {
        this.snapshot.set(undefined);
        this.roomId.set(undefined);
        alert('Room deleted');
      }
    });

    this.connection.on('kicked', (msg: string) => {
      alert(msg);
      this.leaveRoom();
    });
  }

  // === Hub methods ===

  async createRoom(name: string) {
    await this.ready; // <-- wait until connection is started

    this.displayName.set(name);
    const roomId = await this.connection.invoke<string>(
      'CreateAndJoin',
      name,
      this.userId()
    );
    this.roomId.set(roomId);

    localStorage.setItem('pp_lastRoomId', roomId);
    localStorage.setItem('pp_displayName', name);
  }

  async joinRoom(roomId: string, name: string) {
    await this.ready; // <-- wait until connection is started

    this.displayName.set(name);
    await this.connection.invoke('JoinRoom', roomId, name, this.userId());
    this.roomId.set(roomId);

    localStorage.setItem('pp_lastRoomId', roomId);
    localStorage.setItem('pp_displayName', name);
  }

  async leaveRoom() {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('LeaveRoom', this.roomId());

    this.snapshot.set(undefined);
    this.roomId.set(undefined);

    localStorage.removeItem('pp_lastRoomId');
    localStorage.removeItem('pp_displayName');
  }

  async setStory(title: string) {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('SetStory', this.roomId(), title);
  }

  async chooseCard(card: string) {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('ChooseCard', this.roomId(), card);
    this.chosenCard.set(card);
  }

  async reveal() {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('Reveal', this.roomId());
  }

  async reset() {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('ResetRound', this.roomId());
    this.chosenCard.set(undefined);
  }

  async kickUser(userId: string) {
    await this.ready; // <-- wait until connection is started

    if (!this.roomId()) return;
    await this.connection.invoke('KickUser', this.roomId(), userId, this.userId());
  }

  // === Helpers ===

  isCardSelected(card: string): boolean {

    if (!this.snapshot() || !this.userId()) return false;
    return this.chosenCard() === card;
  }

  isCurrentUser(participant: Participant): boolean {

    return participant.userId === this.userId();
  }
}
