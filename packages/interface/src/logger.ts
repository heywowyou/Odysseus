import pino from 'pino';

/** Single shared logger for the interface package's HTTP layer and queue.
 *  Before this, the only place a server-side exception surfaced at all was
 *  the raw message returned to the HTTP caller - this gives every error a
 *  server-side trail. */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
});
