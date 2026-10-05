# Agence IA — V2

Plateforme d'agents IA spécialisés, avec recherche web, orchestrateur et comptes clients.

- 66 agents répartis sur 8 pôles (rôles inspirés du dépôt open source agency-agents).
- Recherche web avec sources citées, via l'outil `web_search` de l'API Claude, localisée sur Dakar.
- Missions en direct (streaming), avec précisions de suivi, statuts et coût par mission.
- Orchestrateur : un objectif devient un plan d'étapes, que tu peux modifier avant de le lancer. Les agents travaillent ensuite l'un après l'autre en tâche de fond, chacun avec les livrables des précédents.
- Comptes multi-utilisateurs (admin / membre). Chaque compte a ses projets, son contexte d'entreprise et ses missions, invisibles pour les autres.
- Budget mensuel par compte, avec un suivi des coûts en dollars et en FCFA.

Stack : Next.js 15, PostgreSQL 16, SDK Anthropic, Docker.

---

## 1. Préparer la clé API

1. Crée un compte sur https://console.anthropic.com.
2. Dans **Billing**, ajoute un moyen de paiement et du crédit.
3. Fixe une **limite de dépense mensuelle** dans les réglages de la Console. C'est ton filet de sécurité global.
4. Dans **API keys**, crée une clé et garde-la pour l'étape 2.

## 2. Déployer sur le VPS

Prérequis : Docker et le plugin Docker Compose installés sur le VPS.

```bash
# Copie le dossier sur le VPS (scp, git…) puis :
cd agence-ia
cp .env.example .env
nano .env        # clé API, mot de passe de la base, e-mail et mot de passe admin
docker compose up -d --build
docker compose logs -f app   # attendre « Compte administrateur créé »
```

L'application écoute sur `127.0.0.1:3000` du VPS. Elle n'est pas exposée directement : il faut un reverse proxy HTTPS (étape 3).

> Pour un test rapide en HTTP sans domaine, mets `COOKIE_SECURE=false` dans `.env`. Change aussi le port dans `docker-compose.yml` en `"3000:3000"`, puis remets ces deux réglages pour la production.

## 3. HTTPS (obligatoire en production)

Les réponses arrivent en flux (SSE) : le proxy ne doit pas les mettre en tampon, et les délais d'attente doivent être longs (une mission avec recherches peut durer plusieurs minutes).

**Avec Caddy** (le plus simple, certificat automatique) :

```
agents.techteranga.sn {
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
        transport http {
            read_timeout 15m
        }
    }
}
```

**Avec Nginx :**

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 900s;
}
```

## 4. Premiers pas

1. Connecte-toi avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Tes projets (RestaurantOS, Mythoria, etc.) sont déjà créés.
2. **Compte** : vérifie le contexte d'entreprise. Chaque agent le lit avant chaque mission.
3. **Agents** : choisis un agent, un projet, un niveau (Rapide = Haiku, Standard = Sonnet, Approfondi = Opus), coche « Recherche web » et lance une mission.
4. **Orchestrateur** : décris un objectif, relis le plan proposé, ajuste les étapes, puis lance-le.
5. **Administration** : crée des comptes clients avec un budget mensuel en dollars. Transmets-leur le mot de passe provisoire ; ils le changent dans « Compte ».

## 5. Coûts

Chaque appel est enregistré dans la table `usage`, avec les tokens, le nombre de recherches et le coût estimé :

| Élément | Tarif utilisé (modifiable dans `src/lib/pricing.ts`) |
|---|---|
| Haiku 4.5 | 1 $ / 5 $ par million de tokens (entrée / sortie) |
| Sonnet 5.5 | 2 $ / 10 $ |
| Opus 5.5 | 4 $ / 20 $ |
| Recherche web | 10 $ pour 1 000 recherches |

Les résultats de recherche comptent aussi en tokens d'entrée. Une mission Standard avec 3 à 5 recherches coûte en général quelques centimes de dollar. `MAX_SEARCHES_PER_MISSION` plafonne le nombre de recherches par appel.

La facture de la Console Anthropic fait foi. Les montants de l'application sont des estimations.

## 6. Exploitation

```bash
docker compose pull db && docker compose up -d --build     # mise à jour après modification du code
docker compose exec db pg_dump -U agence agence > sauvegarde-$(date +%F).sql   # sauvegarde
docker compose logs -f app                                  # journaux
```

Mot de passe administrateur perdu ? Crée un second compte admin depuis un compte admin existant, ou mets à jour `password_hash` en base.

## 7. Limites connues de la V2

- **Le budget est vérifié avant chaque mission.** Une mission démarrée peut donc dépasser légèrement le budget restant ; la suivante est ensuite bloquée.
- **Un redémarrage du conteneur interrompt les plans en cours.** Ils passent en « Échec » ; « Reprendre le plan » repart de l'étape interrompue, sans refaire les étapes terminées.
- **Une seule instance.** L'exécution des plans et le bouton « Arrêter » vivent dans le processus. Pour plusieurs instances, il faudrait une file de tâches (Redis / BullMQ), à prévoir en V3.
- **Mission arrêtée.** Une mission arrêtée en cours de route passe en « Échec », et son texte partiel n'est pas conservé.

## Structure

```
db/schema.sql                 schéma PostgreSQL (appliqué au démarrage)
src/lib/agents.ts             catalogue des 66 agents et modèles de missions
src/lib/prompt.ts             prompts système des agents et de l'orchestrateur
src/lib/claude.ts             appel API, streaming, recherche web, sources, pause_turn
src/lib/missions.ts           exécution d'une mission, historique, coûts
src/lib/orchestrator.ts       plans et exécution enchaînée des étapes
src/lib/quota.ts              budgets mensuels
src/app/api/…                 routes API (auth, missions, runs, projects, me, admin)
src/app/(app)/…               interface (agents, orchestrateur, missions, projets, compte, admin)
```
