import {Participant} from './participant';

export interface Snapshot {
  roomId: string;
  storyTitle?: string;
  revealed: boolean;
  participants: Participant[];
}
