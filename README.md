# Metagate

This is a proxy for [Metabase](https://www.metabase.com/) that automatically
logs in and injects some JavaScript to automatically set the right theme and
refresh interval, and make it enter fullscreen mode.

It's intended for dashboards that run on standalone screens where you don't
want to plug in a keyboard to log in every time the session expires.

## Usage

```sh
metagate --config <PATH_TO_CONFIG_FILE>
```

### Use with Docker

```sh
docker run \
  -v $PWD/myconfig.conf:/etc/metagate.conf:ro \
  -v $PWD/selfsigned.key:/opt/privkey.pem:ro \
  -v $PWD/selfsigned.crt:/opt/fullchain.pem:ro \
  -p 8011:443 \
  ghcr.io/maxkueng/metagate:latest
```

## Configuration

The default location for the config file is `./.metagate.conf`

```yaml
---
proxy:
  # Public-facing host name of the proxy.
  # Default: localhost
  hostname: localhost

  # Address of the interface to listen on.
  # Default: 0.0.0.0
  address: 0.0.0.0

  # Post to listen on.
  # Default: 443 if SSL is enabled, 80 if disabled
  port: 8011

  # Enable SSL.
  # Note: Unless this proxy is running behind another proxy that uses SSL, SSL
  # must be turned on because Metabase's cookies require a secure connection.
  # Default: false
  ssl: true

  # Path to SSL key.
  # Default: privkey.pem
  keyFile: privkey.pem

  # Path to SSL certificate.
  # Default: fullchain.pem
  certFile: fullchain.pem

  # URL to your Metabase instance (must use https).
  # REQUIRED
  target: https://metabase.example.org

  # Provide custom auto-login script.
  # Default: ./inject.js
  injectFile: inject.js

  # Customize the pathname of the injected script.
  # Default: /__inject.js
  injectPath: /__inject.js

metabase:
  # Pathname of the Metabase dashboards
  # Default: /dashboard
  dashboardPath: /dashboard

  # Login email of the Metabase user
  # REQUIRED
  email: metabase.user@example.org

  # Password of the Metabase user
  # REQUIRED
  password: secret

  # Refresh interval for the queries.
  # Default: 3600 (1 hour)
  refresh: 3600

  # Metabase theme name.
  # Default: night (dark)
  theme: night

  # Enter fullscreen mode.
  # Default: true
  fullscreen: true

  # The interval at which to forcefully obtain a new session ID
  # Default: 3600000 (4 hours)
  sessionIdRefreshInterval: 3600000
```

## License

Copyright (c) 2020 Max Kueng

MIT License

