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

// Email
const EXPEDITEUR_EMAIL = "mamady22mansare@gmail.com";
const MOT_DE_PASSE_APP = "vuhqliwmnwjyarlh";
const DESTINATAIRE_EMAIL = "mamadymansare43@gmail.com";

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

// Boucle principale
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
            await sendMail(annonce);
            annoncesConnues.push(annonce);
            ajout = true;
        }
    }
    // Garder annonces <24h et limiter à 150
    const now = Date.now()/1000;
    annoncesConnues = annoncesConnues.filter(a => now - a.timestamp < 86400);
    saveAnnonces(annoncesConnues.slice(-150));
}

async function main() {
    console.log("🛡️ Lancement du script CROUS Lille sur Node.js");
    await sendMail({lieu: VILLE_CIBLE, titre: "Test script démarré", prix: "", lien: BASE_URL}, true);
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
