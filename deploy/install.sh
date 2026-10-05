#!/usr/bin/env bash
# Installation / mise à jour de l'Agence IA sur un VPS Linux (Ubuntu / Debian).
# Lancement : sudo bash deploy/install.sh   (depuis le dossier agence-ia)
# Les secrets (clé API, mot de passe admin) sont saisis au clavier et ne quittent pas le serveur.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mErreur : %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "lance ce script avec sudo."

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Installation de Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "le plugin « docker compose » est absent. Installe docker-compose-plugin puis relance."

# 2. Fichier .env (créé une seule fois ; une mise à jour le conserve)
if [ ! -f .env ]; then
  say "Configuration (les saisies masquées ne s'affichent pas)"
  read -rsp "Clé API Anthropic (sk-ant-...) : " API_KEY; echo
  [[ "$API_KEY" == sk-ant-* ]] || die "la clé doit commencer par sk-ant-."
  read -rp "E-mail administrateur [tech.terangasn@gmail.com] : " ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-tech.terangasn@gmail.com}"
  read -rp "Nom affiché [Théo] : " ADMIN_NAME
  ADMIN_NAME="${ADMIN_NAME:-Théo}"
  while :; do
    read -rsp "Mot de passe administrateur (10 caractères min.) : " ADMIN_PW; echo
    read -rsp "Confirme le mot de passe : " ADMIN_PW2; echo
    [ "$ADMIN_PW" = "$ADMIN_PW2" ] || { echo "Les deux saisies diffèrent."; continue; }
    [ ${#ADMIN_PW} -ge 10 ] || { echo "Trop court."; continue; }
    [[ "$ADMIN_PW" != *"'"* ]] || { echo "Évite l'apostrophe ' dans le mot de passe."; continue; }
    break
  done
  read -rp "Domaine pour l'application (ex. agents.techteranga.sn, vide = pas de domaine) : " DOMAIN
  PG_PW="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  COOKIE_SECURE=true; [ -z "$DOMAIN" ] && COOKIE_SECURE=false
  umask 077
  cat > .env <<EOF
ANTHROPIC_API_KEY='$API_KEY'
POSTGRES_PASSWORD=$PG_PW
ADMIN_EMAIL='$ADMIN_EMAIL'
ADMIN_PASSWORD='$ADMIN_PW'
ADMIN_NAME='$ADMIN_NAME'
NEXT_PUBLIC_BRAND='Tech Teranga'
APP_PORT=3000
COOKIE_SECURE=$COOKIE_SECURE
APP_DOMAIN=$DOMAIN
MODEL_RAPIDE=claude-haiku-4-5
MODEL_STANDARD=claude-sonnet-5-5
MODEL_APPROFONDI=claude-opus-5-5
MAX_SEARCHES_PER_MISSION=5
SEARCH_CITY=Dakar
SEARCH_COUNTRY=SN
SEARCH_TIMEZONE=Africa/Dakar
WEB_SEARCH_USD=0.01
MAX_TOKENS=8000
USD_TO_XOF=600
EOF
  unset API_KEY ADMIN_PW ADMIN_PW2
  say ".env créé (lisible par root uniquement)"
else
  say ".env existant conservé (mise à jour)"
fi

DOMAIN="$(grep -E '^APP_DOMAIN=' .env | cut -d= -f2- || true)"

# 3. HTTPS : Traefik de Coolify s'il est présent, sinon Caddy si les ports 80/443 sont libres
rm -f docker-compose.override.yml
PROXY_MODE=""
if [ -n "$DOMAIN" ] && docker ps --format '{{.Names}}' | grep -qx 'coolify-proxy'; then
  PROXY_MODE="coolify"
  NET="$(docker inspect coolify-proxy --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -x 'coolify' || true)"
  [ -n "$NET" ] || die "le proxy Coolify n'est pas sur le réseau « coolify »."
  RESOLVER="$(docker inspect coolify-proxy --format '{{json .Config.Cmd}} {{json .Args}}' | grep -oE 'certificatesresolvers\.[A-Za-z0-9_-]+\.acme' | head -1 | cut -d. -f2 || true)"
  RESOLVER="${RESOLVER:-letsencrypt}"
  say "Proxy Coolify (Traefik) détecté : $DOMAIN, certificat via « $RESOLVER »"
  cat > docker-compose.override.yml <<EOF
services:
  app:
    networks: [default, coolify]
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=coolify"
      - "traefik.http.middlewares.agence-redirect.redirectscheme.scheme=https"
      - "traefik.http.routers.agence-http.rule=Host(\`$DOMAIN\`)"
      - "traefik.http.routers.agence-http.entrypoints=http"
      - "traefik.http.routers.agence-http.middlewares=agence-redirect"
      - "traefik.http.routers.agence.rule=Host(\`$DOMAIN\`)"
      - "traefik.http.routers.agence.entrypoints=https"
      - "traefik.http.routers.agence.tls=true"
      - "traefik.http.routers.agence.tls.certresolver=$RESOLVER"
      - "traefik.http.services.agence.loadbalancer.server.port=3000"
networks:
  coolify:
    external: true
EOF
fi
if [ -n "$DOMAIN" ] && [ -z "$PROXY_MODE" ]; then
  if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq '(:|\])(80|443)$' && ! docker ps --format '{{.Names}}' | grep -q 'caddy'; then
    say "Les ports 80/443 sont déjà utilisés (Nginx ?) : pas de Caddy. Ajoute ce bloc à ton Nginx puis recharge-le :"
    cat <<EOF

server {
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 900s;
    }
}
# puis : certbot --nginx -d $DOMAIN
EOF
  else
    say "HTTPS automatique avec Caddy pour $DOMAIN"
    cat > deploy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy app:3000 {
        flush_interval -1
        transport http {
            read_timeout 15m
        }
    }
}
EOF
    cat > docker-compose.override.yml <<'EOF'
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [app]
    ports: ["80:80", "443:443"]
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
volumes:
  caddy_data:
EOF
  fi
fi

# 4. Construction et démarrage
say "Construction et démarrage (3 à 6 minutes la première fois)"
docker compose up -d --build

say "Attente du démarrage de l'application"
for i in $(seq 1 60); do
  if curl -fs -o /dev/null http://127.0.0.1:3000/login; then
    ok=1; break
  fi
  sleep 3
done
[ "${ok:-0}" = 1 ] || { docker compose logs --tail 60 app; die "l'application ne répond pas. Journaux ci-dessus."; }

docker compose logs app 2>/dev/null | grep -E '\[init\]' | tail -3 || true
say "Agence IA en ligne"
if [ -n "$DOMAIN" ] && [ -f docker-compose.override.yml ]; then
  echo "  Adresse : https://$DOMAIN  (le DNS de $DOMAIN doit pointer vers ce serveur)"
  echo "  Le certificat HTTPS peut prendre une à deux minutes à être émis."
elif [ -n "$DOMAIN" ]; then
  echo "  Adresse : https://$DOMAIN  après configuration de Nginx (voir plus haut)"
else
  echo "  Pas de domaine : depuis ton PC, ouvre un tunnel :"
  echo "    ssh -L 3000:127.0.0.1:3000 <utilisateur>@<ip-du-vps>"
  echo "  puis va sur http://localhost:3000"
fi
