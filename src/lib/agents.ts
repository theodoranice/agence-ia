// Catalogue des agents — rôles inspirés du dépôt open source msitarzewski/agency-agents (licence MIT).
// Partagé entre le serveur et l'interface.

export type Priority = "P1" | "P2" | "P3";
export type Agent = { slug: string; name: string; role: string; projects: string; prio: Priority; pole: Pole };
export type Pole = { id: string; name: string; color: string; mission: string; templates: string[]; agents: Agent[] };

type Raw = [string, string, string, string, Priority];
type RawPole = Omit<Pole, "agents"> & { agents: Raw[] };

const RAW: RawPole[] = [
  { id: "eng", name: "Engineering", color: "#3B5BDB", mission: "Construire et livrer les SaaS et projets clients",
    templates: ["Propose l'architecture technique (stack, modules, schéma de données) pour ", "Revois ce code et liste les problèmes par gravité, avec le correctif :\n\n", "Écris le schéma PostgreSQL et les migrations pour "],
    agents: [
      ["engineering-backend-architect", "Backend Architect", "Architecture API et base de données des SaaS", "RestaurantOS, SaaS WhatsApp, LUMEN RISE", "P1"],
      ["engineering-rapid-prototyper", "Rapid Prototyper", "MVP rapides pour tester une idée ou une demande client", "Produits Tech Teranga, projets clients", "P1"],
      ["engineering-multi-agent-systems-architect", "Multi-Agent Systems Architect", "Topologie, contexte et reprise sur erreur des systèmes d'agents", "Agents e-com, SaaS WhatsApp", "P1"],
      ["engineering-code-reviewer", "Code Reviewer", "Revue de code avant mise en production", "Tous les projets", "P1"],
      ["testing-reality-checker", "Reality Checker", "Contrôle qualité avant livraison au client", "Projets clients", "P1"],
      ["engineering-frontend-developer", "Frontend Developer", "Interfaces React / Next.js, performance mobile", "RestaurantOS, CyberLearn, LUMEN RISE", "P2"],
      ["engineering-ai-engineer", "AI Engineer", "Intégration Claude API, RAG, pipelines IA", "SaaS WhatsApp, Agents e-com", "P2"],
      ["engineering-prompt-engineer", "Prompt Engineer", "System prompts fiables pour les agents en production", "SaaS WhatsApp, Agents e-com, CLAVIS", "P2"],
      ["engineering-payments-billing-engineer", "Payments & Billing Engineer", "Paiements idempotents, abonnements, webhooks (Wave / Orange Money)", "CLAVIS, LUMEN RISE, SaaS WhatsApp", "P2"],
      ["engineering-devops-automator", "DevOps Automator", "CI/CD, Docker, déploiement VPS, monitoring", "Tous les SaaS", "P2"],
      ["engineering-database-optimizer", "Database Optimizer", "Schémas PostgreSQL, index, requêtes lentes", "RestaurantOS, Agents e-com (pgvector)", "P3"],
      ["engineering-mobile-app-builder", "Mobile App Builder", "Apps React Native / Flutter", "RestaurantOS, CyberLearn", "P3"],
      ["specialized-mcp-builder", "MCP Builder", "Serveurs MCP pour brancher tes outils à Claude", "Agents e-com, outils internes", "P3"],
      ["testing-api-tester", "API Tester", "Tests des endpoints et des intégrations", "SaaS WhatsApp, CLAVIS", "P3"],
    ] },
  { id: "sec", name: "Sécurité & Infra", color: "#5F3DC4", mission: "Sécuriser les SaaS et l'infrastructure",
    templates: ["Fais la checklist de sécurité avant mise en production de ", "Prépare un plan de réponse à incident pour ", "Rédige une procédure de durcissement pour "],
    agents: [
      ["security-ai-generated-code-auditor", "AI-Generated Code Security Auditor", "Audit du code généré par IA : secrets en dur, RLS, injection de prompt", "Tous les projets codés avec l'IA", "P1"],
      ["engineering-network-engineer", "Network Engineer", "Configuration routeurs, switches, firewalls, dépannage", "MICROSEN", "P1"],
      ["security-architect", "Security Architect", "Modèle de menaces et architecture sécurisée", "SaaS WhatsApp, LUMEN RISE, MICROSEN", "P2"],
      ["security-incident-responder", "Incident Responder", "Gestion d'incident et investigation", "MICROSEN, SaaS en production", "P2"],
      ["security-compliance-auditor", "Compliance Auditor", "Préparation d'audit (ISO 27001), adaptée au cadre BCEAO", "MICROSEN", "P2"],
      ["security-secrets-credential-engineer", "Secrets & Credential Hygiene Engineer", "Coffre-fort, rotation des clés API et tokens", "SaaS WhatsApp, CLAVIS, Agents e-com", "P2"],
      ["security-appsec-engineer", "Application Security Engineer", "SAST / DAST, sécurité du cycle de développement", "RestaurantOS, CLAVIS", "P3"],
      ["security-threat-detection-engineer", "Threat Detection Engineer", "Règles SIEM, threat hunting", "MICROSEN", "P3"],
      ["engineering-it-service-manager", "IT Service Manager", "ITIL 4 : incidents, changements, SLA, CMDB", "MICROSEN", "P3"],
    ] },
  { id: "mkt", name: "Digital & Marketing", color: "#0C8599", mission: "Faire connaître la marque et ses produits",
    templates: ["Écris 5 posts LinkedIn prêts à publier sur ", "Prépare un calendrier éditorial d'un mois pour ", "Fais un audit SEO et un plan d'action pour "],
    agents: [
      ["marketing-content-creator", "Content Creator", "Stratégie de contenu et calendrier éditorial", "Tech Teranga, CyberLearn", "P1"],
      ["marketing-linkedin-content-creator", "LinkedIn Content Creator", "Personal branding et contenu B2B", "Tech Teranga (B2B)", "P1"],
      ["marketing-growth-hacker", "Growth Hacker", "Acquisition, boucles virales, expérimentations", "Produits Tech Teranga, LUMEN RISE", "P2"],
      ["marketing-seo-specialist", "SEO Specialist", "Référencement des sites de l'agence et des clients", "techteranga.sn, sites clients", "P2"],
      ["marketing-tiktok-strategist", "TikTok Strategist", "Contenus courts et algorithme TikTok", "E-com, produits digitaux", "P2"],
      ["marketing-social-media-strategist", "Social Media Strategist", "Stratégie multi-plateforme", "Tech Teranga, CLAVIS", "P3"],
      ["marketing-instagram-curator", "Instagram Curator", "Ligne visuelle et communauté Instagram", "E-com, CLAVIS", "P3"],
      ["marketing-email-strategist", "Email Marketing Strategist", "Séquences email, segmentation, délivrabilité", "Produits Tech Teranga, LUMEN RISE", "P3"],
      ["marketing-ai-citation-strategist", "AI Citation Strategist", "Visibilité dans ChatGPT, Claude, Perplexity", "Tech Teranga", "P3"],
    ] },
  { id: "ecom", name: "E-commerce", color: "#E67700", mission: "Trouver, vendre et servir",
    templates: ["Trouve 10 idées de produits gagnants pour le marché sénégalais dans la niche ", "Écris un script de closing WhatsApp (relances incluses) pour ", "Fixe le prix en FCFA et calcule la marge pour "],
    agents: [
      ["product-trend-researcher", "Trend Researcher", "Recherche de produits gagnants et de tendances", "Agent 1 · Recherche produit", "P1"],
      ["paid-media-paid-social-strategist", "Paid Social Strategist", "Campagnes Meta Ads et TikTok Ads", "Agent 3 · Marketing", "P1"],
      ["sales-outreach", "Sales Outreach", "Relances et closing, adaptés à WhatsApp", "Agent 4 · Closer", "P1"],
      ["specialized-pricing-analyst", "Pricing Analyst", "Prix en FCFA, marges, analyse des concurrents", "E-com, produits digitaux", "P2"],
      ["sales-offer-lead-gen-strategist", "Offer & Lead Gen Strategist", "Offres, bundles, lead magnets", "E-com, produits digitaux", "P2"],
      ["customer-service", "Customer Service", "SAV, réclamations, fidélisation", "Boutiques e-com, CLAVIS", "P2"],
      ["paid-media-tracking-specialist", "Tracking & Measurement Specialist", "Pixel, GA4, API de conversions", "Boutiques e-com", "P3"],
      ["retail-customer-returns", "Retail Customer Returns", "Retours, échanges, prévention de la fraude", "Boutiques e-com", "P3"],
      ["marketing-cross-border-ecommerce", "Cross-Border E-Commerce Specialist", "Sourcing à l'import et logistique", "E-com", "P3"],
    ] },
  { id: "crea", name: "Création & Créatives", color: "#D6336C", mission: "Visuels, pubs et identité de marque",
    templates: ["Propose 5 concepts de pub Meta (hook, visuel, texte) pour ", "Écris 6 prompts d'images détaillés pour ", "Définis la charte de marque (ton, couleurs, typo) de "],
    agents: [
      ["paid-media-creative-strategist", "Ad Creative Strategist", "Concepts de pubs, hooks, tests créatifs", "Agent 2 · Créatif", "P1"],
      ["design-image-prompt-engineer", "Image Prompt Engineer", "Prompts pour Midjourney, Flux, Higgsfield", "Créas e-com, miniatures", "P1"],
      ["design-brand-guardian", "Brand Guardian", "Identité et cohérence de marque", "Tech Teranga, CLAVIS", "P2"],
      ["design-ui-designer", "UI Designer", "Design systems et maquettes d'interfaces", "RestaurantOS, CyberLearn, LUMEN RISE", "P2"],
      ["design-inclusive-visuals-specialist", "Inclusive Visuals Specialist", "Visuels IA fidèles aux personnes et cultures africaines", "Toutes les créas", "P2"],
      ["design-visual-storyteller", "Visual Storyteller", "Narration visuelle de marque", "Tech Teranga, LUMEN RISE", "P3"],
      ["marketing-carousel-growth-engine", "Carousel Growth Engine", "Carrousels Instagram et TikTok", "Tech Teranga, E-com", "P3"],
    ] },
  { id: "yt", name: "YouTube Automation", color: "#E03131", mission: "Produire et faire croître les chaînes vidéo",
    templates: ["Écris le script d'une vidéo de 8 minutes sur la légende de ", "Propose 10 titres et concepts de miniature pour une vidéo sur ", "Découpe cette vidéo en 3 Shorts : "],
    agents: [
      ["marketing-video-optimization-specialist", "Video Optimization Specialist", "SEO YouTube, chapitres, concepts de miniatures, rétention", "Mythoria", "P1"],
      ["narrative-designer", "Narrative Designer", "Structure narrative des scripts", "Mythoria", "P1"],
      ["marketing-short-video-editing-coach", "Short-Video Editing Coach", "Montage, rythme, formats Shorts", "Mythoria Shorts, TikTok", "P2"],
      ["engineering-voice-ai-integration-engineer", "Voice AI Integration Engineer", "Pipeline de transcription et sous-titres (Whisper)", "Mythoria FR / EN", "P3"],
      ["specialized-focus-music-architect", "Focus Music Architect", "Prompts de musique d'ambiance générative", "Mythoria", "P3"],
      ["project-management-experiment-tracker", "Experiment Tracker", "A/B tests des titres et miniatures", "Mythoria", "P3"],
    ] },
  { id: "sales", name: "Ventes & Clients", color: "#2B8A3E", mission: "Signer et garder les clients",
    templates: ["Rédige une proposition commerciale pour ", "Crée une séquence de prospection en 4 messages pour ", "Prépare les questions de découverte pour un rendez-vous avec "],
    agents: [
      ["sales-outbound-strategist", "Outbound Strategist", "Prospection ciblée PME et institutions", "Agence", "P1"],
      ["sales-proposal-strategist", "Proposal Strategist", "Propositions commerciales et appels d'offres", "Agence, marchés publics", "P1"],
      ["sales-discovery-coach", "Discovery Coach", "Préparation des rendez-vous de découverte", "Agence", "P2"],
      ["sales-engineer", "Sales Engineer", "Démos techniques, cadrage de POC", "SaaS WhatsApp, RestaurantOS", "P2"],
      ["customer-success-manager", "Customer Success Manager", "Onboarding des clients SaaS, rétention", "SaaS WhatsApp, RestaurantOS, CLAVIS", "P3"],
    ] },
  { id: "pilot", name: "Pilotage & Admin", color: "#5C677D", mission: "Coordonner, suivre les chiffres, rester conforme",
    templates: ["Découpe ce projet en tâches priorisées avec estimation : ", "Fais une synthèse exécutive d'une page de ", "Construis un budget mensuel simple pour "],
    agents: [
      ["agents-orchestrator", "Agents Orchestrator", "Coordonne plusieurs agents sur un projet complexe", "Tous", "P1"],
      ["project-manager-senior", "Senior Project Manager", "Transforme un cahier des charges en tâches", "Projets clients", "P1"],
      ["project-management-studio-producer", "Studio Producer", "Vue d'ensemble de tout le portefeuille", "Tous", "P2"],
      ["support-finance-tracker", "Finance Tracker", "Budget, trésorerie, rentabilité par activité", "Agence", "P2"],
      ["specialized-chief-of-staff", "Chief of Staff", "Filtre le bruit et priorise les décisions", "Direction", "P3"],
      ["support-executive-summary-generator", "Executive Summary Generator", "Synthèses pour les clients et la direction", "Clients, direction", "P3"],
      ["support-legal-compliance-checker", "Legal Compliance Checker", "CGV et protection des données (loi sénégalaise, CDP)", "Tous les SaaS", "P3"],
    ] },
];

export const POLES: Pole[] = RAW.map((p) => {
  const pole: Pole = { ...p, agents: [] };
  pole.agents = p.agents.map(([slug, name, role, projects, prio]) => ({ slug, name, role, projects, prio, pole }));
  return pole;
});

export const AGENTS: Agent[] = POLES.flatMap((p) => p.agents);
export const AGENT_BY_SLUG: Record<string, Agent> = Object.fromEntries(AGENTS.map((a) => [a.slug, a]));
export const DEFAULT_AGENT = "engineering-backend-architect";
