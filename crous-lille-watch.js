// surveille-crous-lille-sms.js
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// === CONFIGURATION ===
const VILLE_CIBLE = "Lille";
const BASE_URL = "https://trouverunlogement.lescrous.fr/";
const FICHIER_SAUVEGARDE = path.join(__dirname, "annonces_deja_vues.json");
const INTERVALLE = 45; // secondes

// Email (préférer définir via .env)
const EXPEDITEUR_EMAIL = process.env.EXPEDITEUR_EMAIL || "mamady22mansare@gmail.com";
const MOT_DE_PASSE_APP = process.env.MOT_DE_PASSE_APP || "vuhqliwmnwjyarlh";
const DESTINATAIRE_EMAIL = process.env.DESTINATAIRE_EMAIL || "mamadymansare43@gmail.com";

// Free Mobile SMS config (si tu es abonné Free Mobile) - définir dans .env
const FREE_SMS_ENABLED = (process.env.FREE_SMS_ENABLED === '1');
const FREE_MOBILE_USER = process.env.FREE_MOBILE_USER || '';
const FREE_MOBILE_PASS = process.env.FREE_MOBILE_PASS || '';
const SMS_STATS_FILE = path.join(__dirname, 'sms_stats.json');

// limites SMS (Free Mobile domotique: 1 SMS/min et ~200/jour)
const SMS_MIN_INTERVAL_SECONDS = 65;
const SMS_MAX_PER_DAY = 200;

// --- helpers pour sauvegarder/charger stats SMS
function loadSmsStats() {
    try {
        if (fs.existsSync(SMS_STATS_FILE)) {
            return JSON.parse(fs.readFileSync(SMS_STATS_FILE, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { lastSent: 0, countToday: 0, date: (new Date()).toISOString().slice(0,10) };
}

function saveSmsStats(stats) {
    try { fs.writeFileSync(SMS_STATS_FILE, JSON.stringify(stats, null, 2)); } catch(e){ /* ignore */ }
}

function resetSmsStatsIfNeeded(stats) {
    const today = (new Date()).toISOString().slice(0,10);
    if (stats.date !== today) {
        stats.countToday = 0;
        stats.date = today;
    }
    return stats;
}

// User agents & headers
function getRandomHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    ];
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/',
    };
}

// Récupérer la page avec protection Cloudflare
async function fetchPage() {
    try {
        const params = {
            period: 'currentSchoolYear',
            location: '',
            maxPrice: '',
            _: Date.now(),
            rnd: Math.floor(Math.random() * 9000) + 1000
        };
        const url = BASE_URL + '?' + new URLSearchParams(params).toString();
        const res = await axios.get(url, {
            headers: getRandomHeaders(),
            timeout: 25000
        });
        if (res.status === 200) {
            console.log("✅ Accès réussi au site.");
            return res.data;
        } else {
            console.log(`⚠️ Statut HTTP: ${res.status}`);
            return null;
        }
    } catch (err) {
        console.log("🚫 Erreur accès site:", err.message);
        return null;
    }
}

// Sauvegarde/lecture annonces
function loadAnnonces() {
    if (fs.existsSync(FICHIER_SAUVEGARDE)) {
        try {
            return JSON.parse(fs.readFileSync(FICHIER_SAUVEGARDE, "utf8"));
        } catch { return []; }
    }
    return [];
}

function saveAnnonces(list) {
    fs.writeFileSync(FICHIER_SAUVEGARDE, JSON.stringify(list, null, 2));
}

// Extraction des annonces depuis HTML
function extractAnnonces(html) {
    if (!html) return [];
    const $ = cheerio.load(html);
    let annonces = [];
    const elems = $('div, article, section, li, tr').slice(0, 50);
    elems.each((_, el) => {
        try {
            const texte = $(el).text().toLowerCase();
            if (!texte.includes(VILLE_CIBLE.toLowerCase())) return;
            const titre = $(el).find('h1,h2,h3,h4,h5,strong,b,span').first().text().trim() || "Logement CROUS Lille";
            const prixMatch = texte.match(/(\d+[\s€]*)+/);
            const prix = prixMatch ? prixMatch[0].trim() : "Prix non communiqué";
            let lien = $(el).find('a').first().attr('href') || BASE_URL;
            if (lien && !lien.startsWith('http')) lien = BASE_URL + lien.replace(/^\//, '');
            const id = Math.abs((titre + Date.now()).hashCode()).toString().slice(-10);
            annonces.push({
                id, titre: titre.slice(0, 100), lieu: VILLE_CIBLE, prix, lien, timestamp: Date.now()/1000
            });
        } catch { /* ignore */ }
    });
    return annonces;
}

// HashCode helper (simple)
String.prototype.hashCode = function() {
    var hash = 0, i, chr;
    for (i = 0; i < this.length; i++) {
        chr   = this.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash;
};

// Envoi d'email
async function sendMail(annonce, verification=false) {
    let sujet, message;
    if (verification) {
        sujet = "🟢 Vérification - Script logement Lille lancé";
        message = "Le script de surveillance logement Lille est bien lancé !\n\nCe mail confirme que la partie email fonctionne.\nVous recevrez une alerte en cas de nouvelle annonce.";
    } else {
        sujet = `🚨 ALERTE LOGEMENT LILLE - ${new Date().toLocaleTimeString("fr-FR")}`;
        message = `NOUVEAU LOGEMENT DÉTECTÉ !\n\n📍 Lieu: ${annonce.lieu}\n🏠 Titre: ${annonce.titre}\n💰 Prix: ${annonce.prix}\n🔗 Lien: ${annonce.lien}\n\n⏰ Détecté à: ${new Date().toLocaleTimeString("fr-FR")}`;
    }

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EXPEDITEUR_EMAIL,
            pass: MOT_DE_PASSE_APP
        }
    });

    try {
        await transporter.sendMail({
            from: `"CROUS Lille" <${EXPEDITEUR_EMAIL}>`,
            to: DESTINATAIRE_EMAIL,
            subject: sujet,
            text: message
        });
        console.log("📧 Email envoyé");
    } catch (e) {
        console.log("❌ Erreur email:", e.message);
    }
}

