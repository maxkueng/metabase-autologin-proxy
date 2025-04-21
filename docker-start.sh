#!/usr/bin/env bash

docker run \
  --rm -it \
  -v $PWD/test.conf:/etc/metabase-autologin-proxy.conf:ro \
  -v $PWD/selfsigned.key:/opt/privkey.pem:ro \
  -v $PWD/selfsigned.crt:/opt/fullchain.pem:ro \
  -p 8011:443 \
  metabase-autologin-proxy
