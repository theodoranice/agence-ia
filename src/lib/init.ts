import { readFile } from "fs/promises";
import path from "path";
import { one, q } from "./db";
import { hashPassword } from "./auth";
import { DEFAULT_COMPANY_CONTEXT } from "./prompt";

const STARTER_PROJECTS: [string, string][] = [
  ["RestaurantOS", "Plateforme de gestion de restaurants et bars pour le marché sénégalais."],
  ["SaaS WhatsApp", "SaaS multi-tenant d'agents IA sur WhatsApp pour les entreprises de l'UEMOA."],
  ["CLAVIS", "Système d'abonnement Telegram en production pour une marketplace de mode."],
  ["CyberLearn", "SaaS gamifié d'apprentissage de l'informatique en français."],
  ["LUMEN RISE", "Plateforme premium de mentorat pour entrepreneurs sénégalais, ouest-africains et de la diaspora."],
  ["Mythoria", "Chaîne YouTube automatisée bilingue (français / anglais) sur les mythes et légendes."],
  ["Agents e-commerce", "Système e-commerce à 4 agents (recherche produit, créatif, marketing, closer) sur n8n, Claude API et PostgreSQL, avec validation par bot Telegram."],
  ["Produits Tech Teranga", "Gamme de produits digitaux et écosystème marketing de Tech Teranga."],
  ["MICROSEN", "Infrastructure IT, cybersécurité et conformité d'une institution de microfinance sous supervision BCEAO. Ne jamais demander de configuration réelle ni de donnée client."],
];

export async function init() {
  const schema = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await q(schema);

  // Premier démarrage : création du compte administrateur
  const count = await one<{ n: string }>("SELECT count(*) AS n FROM users");
  if (Number(count?.n ?? 0) === 0) {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";
    if (!email || password.length < 10) {
      console.warn("[init] Aucun utilisateur. Renseigne ADMIN_EMAIL et ADMIN_PASSWORD (10 caractères minimum) puis redémarre.");
    } else {
      const admin = await one<{ id: string }>(
        "INSERT INTO users (email, name, password_hash, role, company_context) VALUES ($1,$2,$3,'admin',$4) RETURNING id",
        [email, process.env.ADMIN_NAME || "Administrateur", await hashPassword(password), DEFAULT_COMPANY_CONTEXT],
      );
      for (const [name, description] of STARTER_PROJECTS) {
        await q("INSERT INTO projects (user_id, name, description) VALUES ($1,$2,$3)", [admin!.id, name, description]);
      }
      console.log(`[init] Compte administrateur créé : ${email}`);
    }
  }

  // Après un redémarrage, rien ne tourne plus : on remet les états à jour.
  await q("UPDATE missions SET status='echec' WHERE status='en_cours'");
  await q("UPDATE run_steps SET status='failed', error='Interrompu par un redémarrage du serveur.' WHERE status='running'");
  await q("UPDATE runs SET status='failed', error='Interrompu par un redémarrage du serveur. Tu peux relancer le plan.' WHERE status='running'");
  await q("DELETE FROM sessions WHERE expires_at < now()");
}
