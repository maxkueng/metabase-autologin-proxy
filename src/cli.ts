#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import pino from 'pino';
import pinoPretty from 'pino-pretty';

import { loadConfig } from './config';
import { startServer } from './server';

const argv = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to config file',
  })
  .option('debug', {
    type: 'boolean',
    default: false,
    description: 'Enable debug logging',
  })
  .option('pretty-logs', {
    type: 'boolean',
    default: true,
    description: 'Pretty log output',
  })
  .parseSync();

const configPath = argv.config;
const config = loadConfig({
  configPath,
  defaults: {
    debug: argv.debug,
  },
});

const logger = argv.prettyLogs ? (
  pino(pinoPretty({
    colorize: false,
  }))
) : (
  pino()
);

const stopServer = startServer(config, logger);

const shutdown = (signal: string, value: number) => {
  stopServer(() => {
    logger.info(`Server stopped by ${signal} with value ${value}`);
    process.exit(128 + value);
  });
};

const signals = {
  'SIGHUP': 1,
  'SIGINT': 2,
  'SIGTERM': 15,
};

Object.entries(signals).forEach(([signal, value]) => {
  process.on(signal, () => {
    logger.info(`Process received a ${signal} signal`);
    shutdown(signal, value);
  });
});