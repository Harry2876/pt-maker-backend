

export interface PointsBreakdown {
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    calculation: string;
}

export interface ScoringConfig {
    positionPointsConfig: number[];  // Array of 10 values for ranks 1-10
    killPointsValue: number;         // Points per kill
}

export class PointsCalculator {
    private static readonly DEFAULT_POSITION_POINTS = [20, 15, 12, 10, 8, 6, 4, 2, 1, 0];
    private static readonly DEFAULT_KILL_POINTS = 1;

    /**
     * Calculate total points for a team using custom scoring config
     * @param position Team's finishing position (1-25)
     * @param kills Total team kills
     * @param config Custom scoring configuration (optional, uses BGMI default if not provided)
     * @returns PointsBreakdown with position, kill, and total points
     */
    static calculatePoints(
        position: number,
        kills: number,
        config?: ScoringConfig
    ): PointsBreakdown {
        if (position < 1 || position > 25) {
            throw new Error('Position must be between 1 and 25');
        }

        if (kills < 0 || kills > 99) {
            throw new Error('Kills must be between 0 and 99');
        }

        // Use provided config or fall back to defaults
        const positionPointsConfig = config?.positionPointsConfig || this.DEFAULT_POSITION_POINTS;
        const killPointsValue = config?.killPointsValue ?? this.DEFAULT_KILL_POINTS;

        const positionPoints = this.getPositionPoints(position, positionPointsConfig);
        const killPoints = kills * killPointsValue;

        return {
            positionPoints,
            killPoints,
            totalPoints: positionPoints + killPoints,
            calculation: `Position #${position} (${positionPoints}pts) + ${kills} kills × ${killPointsValue} (${killPoints}pts) = ${positionPoints + killPoints}pts`
        };
    }

    /**
     * Get position points for a given rank using custom config
     * @param position Team's finishing position (1-25)
     * @param positionPointsConfig Array of 10 position points
     * @returns Position points
     */
    static getPositionPoints(position: number, positionPointsConfig: number[]): number {
        if (position < 1 || position > 25) {
            throw new Error('Position must be between 1 and 25');
        }

        // Ranks 1-10 use the config array
        if (position <= 10) {
            return positionPointsConfig[position - 1];
        }

        // Ranks 11-25 get 0 points
        return 0;
    }

    /**
     * Calculate kill points based on custom kill value
     * @param kills Number of kills
     * @param killPointsValue Points per kill
     * @returns Kill points
     */
    static getKillPoints(kills: number, killPointsValue: number = 1): number {
        if (kills < 0 || kills > 99) {
            throw new Error('Kills must be between 0 and 99');
        }
        return kills * killPointsValue;
    }

    /**
     * Get default BGMI scoring config
     * @returns Default scoring configuration
     */
    static getDefaultBGMIConfig(): ScoringConfig {
        return {
            positionPointsConfig: this.DEFAULT_POSITION_POINTS,
            killPointsValue: this.DEFAULT_KILL_POINTS
        };
    }

    /**
     * Get popular scoring presets
     * @returns Array of popular scoring configurations
     */
    static getPopularPresets(): Array<{ name: string; config: ScoringConfig; description: string }> {
        return [
            {
                name: 'Standard BGMI',
                description: 'Official BGMI tournament scoring',
                config: {
                    positionPointsConfig: [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                    killPointsValue: 1
                }
            },
            {
                name: 'PMCO Style',
                description: 'PUBG Mobile Club Open scoring',
                config: {
                    positionPointsConfig: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0],
                    killPointsValue: 2
                }
            },
            {
                name: 'Aggressive',
                description: 'Rewards aggressive playstyle with higher kill points',
                config: {
                    positionPointsConfig: [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                    killPointsValue: 3
                }
            },
            {
                name: 'Placement Focus',
                description: 'Emphasizes placement over kills',
                config: {
                    positionPointsConfig: [30, 25, 20, 15, 12, 10, 8, 6, 4, 2],
                    killPointsValue: 1
                }
            }
        ];
    }

    /**
     * Calculate total points for multiple teams (for points table)
     * @param teams Array of team results
     * @param config Scoring configuration
     * @returns Array of teams with calculated points, sorted by total points
     */
    static calculateBulkPoints(
        teams: Array<{ teamName: string; position: number; kills: number }>,
        config?: ScoringConfig
    ): Array<{ 
        teamName: string; 
        position: number; 
        kills: number; 
        positionPoints: number; 
        killPoints: number; 
        totalPoints: number;
    }> {
        return teams
            .map(team => {
                const breakdown = this.calculatePoints(team.position, team.kills, config);
                return {
                    teamName: team.teamName,
                    position: team.position,
                    kills: team.kills,
                    positionPoints: breakdown.positionPoints,
                    killPoints: breakdown.killPoints,
                    totalPoints: breakdown.totalPoints
                };
            })
            .sort((a, b) => b.totalPoints - a.totalPoints); // Sort by highest points first
    }

    /**
     * Validate scoring configuration
     * @param config Scoring configuration to validate
     * @returns Validation result with errors if any
     */
    static validateScoringConfig(config: ScoringConfig): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!config.positionPointsConfig || config.positionPointsConfig.length !== 10) {
            errors.push('Position points config must have exactly 10 values');
        }

        if (config.positionPointsConfig) {
            config.positionPointsConfig.forEach((points, index) => {
                if (points < 0 || points > 100) {
                    errors.push(`Position ${index + 1} points must be between 0 and 100`);
                }
            });
        }

        if (config.killPointsValue < 0 || config.killPointsValue > 10) {
            errors.push('Kill points value must be between 0 and 10');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}