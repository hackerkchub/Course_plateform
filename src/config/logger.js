import pino from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV === 'development';

function getKolkataTimestamp() {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  return `,"time":"${now.toLocaleString('sv-SE', options).replace(' ', 'T')}+05:30"`;
}

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : (isDev ? 'debug' : 'info'),
  timestamp: getKolkataTimestamp,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'id_token',
      'token_hash',
      'access_token',
      'refresh_token',
      '*.password',
      '*.token',
    ],
    remove: true,
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export { logger };
export default logger;