// --- Envoi SMS via Free Mobile (gratuit pour abonnés Free Mobile)
// Docs / comportement : envoi vers le numéro lié au compte Free et activation nécessaire dans l'espace abonné.
async function sendSmsFreeMobile(message) {
    if (!FREE_MOBILE_USER || !FREE_MOBILE_PASS) {
        console.log("ℹ️ SMS Free Mobile non configuré (user/pass manquants).");
        return;
    }

    // limiter la fréquence et le nombre journalier
    let stats = loadSmsStats();
    stats = resetSmsStatsIfNeeded(stats);
    const now = Math.floor(Date.now() / 1000);
    if (now - (stats.lastSent || 0) < SMS_MIN_INTERVAL_SECONDS) {
        console.log("⚠️ Ignoré: envoi SMS trop fréquent (limite 1/min).");
        return;
    }
    if (stats.countToday >= SMS_MAX_PER_DAY) {
        console.log("⚠️ Ignoré: quota SMS journalier atteint.");
        return;
    }

    // tronquer le message à ~140 caractères pour garantir la livraison (adaptable)
    let body = message.toString().slice(0, 140);

    const url = `https://smsapi.free-mobile.fr/sendmsg?user=${encodeURIComponent(FREE_MOBILE_USER)}&pass=${encodeURIComponent(FREE_MOBILE_PASS)}&msg=${encodeURIComponent(body)}`;

    try {
        const res = await axios.get(url, { timeout: 10000 });
        if (res.status >= 200 && res.status < 300) {
            stats.lastSent = now;
            stats.countToday = (stats.countToday || 0) + 1;
            saveSmsStats(stats);
            console.log("📱 SMS envoyé via Free Mobile (OK).");
        } else {
            console.log("❌ Erreur SMS Free Mobile, status:", res.status);
        }
    } catch (e) {
        console.log("❌ Erreur HTTP SMS Free Mobile:", e.message);
    }
}

// Envoi combiné (email + sms si activé)
async function sendAlert(annonce) {
    await sendMail(annonce);
    // envoyer un SMS résumé si activé (FREE_SMS_ENABLED permet de désactiver les SMS globaux)
    if (FREE_SMS_ENABLED) {
        const smsMsg = `NOUVEAU LOGEMENT: ${annonce.titre} - ${annonce.prix} - ${annonce.lien}`;
        await sendSmsFreeMobile(smsMsg);
    }
}

// Boucle principale de surveillance
async function surveiller() {
    let annoncesConnues = loadAnnonces();
    let idsConnus = annoncesConnues.map(a => a.id);
    const html = await fetchPage();
    if (!html) {
        console.log("💥 Site inaccessible, pause 5 min.");
        await new Promise(res => setTimeout(res, 300000));
        return;
    }
    const nouvelles = extractAnnonces(html);
    let ajout = false;
    for (const annonce of nouvelles) {
        if (!idsConnus.includes(annonce.id)) {
            console.log("🎯 NOUVELLE ANNONCE:", annonce.titre);
            await sendAlert(annonce); // envoi email + sms si possible
            annoncesConnues.push(annonce);
            ajout = true;
        }
    }
    // Garder annonces <24h et limiter à 150
    const now = Date.now()/1000;
    annoncesConnues = annoncesConnues.filter(a => now - a.timestamp < 86400);
    saveAnnonces(annoncesConnues.slice(-150));
}

// Fonction main (démarrage + test SMS de démarrage si identifiants fournis)
async function main() {
    console.log("🛡️ Lancement du script CROUS Lille sur Node.js");
    await sendMail({lieu: VILLE_CIBLE, titre: "Test script démarré", prix: "", lien: BASE_URL}, true);

    // Test SMS de démarrage : envoie si les identifiants Free Mobile sont renseignés
    if (FREE_MOBILE_USER && FREE_MOBILE_PASS) {
        try {
            console.log("📲 Tentative d'envoi du SMS de démarrage...");
            await sendSmsFreeMobile(`Test: script de surveillance ${VILLE_CIBLE} démarré.`);
        } catch (e) {
            console.log("❌ Erreur lors de l'envoi du SMS de démarrage:", e.message);
        }
    } else if (FREE_SMS_ENABLED) {
        // fallback si tu as explicitement activé FREE_SMS_ENABLED mais n'a pas renseigné user/pass (rare)
        try {
            console.log("📲 FREE_SMS_ENABLED true mais identifiants absents — tentative d'envoi...");
            await sendSmsFreeMobile(`Test: script de surveillance ${VILLE_CIBLE} démarré.`);
        } catch (e) {
            console.log("❌ Erreur SMS (fallback):", e.message);
        }
    } else {
        console.log("ℹ️ SMS de démarrage non envoyé — identifiants Free Mobile absents.");
    }

    let compteur = 0;
    while (true) {
        try {
            compteur++;
            console.log(`\n🔍 Vérification #${compteur} - ${new Date().toLocaleTimeString("fr-FR")}`);
            await surveiller();
            let delai = INTERVALLE + Math.floor(Math.random()*20 - 10);
            await new Promise(res => setTimeout(res, Math.max(30, delai) * 1000));
        } catch (e) {
            console.log(`💥 Erreur: ${e.message} - Pause 2 min`);
            await new Promise(res => setTimeout(res, 120000));
        }
    }
}

if (require.main === module) main();
