#!/usr/bin/env bash

docker run \
  --rm -it \
  -v $PWD/test.conf:/etc/metagate.conf:ro \
  -v $PWD/selfsigned.key:/opt/privkey.pem:ro \
  -v $PWD/selfsigned.crt:/opt/fullchain.pem:ro \
  -p 8011:443 \
  metagate
