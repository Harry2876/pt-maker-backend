// Advanced Engine Type Definitions
// Handles slot mapping and result processing for tournament screenshots

// Raw data from slot assignment screenshot
export interface SlotMappingData {
  slot_number: string;
  player_names: string[];
}

// Raw data from result screenshots
export interface MatchResultData {
  rank: number;
  players: {
    name: string;
    finishes: number; // kills/eliminations
  }[];
}

// Manual input for quick tournaments
export interface ManualSlotInput {
  slotNumber: string;
  teamName: string;
  playerNames?: string[];
}

// Processing request data
export interface AdvancedEngineRequest {
  matchId: string;
  tournamentId?: string;
  groupId?: string;
  processingType: 'FULL_AUTO' | 'MANUAL_SLOTS' | 'RESULTS_ONLY';
  screenshots: {
    slotScreenshots: string[]; // URLs to slot assignment images
    resultScreenshots: string[]; // URLs to result images
  };
  manualSlots?: ManualSlotInput[]; // For quick tournaments
  metadata?: {
    gameMode?: string;
    mapName?: string;
    matchNumber?: number;
  };
}

// Processing response
export interface AdvancedEngineResponse {
  success: boolean;
  processingId: string;
  extractedData: {
    slotMappings: SlotMappingData[];
    results: MatchResultData[];
    teamMappings: TeamMappingResult[];
  };
  confidence: {
    overall: number; // 0-1
    slotExtraction: number;
    resultExtraction: number;
  };
  processingTime: number; // milliseconds
  errors?: string[];
  warnings?: string[];
}

// Team mapping after processing
export interface TeamMappingResult {
  slotNumber: string;
  teamName: string;
  players: string[];
  finalRank?: number;
  totalKills?: number;
  points?: number;
}

// Database storage interface
export interface ProcessedMatchResult {
  id: string;
  matchId: string;
  processingId: string;
  slotMappings: SlotMappingData[];
  results: MatchResultData[];
  teamMappings: TeamMappingResult[];
  confidence: number;
  processingMethod: 'ADVANCED_ENGINE' | 'MANUAL_ENTRY';
  createdAt: Date;
  processedBy: string; // user ID
}

// Gemini API specific types
export interface GeminiPromptData {
  imageType: 'SLOT_ASSIGNMENT' | 'MATCH_RESULTS';
  imageUrl: string;
  context?: {
    expectedSlots?: number;
    gameMode?: string;
    previousResults?: any;
  };
}

export interface GeminiResponse {
  success: boolean;
  extractedData: any;
  confidence: number;
  processingTime: number;
  rawResponse?: string;
  error?: string;
}

// Queue job types
export interface AdvancedEngineJob {
  type: 'PROCESS_SCREENSHOTS';
  matchId: string;
  userId: string;
  request: AdvancedEngineRequest;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  createdAt: Date;
}

// Error types
export interface AdvancedEngineError {
  code: 'INVALID_IMAGE' | 'EXTRACTION_FAILED' | 'GEMINI_ERROR' | 'MAPPING_ERROR' | 'VALIDATION_ERROR';
  message: string;
  details?: any;
  imageUrl?: string;
  stage: 'PREPROCESSING' | 'EXTRACTION' | 'MAPPING' | 'VALIDATION';
}

// Configuration interface
export interface AdvancedEngineConfig {
  enabled: boolean;
  geminiApiKey: string;
  model: string;
  textModel: string;
  maxImagesPerBatch: number;
  timeout: number;
  retryAttempts: number;
  confidenceThreshold: number;
}