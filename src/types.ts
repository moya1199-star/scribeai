export interface Segment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  sentiment?: 'positive' | 'neutral' | 'critical';
}

export interface ActionItem {
  id: string;
  text: string;
  assignee?: string;
  completed: boolean;
}

export interface Decision {
  id: string;
  title: string;
  rationale: string;
  approvedBy?: string[];
}

export interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  summary?: string;
}

export interface ConversationMetrics {
  totalWords?: number;
  averageSpeed?: number;
  silenceRatio?: number;
  speakerInterruptionCount?: number;
}

export interface Speaker {
  id?: string;
  name: string;
  role?: string;
}

export interface TranscriptionDetail {
  language: string;
  summary: string;
  keyPoints?: string[];
  speakers?: string[];
  segments?: Segment[];
  chapters?: Chapter[];
  actionItems?: ActionItem[];
  decisions?: Decision[];
  metrics?: ConversationMetrics;
  audioUrl?: string;
}

export interface VoiceNote {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  duration: number;
  audioUrl?: string;
  transcription: TranscriptionDetail;
  isLocalFallback?: boolean;
  userId?: string;
createdAtTs?: any;
}