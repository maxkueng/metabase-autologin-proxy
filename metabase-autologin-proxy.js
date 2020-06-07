#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const httpProxy = require('http-proxy');
const harmon = require('harmon');
const yargs = require('yargs');
const yaml = require('yaml');

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

function start() {
  const config = getConfig();
  const app = express();
  const injectScript = fs.readFileSync(path.resolve(config.proxy.injectfile), 'utf-8');

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
}

start();
