export const openApiSchemas = {
  // ===== COMMON SCHEMAS =====
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Error message' },
      error: { type: 'string', example: 'Detailed error' }
    }
  },

  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Error message' },
      error: { type: 'string', example: 'Detailed error description' },
      timestamp: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00Z' },
      path: { type: 'string', example: '/api/v1/endpoint' }
    }
  },

  // ===== STANDARD HTTP ERROR RESPONSES =====
  ValidationErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Validation failed' },
      error: { type: 'string', example: 'Request validation failed' },
      details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', example: 'phoneNumber' },
            message: { type: 'string', example: 'Phone number is required' }
          }
        }
      },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/auth/send-otp' }
    }
  },

  UnauthorizedErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Authentication required' },
      error: { type: 'string', example: 'Missing or invalid authentication token' },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/tournaments' }
    }
  },

  ForbiddenErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Access denied' },
      error: { type: 'string', example: 'Insufficient permissions to access this resource' },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/admin/users' }
    }
  },

  NotFoundErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Resource not found' },
      error: { type: 'string', example: 'The requested resource does not exist' },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/tournaments/123' }
    }
  },

  RateLimitErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Rate limit exceeded' },
      error: { type: 'string', example: 'Too many requests, please try again later' },
      retryAfter: { type: 'integer', example: 60, description: 'Seconds to wait before retrying' },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/auth/send-otp' }
    }
  },

  ServerErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Internal server error' },
      error: { type: 'string', example: 'An unexpected error occurred' },
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string', example: '/api/v1/tournaments' }
    }
  },

  Success: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Success message' },
      data: { type: 'object' }
    }
  },

  // ===== AUTH SCHEMAS =====
  SendOtpRequest: {
    type: 'object',
    required: ['phoneNumber'],
    properties: {
      phoneNumber: {
        type: 'string',
        pattern: '^\\+?[1-9]\\d{1,14}$',
        minLength: 10,
        maxLength: 15,
        example: '+919876543210'
      },
      type: {
        type: 'string',
        enum: ['registration', 'login'],
        default: 'registration'
      }
    }
  },

  VerifyOtpRequest: {
    type: 'object',
    required: ['phoneNumber', 'otp'],
    properties: {
      phoneNumber: {
        type: 'string',
        pattern: '^\\+?[1-9]\\d{1,14}$',
        example: '+919876543210'
      },
      otp: {
        type: 'string',
        pattern: '^\\d{6}$',
        minLength: 6,
        maxLength: 6,
        example: '123456'
      },
      username: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_]+$',
        minLength: 3,
        maxLength: 30,
        example: 'testuser123'
      },
      fullName: {
        type: 'string',
        minLength: 2,
        maxLength: 100,
        example: 'Test User'
      },
      organization: {
        type: 'string',
        maxLength: 100,
        example: 'Test Organization'
      },
      password: {
        type: 'string',
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]',
        minLength: 8,
        maxLength: 128,
        example: 'Password123!'
      }
    }
  },

  RefreshTokenRequest: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: {
        type: 'string',
        minLength: 1,
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      }
    }
  },

  // ===== TOURNAMENT SCHEMAS =====
  CreateTournamentRequest: {
    type: 'object',
    required: ['name', 'game'],
    properties: {
      name: {
        type: 'string',
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        minLength: 3,
        maxLength: 100,
        example: 'BGMI Championship 2024'
      },
      game: {
        type: 'string',
        minLength: 2,
        maxLength: 50,
        example: 'BGMI'
      },
      tournamentType: {
        type: 'string',
        enum: ['TOURNAMENT'],
        example: 'TOURNAMENT'
      },
      maxTeams: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        example: 64
      },
      entryFee: {
        type: 'number',
        minimum: 0,
        example: 100.00
      },
      prizePool: {
        type: 'number',
        minimum: 0,
        example: 50000.00
      },
      status: {
        type: 'string',
        enum: ['UPCOMING', 'ONGOING', 'COMPLETED'],
        example: 'UPCOMING'
      }
    }
  },

  UpdateTournamentRequest: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 3,
        maxLength: 100,
        example: 'Updated Tournament Name'
      },
      game: {
        type: 'string',
        minLength: 2,
        maxLength: 50,
        example: 'BGMI'
      },
      status: {
        type: 'string',
        enum: ['UPCOMING', 'ONGOING', 'COMPLETED'],
        example: 'ONGOING'
      }
    }
  },

  // ===== MATCH SCHEMAS =====
  CreateMatchRequest: {
    type: 'object',
    required: ['matchNumber'],
    properties: {
      matchNumber: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        example: 1
      },
      matchDate: {
        type: 'string',
        format: 'date-time',
        example: '2024-12-25T10:00:00Z'
      },
      groupId: {
        type: 'string',
        format: 'uuid',
        example: '123e4567-e89b-12d3-a456-426614174000'
      }
    }
  },

  UpdateMatchRequest: {
    type: 'object',
    properties: {
      matchNumber: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        example: 2
      },
      matchDate: {
        type: 'string',
        format: 'date-time',
        example: '2024-12-25T11:00:00Z'
      },
      status: {
        type: 'string',
        enum: ['PENDING_PROCESSING', 'PROCESSED', 'ERROR'],
        example: 'PROCESSED'
      },
      processedData: {
        type: 'object',
        example: { results: 'match data' }
      }
    }
  },

  // ===== GROUP SCHEMAS =====
  CreateGroupRequest: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        minLength: 2,
        maxLength: 50,
        example: 'Group A'
      },
      maxTeams: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        example: 20
      },
      qualificationSpots: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        example: 5
      }
    }
  },

  UpdateGroupRequest: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        minLength: 2,
        maxLength: 50,
        example: 'Updated Group A'
      },
      maxTeams: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        example: 25
      },
      qualificationSpots: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        example: 8
      }
    }
  },

  // ===== TEAM REGISTRATION SCHEMAS =====
  CreateTeamRegistrationRequest: {
    type: 'object',
    required: ['teamName', 'contactInfo'],
    properties: {
      teamName: {
        type: 'string',
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        minLength: 2,
        maxLength: 50,
        example: 'Team Alpha'
      },
      contactInfo: {
        type: 'string',
        minLength: 5,
        maxLength: 100,
        example: 'captain@teamalpha.com'
      },
      groupId: {
        type: 'string',
        format: 'uuid',
        example: '123e4567-e89b-12d3-a456-426614174000'
      }
    }
  },

  UpdateTeamRegistrationRequest: {
    type: 'object',
    properties: {
      teamName: {
        type: 'string',
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        minLength: 2,
        maxLength: 50,
        example: 'Updated Team Alpha'
      },
      contactInfo: {
        type: 'string',
        minLength: 5,
        maxLength: 100,
        example: 'newcaptain@teamalpha.com'
      },
      registrationStatus: {
        type: 'string',
        enum: ['PENDING', 'CONFIRMED', 'QUALIFIED', 'ELIMINATED'],
        example: 'CONFIRMED'
      },
      finalPosition: {
        type: 'integer',
        minimum: 1,
        example: 5
      },
      totalPoints: {
        type: 'integer',
        minimum: 0,
        example: 150
      },
      groupId: {
        type: 'string',
        format: 'uuid',
        example: '123e4567-e89b-12d3-a456-426614174000'
      }
    }
  },
    // ===== LEADERBOARD SCHEMAS =====
  LeaderboardEntry: {
    type: 'object',
    properties: {
      teamRegistrationId: { type: 'string', example: 'clm8k9j0x0000xyz123abc456' },
      teamName: { type: 'string', example: 'Team Phoenix' },
      totalMatches: { type: 'integer', minimum: 0, example: 15 },
      totalKills: { type: 'integer', minimum: 0, example: 87 },
      totalPoints: { type: 'integer', minimum: 0, example: 245 },
      averageKills: { type: 'number', format: 'float', example: 5.8 },
      averagePosition: { type: 'number', format: 'float', example: 8.3 },
      bestPosition: { type: 'integer', minimum: 1, example: 2 },
      wins: { type: 'integer', minimum: 0, example: 3 },
      top5Finishes: { type: 'integer', minimum: 0, example: 8 },
      top10Finishes: { type: 'integer', minimum: 0, example: 12 },
      winRate: { type: 'number', format: 'float', example: 20.5 },
      rank: { type: 'integer', minimum: 1, example: 4 },
      previousRank: { type: 'integer', minimum: 1, example: 6 },
      rankChange: { 
        type: 'string', 
        enum: ['UP', 'DOWN', 'SAME'],
        example: 'UP'
      },
      lastUpdated: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
    },
    required: ['teamRegistrationId', 'teamName', 'totalMatches', 'totalKills', 'totalPoints', 'rank']
  },

  TournamentLeaderboard: {
    type: 'object',
    properties: {
      tournamentId: { type: 'string', example: 'clm8k9j0x0000xyz123abc456' },
      tournamentName: { type: 'string', example: 'BGMI Pro Championship 2024' },
      totalTeams: { type: 'integer', minimum: 0, example: 48 },
      totalMatches: { type: 'integer', minimum: 0, example: 6 },
      lastUpdated: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
      entries: {
        type: 'array',
        items: { $ref: '#/components/schemas/LeaderboardEntry' }
      },
      generatedAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
    },
    required: ['tournamentId', 'tournamentName', 'totalTeams', 'totalMatches', 'entries', 'generatedAt']
  },

  GroupLeaderboard: {
    type: 'object',
    properties: {
      groupId: { type: 'string', example: 'clm8k9j0x0000xyz123abc456' },
      groupName: { type: 'string', example: 'Group A' },
      tournamentId: { type: 'string', example: 'clm8k9j0x0000xyz123abc456' },
      totalTeams: { type: 'integer', minimum: 0, example: 16 },
      totalMatches: { type: 'integer', minimum: 0, example: 6 },
      lastUpdated: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
      entries: {
        type: 'array',
        items: { $ref: '#/components/schemas/LeaderboardEntry' }
      },
      generatedAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
    },
    required: ['groupId', 'groupName', 'tournamentId', 'totalTeams', 'totalMatches', 'entries', 'generatedAt']
  }
};
