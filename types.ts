export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}

export interface SlideContent {
  title: string;
  content: string[];
}

// Fix: Add ConnectionState enum for connection status tracking.
export enum ConnectionState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  CLOSING = 'closing',
  CLOSED = 'closed',
  ERROR = 'error',
}

// Fix: Add ConversationRole enum to distinguish between user and model.
export enum ConversationRole {
  USER = 'user',
  MODEL = 'model',
}

// Fix: Add TranscriptEntry interface for conversation history entries.
export interface TranscriptEntry {
  id: string;
  role: ConversationRole;
  text: string;
}