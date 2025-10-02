import { datadogMetrics } from '../config/datadog';
import logger from '../utils/logger';

export class ProductionMetricsService {
    // Business Metrics
    static trackTournamentMetrics(action: string, tournamentId: string, data: any = {}) {
        datadogMetrics.increment(`tournament.${action}`, 1, {
            tournament_id: tournamentId,
            ...data
        });
    }

    static trackPlayerActivity(action: string, playerId: string, tournamentId?: string) {
        datadogMetrics.increment(`player.${action}`, 1, {
            player_id: playerId,
            tournament_id: tournamentId || 'unknown'
        });
    }

    static trackMatchPerformance(matchId: string, duration: number, playerCount: number) {
        datadogMetrics.histogram('match.duration', duration, { match_id: matchId });
        datadogMetrics.gauge('match.players', playerCount, { match_id: matchId });
        datadogMetrics.increment('match.completed', 1, { match_id: matchId });
    }

    // API Performance
    static trackAPIPerformance(method: string, endpoint: string, statusCode: number, responseTime: number) {
        datadogMetrics.increment('api.requests', 1, {
            method,
            endpoint: endpoint.replace(/\/\d+/g, '/:id'), // Normalize dynamic IDs
            status_code: statusCode.toString(),
            status_class: `${Math.floor(statusCode / 100)}xx`
        });
        
        datadogMetrics.histogram('api.response_time', responseTime, {
            method,
            endpoint: endpoint.replace(/\/\d+/g, '/:id')
        });
    }

    // Error Tracking
    static trackError(errorType: string, errorMessage: string, context: any = {}) {
        datadogMetrics.increment('errors.total', 1, {
            error_type: errorType,
            environment: process.env.DD_ENV || 'production'
        });
        
        logger.error('Production error tracked', {
            errorType,
            errorMessage,
            context,
            timestamp: new Date().toISOString()
        });
    }

    // Database Performance
    static trackDatabaseOperation(operation: string, table: string, duration: number, success: boolean) {
        datadogMetrics.histogram('database.query_time', duration, {
            operation,
            table,
            success: success.toString()
        });
        
        datadogMetrics.increment('database.queries', 1, {
            operation,
            table,
            success: success.toString()
        });
    }

    // Gaming Specific Metrics
    static trackGameplayMetrics(matchId: string, metrics: {
        kills?: number;
        position?: number;
        points?: number;
        teamId?: string;
    }) {
        if (metrics.kills !== undefined) {
            datadogMetrics.histogram('gameplay.kills', metrics.kills, {
                match_id: matchId,
                team_id: metrics.teamId || 'unknown'
            });
        }
        
        if (metrics.position !== undefined) {
            datadogMetrics.histogram('gameplay.position', metrics.position, {
                match_id: matchId,
                team_id: metrics.teamId || 'unknown'
            });
        }
        
        if (metrics.points !== undefined) {
            datadogMetrics.histogram('gameplay.points', metrics.points, {
                match_id: matchId,
                team_id: metrics.teamId || 'unknown'
            });
        }
    }

    // System Health
    static trackSystemHealth() {
        const memUsage = process.memoryUsage();
        
        datadogMetrics.gauge('system.memory.rss', memUsage.rss);
        datadogMetrics.gauge('system.memory.heap_used', memUsage.heapUsed);
        datadogMetrics.gauge('system.memory.heap_total', memUsage.heapTotal);
        datadogMetrics.gauge('system.uptime', process.uptime());
    }
}

// Auto-track system health every 30 seconds
if (process.env.ENABLE_DATADOG === 'true') {
    setInterval(() => {
        ProductionMetricsService.trackSystemHealth();
    }, 30000);
}