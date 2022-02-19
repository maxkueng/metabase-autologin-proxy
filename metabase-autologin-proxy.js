#!/usr/bin/env node

const util = require('util');
const { setTimeout } = require('timers');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const { asyncMiddleware } = require('middleware-async');
const httpProxy = require('http-proxy');
const harmon = require('harmon');
const yargs = require('yargs');
const yaml = require('yaml');
const axios = require('axios');
const { AbortController } = require('node-abort-controller');

const setTimeoutPromise = util.promisify(setTimeout);

const HOUR = 60 * 60 * 1000;

const argv = yargs
  .option('config', {
    alias: 'c',
    describe: 'Path to config file in YAML or JSON',
    type: 'string',
    default: '.metabase-autologin-proxy.conf',
  })
  .argv;

const defaultConfig = {
  proxy: {
    hostname: 'localhost',
    address: '0.0.0.0',
    port: null,
    ssl: false,
    keyfile: 'privkey.pem',
    certfile: 'fullchain.pem',
    target: null,
    injectfile: path.join(__dirname, 'inject.js'),
    injectpath: '/__inject.js',
  },
  metabase: {
    dashboardpath: '/dashboard',
    email: null,
    password: null,
    refresh: 3600,
    theme: 'night',
    fullscreen: true,
    sessionIdRefreshInterval: 4 * HOUR,
  },
};

const metabase = {
  async checkSessionID(host, sessionID) {
    try {
      const res = await axios.request({
        method: 'GET',
        url: `${host}/api/user/current`,
        headers: {
          'X-Metabase-Session': sessionID,
        },
      });
      return true;
    } catch (err) {
      if (err.response.status === 401) {
        return false;
      }
      throw err;
    }
  },
  async getSessionID(host, credentials) {
    const {
      email: username,
      password,
    } = credentials;

    const res = await axios.request({
      method: 'POST',
      url: `${host}/api/session`,
      data: {
        username,
        password,
      },
    });

    return res.data.id;
  },
};

function isFile(filePath) {
  try {
    const stat = fs.statSync(path.resolve(filePath));
    return stat.isFile();
  } catch (err) {
    return false;
  }
}

function checkConfig({ proxy, metabase }) {
  if (!proxy) throw new Error('Missing proxy configuration');
  if (!proxy.target) throw new Error('Missing proxy.target configuration');
  if (!proxy.target.startsWith('https://')) throw new Error('proxy.target must start with https://');
  if (!isFile(proxy.injectfile)) throw new Error(`proxy.injectfile not found at '${proxy.injectfile}'`);

  if (proxy.ssl) {
    if (!isFile(proxy.keyfile)) throw new Error(`proxy.keyfile not found at '${proxy.keyfile}'`);
    if (!isFile(proxy.certfile)) throw new Error(`proxy.certfile not found at '${proxy.certfile}'`);
  }

  if (!metabase) throw new Error('Missing metabase configuration');
  if (!metabase.email) throw new Error('Missing metabase.email configuration');
  if (!metabase.password) throw new Error('Missing metabase.password configuration');
}

function getConfig() {
  const configPath = path.resolve(argv.config);
  try {
    const stat = fs.statSync(configPath);
    if (!stat.isFile()) {
      throw new Error(`Config path is not a file`);
    }
  } catch (err) {
    console.error(`Config file does not exist at '${configPath}'`);
    process.exit(1);
  }

  const contents = fs.readFileSync(configPath, 'utf-8');

  let values;
  try {
    values = yaml.parse(contents);
  } catch (err) {
    try {
      values = JSON.parse(contents);
    } catch (err) {
      console.error('Config file must be in YAML or JSON format');
      process.exit(1);
    }
  }

  const config = {
    proxy: {
      ...defaultConfig.proxy,
      ...(values.proxy || {}),
    },
    metabase: {
      ...defaultConfig.metabase,
      ...(values.metabase || {}),
    },
  };

  try {
    checkConfig(config);
  } catch (err) {
    console.error(`Config error: ${err.message}`)
    process.exit(1);
  }

  return config;
}

function getPort(config) {
  if (config.proxy.port) {
    return config.proxy.port;
  }
  if (config.proxy.ssl) {
    return 443;
  }
  return 80;
}

function createServer(config, requestListener) {
  if (config.proxy.ssl) {
    const keyfilePath = path.resolve(config.proxy.keyfile);
    const certfilePath = path.resolve(config.proxy.certfile);

    return https.createServer({
      key: fs.readFileSync(keyfilePath, 'utf-8'),
      cert: fs.readFileSync(certfilePath, 'utf-8'),
    }, requestListener);
  }

  return http.createServer(requestListener);
}

