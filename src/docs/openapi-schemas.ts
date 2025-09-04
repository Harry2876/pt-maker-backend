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
  }
};
