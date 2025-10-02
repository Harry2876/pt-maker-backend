export interface TournamentScaleConfig {
  small: {
    maxTeams: number;
    concurrency: number;
    batchSize: number;
    priority: number;
  };
  medium: {
    maxTeams: number;
    concurrency: number;
    batchSize: number;
    priority: number;
  };
  large: {
    maxTeams: number;
    concurrency: number;
    batchSize: number;
    priority: number;
  };
  massive: {
    maxTeams: number;
    concurrency: number;
    batchSize: number;
    priority: number;
  };
}

export interface BatchResultItem {
    teamRegistrationId: string;
    teamName: string;
    totalPoints: number;
    totalKills: number;
    totalMatches: number;
    averageKills: number;
    batchProcessed: boolean;
}

export interface CachedBatchResult {
    batchIndex: number;
    results: BatchResultItem[];
    processedAt: string;
    resultCount: number;
}

export type TournamentScale = 'small' | 'medium' | 'large' | 'massive';

export interface ScalableQueueJob {
  tournamentId: string;
  tournamentScale: TournamentScale;
  teamCount: number;
  batchSize?: number;
  priority?: number;
  processingStrategy: 'individual' | 'batch' | 'stream';
}

export interface BatchProcessingJob extends ScalableQueueJob {
  teams: any[];
  batchIndex: number;
  totalBatches: number;
  operation: string; 
}

export interface AdvancedEngineScalableJob extends ScalableQueueJob {
  screenshotData: any;
  matchId: string;
  stageId?: string;
  groupId?: string;
}

export interface LeaderboardBatchJob extends ScalableQueueJob {
  groupIds?: string[];
  calculateGlobal: boolean;
  forceRefresh: boolean;
  stageId?: string;
}

export interface QueueMetrics {
  queueName: string;
  activeJobs: number;
  waitingJobs: number;
  completedJobs: number;
  failedJobs: number;
  processingRate: number; // jobs per minute
  averageProcessingTime: number; // milliseconds
  currentConcurrency: number;
}

export class TournamentScaleDetector {
  private static readonly SCALE_CONFIG: TournamentScaleConfig = {
        small: {
      maxTeams: 100,
      concurrency: 2,        // Reduced from 3
      batchSize: 20,         // Increased batch size for efficiency
      priority: 5
    },
    medium: {
      maxTeams: 1000,
      concurrency: 3,        // Reduced from 8
      batchSize: 50,         // Increased batch size
      priority: 7
    },
    large: {
      maxTeams: 10000,
      concurrency: 5,        // Reduced from 20
      batchSize: 200,        // Increased batch size
      priority: 9
    },
    massive: {
      maxTeams: Infinity,
      concurrency: 8,        // Reduced from 50
      batchSize: 500,        // Same batch size
      priority: 10
    }
  };

  static detectScale(teamCount: number): TournamentScale {
    if (teamCount <= this.SCALE_CONFIG.small.maxTeams) return 'small';
    if (teamCount <= this.SCALE_CONFIG.medium.maxTeams) return 'medium';
    if (teamCount <= this.SCALE_CONFIG.large.maxTeams) return 'large';
    return 'massive';
  }

  static getConfig(scale: TournamentScale) {
    return this.SCALE_CONFIG[scale];
  }

  static getConfigForTeamCount(teamCount: number) {
    const scale = this.detectScale(teamCount);
    return {
      scale,
      config: this.getConfig(scale)
    };
  }

  static shouldUseBatchProcessing(teamCount: number): boolean {
    return teamCount > this.SCALE_CONFIG.small.maxTeams;
  }

  static calculateOptimalBatchSize(teamCount: number): number {
    const { config } = this.getConfigForTeamCount(teamCount);
    return config.batchSize;
  }
}