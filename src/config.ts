import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import toml from 'toml';
import { z } from 'zod';

const HOUR = 60 * 60 * 1000;

function parseConfig(contents: string) {
  try {
    return yaml.parse(contents);
  } catch (err) {
    try {
      return toml.parse(contents);
    } catch (err) {
      try {
        return JSON.parse(contents);
      } catch (err) {
        console.error('Config file must be in YAML, TOML, or JSON format');
        process.exit(1);
      }
    }
  }
}

export const configSchema = z.object({
  debug: z.boolean().default(false),
  
  proxy: z.object({
    hostname: z.string().default('localhost'),
    address: z.string().default('0.0.0.0'),
    port: z.number().int().default(80),
    ssl: z.boolean().default(false),
    keyFile: z.string().default('privkey.pem'),
    certFile: z.string().default('fullchain.pem'),
    target: z.string().url(),
    injectFile: z.string().default(path.join(__dirname, 'inject.js')),
    injectPath: z.string().startsWith('/').default('/__inject.js'),
  }).refine(
    (proxy) => !proxy.ssl || (proxy.keyFile && proxy.certFile),
    {
      message: 'keyFile and certFile are required when ssl is true',
      path: ['ssl'],
    }
  ),
  
  metabase: z.object({
    dashboardPath: z.string().default('/dashboard'),
    email: z.string(),
    password: z.string(),
    refresh: z.number().int().default(3600),
    theme: z.string().default('night'),
    fullscreen: z.boolean().default(true),
    sessionIdRefreshInterval: z.number().int().default(4 * HOUR),
  }),
});

export type Config = z.infer<typeof configSchema>;

type LoadConfigOptions = {
  defaults: Partial<Config>;
  configPath?: string;
};

export function loadConfig({
  configPath,
  defaults,
}: LoadConfigOptions) {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.join(process.cwd(), 'metabase-autologin-proxy.conf');

  const contents = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = parseConfig(contents);

  const config = configSchema.parse(parsed);

  return {
    ...defaults,
    ...config,
  };
}