#!/bin/bash
set -e

cd /opt/centricore
git pull
docker compose -f docker-compose.prod.yml build app frontend
docker compose -f docker-compose.prod.yml up -d app frontend
