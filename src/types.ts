export type ExtractionMode =
  | 'free_stream'
  | 'quick_fire'
  | 'guided_drill'
  | 'binary_frame'
  | 'swipe'
  | 'slider'
  | 'card_sort'
  | 'timeline'
  | 'sentence_completion'
  | 'devils_advocate'
  | 'letter_writing'
  | 'priority_pile';

export interface Thought {
  id: string;
  text: string;
  timestamp: string;
  mode: ExtractionMode | 'system';
  
  // Swipe mode properties
  swipeStatus?: 'like' | 'dislike' | 'maybe';
  
  // Slider mode intensities
  intensity?: {
    urgency?: number;    // 1-10
    certainty?: number;  // 1-10
    emotion?: number;    // 1-10
    actionability?: number; // 1-10
  };
  
  // Card clustering properties
  clusterCategory?: string;
  
  // Timeline properties
  timelineZone?: 'before' | 'now' | 'after';
  
  // Priority pile properties
  priorityZone?: 'act' | 'watch' | 'discard';
  
  // Optional linkage to parent prompt
  promptContext?: string;
}

export interface Session {
  id: string;
  topic: string;
  intention: string;
  isCustomIntention: boolean;
  status: 'intake' | 'intention' | 'recommendation' | 'active' | 'review' | 'exported';
  activeMode: ExtractionMode;
  thoughts: Thought[];
  modeProgress: Record<ExtractionMode, number>; // How many items generated or interaction step
  modeHistory: { mode: ExtractionMode; timestamp: string }[];
  
  // Selection Warmup answers
  warmupAnswers?: {
    clarity: 'clear' | 'foggy' | '';
    nature: 'emotional' | 'analytical' | '';
    timeAvailable: '<5' | '>20' | '';
    intentType: 'decide' | 'process' | 'capture' | '';
  };
  
  // Session results
  synthesizedOutline?: string;
  synthesizedSummary?: string;
  synthesizedActionItems?: string[];
  
  createdAt: string;
  updatedAt: string;
  advancedSettings?: {
    promptingStyle: 'standard' | 'socratic' | 'empathetic';
    outputFilter: 'comprehensive' | 'actions' | 'roadmap';
    cognitiveBiasAudit: 'include' | 'exclude';
  };
}

export interface QuickFirePrompt {
  id: string;
  text: string;
  answered: boolean;
}

export interface BinaryPair {
  id: string;
  optionA: string;
  optionB: string;
  chosen?: 'A' | 'B' | 'other';
  otherText?: string;
}

export interface SentencePrompt {
  id: string;
  prefix: string;
  completed?: string;
}

export interface ImageCard {
  id: string;
  url: string;
  keywords: string[];
}
