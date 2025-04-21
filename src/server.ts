import util from 'util';
import { setTimeout } from 'timers';
import path from 'path';
import fs from 'fs';
import type { Socket } from 'net';
import http, { ServerResponse } from 'http';
import type { RequestListener } from 'http';
import https from 'https';
import express from'express';
import { asyncMiddleware } from 'middleware-async';
import httpProxy from 'http-proxy';
import harmon from 'harmon';
import type { Select } from 'harmon';
import type { Logger } from 'pino';

import type { Config } from "./config";
import * as metabase from './metabase';

const setTimeoutPromise = util.promisify(setTimeout);

function getPort(config: Config) {
  if (config.proxy.port) {
    return config.proxy.port;
  }
  if (config.proxy.ssl) {
    return 443;
  }
  return 80;
}

function createServer(config: Config, requestListener: RequestListener) {
  if (config.proxy.ssl) {
    const keyfilePath = path.resolve(config.proxy.keyFile);
    const certfilePath = path.resolve(config.proxy.certFile);

    return https.createServer({
      key: fs.readFileSync(keyfilePath, 'utf-8'),
      cert: fs.readFileSync(certfilePath, 'utf-8'),
    }, requestListener);
  }

  return http.createServer(requestListener);
}

type State = {
  isExiting: boolean;
  sleeps: { controller: AbortController, promise: Promise<null>}[];
  sessionId: string | null;
  sessionIdLastUpdate: number;
  sessionIdLastCheck: number;
};

export function startServer(config: Config, logger: Logger) {
  const app = express();
  const injectScript = fs.readFileSync(path.resolve(config.proxy.injectFile), 'utf-8');
  const state: State = {
    isExiting: false,
    sleeps: [],
    sessionId: null,
    sessionIdLastUpdate: 0,
    sessionIdLastCheck: 0,
  };

  const sleep = async (t = 1000) => {
    const ac = new AbortController();
    const promise = setTimeoutPromise(t, null, { signal: ac.signal });
  
    state.sleeps.push({ controller: ac, promise });
  
    try {
      await promise;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('sleep aborted');
      } else {
        throw err;
      }
    } finally {
      state.sleeps = state.sleeps.filter((s) => s.controller !== ac);
    }
  };
  
  const abortSleeps = async (doneCallback?: () => void) => {
    const current = [...state.sleeps];
    state.sleeps = [];
  
    current.forEach(({ controller }) => controller.abort());
  
    await Promise.allSettled(current.map(({ promise }) => promise));
  
    if (doneCallback) {
      doneCallback();
    }
  };
  
  const checkSessionId = () => {
    state.sessionIdLastCheck = new Date().getTime();
    return metabase.checkSessionId(config.proxy.target, state.sessionId);
  };
  
  const getSessionId = () => {
    return metabase.getSessionId(config.proxy.target, {
      email: config.metabase.email,
      password: config.metabase.password,
    });
  };
  
  const softCheckSessionId = async () => {
    const checkDelta = new Date().getTime() - state.sessionIdLastCheck;
    if (checkDelta < 30000) {
      return true;
    }
    return checkSessionId();
  };
  
  const updateSessionId = async () => {
    state.sessionIdLastUpdate = new Date().getTime();
    state.sessionIdLastCheck = new Date().getTime();
    const id = await getSessionId();
    state.sessionId = id;
    return id;
  };
  
  const softUpdateSessionIdIfExpired = async () => {
    const isSessionValid = await softCheckSessionId();
    if (!isSessionValid) {
      await updateSessionId();
    }
  };
  
  const updateSessionIdLoop = async () => {
    while (!state.isExiting) {
      try {
        await updateSessionId();
      } catch (err) {
        logger.error(err);
      }
      try {
        await sleep(config.metabase.sessionIdRefreshInterval);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          break;
        }
        throw err;
      }
    }
  };
  
  updateSessionIdLoop();

  const sanitizedMetabaseConfig = {
    ...config.metabase,
    email: '##########',
    password: '##########',
  };
  const injectConfig = `;(function() { window.___config = ${JSON.stringify(sanitizedMetabaseConfig, null, '  ')}; })();`;

  const urlObj = new URL(config.proxy.target);
  
  const proxy = httpProxy.createProxyServer({
    target: config.proxy.target,
    changeOrigin: true,
    cookieDomainRewrite: {
      [urlObj.hostname]: config.proxy.hostname,
    },
  });

  proxy.on('error', (err, _req, res) => {
    logger.error('Proxy error:', err);
  
    if (res instanceof ServerResponse) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Something went wrong.');
    } else {
      logger.error('Response is not a ServerResponse, skipping writeHead');
    }
  });

  proxy.on('proxyReq', (proxyReq, req, res, options) => {
    if (state.sessionId) {
      proxyReq.setHeader('X-Metabase-Session', state.sessionId);
    }
  });

  const selects: Select[] = [
    {
      query: 'head',
      func: (node) => {
        const inject = `<script src="${config.proxy.injectPath}"></script>`;
        const rs = node.createReadStream();
        const ws = node.createWriteStream({ outer: false });
        rs.pipe(ws, { end: false });
        rs.on('end', () => {
          ws.end(inject);
        });
      },
    },
  ];

  app.get(config.proxy.injectPath, (req, res) => {
    res.set('content-type', 'text/javascript');
    res.send([
      ';window.exports = {};',
      injectConfig,
      injectScript
    ].join('\n'));
  });
  
  app.use(asyncMiddleware(async (req, res, next) => {
    try {
      await softUpdateSessionIdIfExpired();
    } catch (err) {
      logger.error(err);
    } finally {
      next();
    }
  }));

  app.use(harmon([], selects, true));

  app.use((req, res) => {
    proxy.web(req, res);
  });

  const server = createServer(config, app);
  
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const port = getPort(config);
  server.listen(port, config.proxy.address, () => {
    logger.info(`Listening at ${config.proxy.ssl ? 'https:' : 'http:'}//${config.proxy.address}:${port}`);
    const publicURL = [
      config.proxy.ssl ? 'https://' : 'http://',
      config.proxy.hostname,
      config.proxy.ssl && port !== 443 ? `:${port}` : '',
      !config.proxy.ssl && port !== 80 ? `:${port}` : '',
      '/',
    ].join('');
    logger.info(`Open ${publicURL}`);
  });
  
  return (callback: () => void) => {
    state.isExiting = true;

    logger.info('Aborting sleeps');
    abortSleeps(() => {
      logger.info('Closing server');
      server.close(() => {
        logger.info('Destroying sockets');
        for (const socket of sockets) {
          socket.destroy();
        }
        logger.info('Closing proxy');
        proxy.close(callback);
      });
    });
  };
}
