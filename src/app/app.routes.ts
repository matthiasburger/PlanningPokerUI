import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { RoomComponent } from './components/room/room';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'room/:id', component: RoomComponent },
  { path: '**', redirectTo: '' }
];