async function start() {
  const config = getConfig();
  const app = express();
  const injectScript = fs.readFileSync(path.resolve(config.proxy.injectfile), 'utf-8');
  const state = {
    isExiting: false,
    sleeps: [],
    sessionID: null,
    sessionIDLastUpdate: 0,
    sessionIDLastCheck: 0,
  };

  const sleep = async (t = 1000) => {
    const ac = new AbortController();
    state.sleeps.push(ac);
    try {
      await setTimeoutPromise(t, null, { signal: ac.signal });
      state.sleeps = state.sleeps.filter((s) => s !== ac);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('sleep aborted');
        state.sleeps = state.sleeps.filter((s) => s !== ac);
        return;
      }
      throw err;
    }
  };
  
  const abortSleeps = () => {
    const abortControllers = [...state.sleeps];
    state.sleeps = [];
    abortControllers.forEach((ac) => {
      ac.abort();
    });
  };
  
  const checkSessionID = () => {
    state.sessionIDLastCheck = new Date().getTime();
    return metabase.checkSessionID(config.proxy.target, state.sessionID);
  };
  
  const getSessionID = () => {
    return metabase.getSessionID(config.proxy.target, {
      email: config.metabase.email,
      password: config.metabase.password,
    });
  };
  
  const softCheckSessionID = async () => {
    const checkDelta = new Date().getTime() - state.sessionIDLastCheck;
    if (checkDelta < 30000) {
      return true;
    }
    return checkSessionID();
  };
  
  const updateSessionID = async () => {
    state.sessionIDLastUpdate = new Date().getTime();
    state.sessionIDLastCheck = new Date().getTime();
    const id = await getSessionID();
    state.sessionID = id;
    return id;
  };
  
  const updateSessionIDIfExpired = async () => {
    const isSessionValid = await metabase.checkSessionID(config.proxy.target, state.sessionID);
    if (!isSessionValid) {
      await updateSessionID();
    }
  };
  
  const softUpdateSessionIDIfExpired = async () => {
    const isSessionValid = await softCheckSessionID(config.proxy.target, state.sessionID);
    if (!isSessionValid) {
      await updateSessionID();
    }
  };
  
  const updateSessionIDLoop = async () => {
    while (!state.isExiting) {
      try {
        await updateSessionID();
      } catch (err) {
        console.error(err);
      }
      try {
        await sleep(config.metabase.sessionIdRefreshInterval);
      } catch (err) {
        if (err.name === 'AbortError') {
          break;
        }
        throw err;
      }
    }
  };
  
  updateSessionIDLoop();

  const injectConfig = `;(function() { window.___config = ${JSON.stringify(config.metabase, null, '  ')}; })();`;

  const urlObj = new URL(config.proxy.target);
  
  const proxy = httpProxy.createProxyServer({
    target: config.proxy.target,
    changeOrigin: true,
    cookieDomainRewrite: {
      [urlObj.hostname]: config.proxy.hostname,
    },
  });

  proxy.on('error', (err, req, res) => {
    console.error(err);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });
    res.end('Something went wrong.');
  });

  proxy.on('proxyReq', (proxyReq, req, res, options) => {
    proxyReq.setHeader('X-Metabase-Session', state.sessionID);
  });

  const selects = [
    {
      query: 'head',
      func: (node) => {
        const inject = `<script src="${config.proxy.injectpath}"></script>`;
        const rs = node.createReadStream();
        const ws = node.createWriteStream({ outer: false });
        rs.pipe(ws, { end: false });
        rs.on('end', () => {
          ws.end(inject);
        });
      },
    },
  ];

  app.get(config.proxy.injectpath, (req, res) => {
    res.set('content-type', 'text/javascript');
    res.send([injectConfig, injectScript].join('\n'));
  });
  
  app.use(asyncMiddleware(async (req, res, next) => {
    try {
      await softUpdateSessionIDIfExpired();
    } catch (err) {
      console.error(err);
    } finally {
      next();
    }
  }));

  app.use(harmon([], selects, true));

  app.use((req, res) => {
    proxy.web(req, res);
  });

  const server = createServer(config, app);

  const port = getPort(config);
  server.listen(port, config.proxy.address, () => {
    console.info(`Listening at ${config.proxy.ssl ? 'https:' : 'http://'}//${config.proxy.address}:${port}`);
    const publicURL = [
      config.proxy.ssl ? 'https://' : 'http://',
      config.proxy.hostname,
      config.proxy.ssl && port !== 443 ? `:${port}` : '',
      !config.proxy.ssl && port !== 80 ? `:${port}` : '',
      '/',
    ].join('');
    console.info(`Open ${publicURL}`);
  });

  const shutdown = (signal, value) => {
    state.isExiting = true;
    abortSleeps();
    server.close(() => {
      proxy.close(() => {
        console.log(`Server stopped by ${signal} with value ${value}`);
        process.exit(128 + value);
      });
    });
  };

  const signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15,
  };

  Object.entries(signals).forEach(([signal, value]) => {
    process.on(signal, () => {
      console.log(`process received a ${signal} signal`);
      shutdown(signal, value);
    });
  });
}

start();
