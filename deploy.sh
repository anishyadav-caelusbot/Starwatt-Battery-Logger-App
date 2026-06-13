#!/bin/bash

# Exit on error
set -e

echo "=========================================================="
echo "   Starwatt Battery Logger App - Single-Command Deploy"
echo "=========================================================="

# Check if Docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: Docker is not installed. Please install Docker first." >&2
  exit 1
fi

# Check if docker-compose or docker compose is available
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "Error: Neither 'docker compose' nor 'docker-compose' was found on your system." >&2
  exit 1
fi

# Copy .env configuration if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env configuration file from .env.example..."
  cp .env.example .env
  echo "WARNING: Default environment variables applied. Please edit your '.env' file to add your real InfluxDB tokens."
fi

# Pull, build, and launch container stack
echo "Orchestrating container build and activation..."
$DOCKER_COMPOSE_CMD up --build -d

echo "=========================================================="
echo "Deployment initiated successfully!"
echo "----------------------------------------------------------"
echo "  Frontend Dashboard : http://localhost"
echo "  Backend API Server : http://127.0.0.1:5000 (Local Loopback)"
echo "=========================================================="
