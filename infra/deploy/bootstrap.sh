#!/usr/bin/env bash
# Installs Docker Engine + compose plugin on an Ubuntu 24.04 Lightsail node.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo ">> installing docker..."
  curl -fsSL https://get.docker.com | sudo sh
else
  echo ">> docker already present"
fi

sudo usermod -aG docker ubuntu || true
sudo systemctl enable --now docker

echo ">> versions:"
docker --version
docker compose version
echo ">> bootstrap OK on $(. /etc/os-release; echo "$PRETTY_NAME") / $(nproc) vCPU / $(free -m | awk '/Mem:/{print $2}') MB"
