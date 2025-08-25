import swaggerJSDoc from "swagger-jsdoc";
import {env} from './env'
import { openApiSchemas } from '../docs/openapi-schemas';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BGMI Tournament API',
      version: '1.0.0',
      description: 'API for managing BGMI tournaments, matches, groups, and team registrations',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: openApiSchemas,
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // paths to files containing OpenAPI definitions
};

export const specs = swaggerJSDoc(options);