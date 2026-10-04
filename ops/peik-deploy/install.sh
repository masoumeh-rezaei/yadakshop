#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]] || exit 77
stage=$(cd -- "$(dirname -- "$0")" && pwd)
install -d -m 755 /opt/peik-deploy /opt/peik-deploy/releases /usr/local/libexec/peik-deploy
install -d -m 700 /var/lib/peik-deploy
if ! id peikdeploy >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/peik-upload --shell /bin/bash peikdeploy
fi
install -d -m 750 -o root -g peikdeploy /var/lib/peik-upload /var/lib/peik-upload/.ssh
for file in deploy.py publish.py check-runtime.cjs candidate.cjs receive.py bootstrap.py; do
  install -m 755 -o root -g root "$stage/$file" "/usr/local/libexec/peik-deploy/$file"
done
ln -sfn /usr/local/libexec/peik-deploy/deploy.py /usr/local/bin/peik-deploy
if [[ ! -x /opt/peik-deploy/node/bin/node ]]; then
  runtime=$(mktemp /var/lib/peik-deploy/node-runtime.XXXXXX.tar.xz)
  trap 'rm -f -- "$runtime"' EXIT
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 240 --retry 2 \
    -o "$runtime" https://nodejs.org/download/release/v22.14.0/node-v22.14.0-linux-x64.tar.xz
  echo "69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec  $runtime" | sha256sum --check --status
  tar -xJf "$runtime" -C /opt/peik-deploy
  chown -R root:root /opt/peik-deploy/node-v22.14.0-linux-x64
  ln -s node-v22.14.0-linux-x64 /opt/peik-deploy/node
fi
/opt/peik-deploy/node/bin/node --version
install -d -m 700 /root/peik-deploy-secrets
if [[ ! -f /root/peik-deploy-secrets/id_ed25519 ]]; then
  ssh-keygen -q -t ed25519 -N '' -C 'peik-github-actions' -f /root/peik-deploy-secrets/id_ed25519
fi
printf 'restrict,command="/usr/local/libexec/peik-deploy/receive.py" %s\n' "$(cat /root/peik-deploy-secrets/id_ed25519.pub)" > /var/lib/peik-upload/.ssh/authorized_keys
chown root:peikdeploy /var/lib/peik-upload/.ssh/authorized_keys
chmod 640 /var/lib/peik-upload/.ssh/authorized_keys
printf 'peikdeploy ALL=(root) NOPASSWD: /usr/local/bin/peik-deploy receive *\n' > /etc/sudoers.d/peik-deploy
chmod 440 /etc/sudoers.d/peik-deploy
visudo -cf /etc/sudoers.d/peik-deploy
/usr/bin/python3 /usr/local/libexec/peik-deploy/bootstrap.py bbfb11a8b1a34389eb43585612612f4c537c65cc
install -d -m 755 /etc/systemd/system/peik-delivery-api.service.d
install -m 644 "$stage/release.conf" /etc/systemd/system/peik-delivery-api.service.d/20-peik-releases.conf
systemctl daemon-reload
systemd-analyze verify peik-delivery-api.service
printf 'INSTALL_OK restricted receiver ready; production has not been restarted\n'
