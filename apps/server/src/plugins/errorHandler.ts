import type { FastifyInstance } from 'fastify';
import { AppError } from '../utils/errors.js';

export async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send(error.toJSON());
      return;
    }

    app.log.error(error);
    reply.status(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      recoverable: false,
    });
  });
}
