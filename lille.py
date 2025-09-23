import time
import smtplib
from email.mime.text import MIMEText
from bs4 import BeautifulSoup
import json
import random
import re
from urllib.parse import urlencode
import cloudscraper

# === CONFIGURATION AVANCÉE ===
VILLE_CIBLE = "Lille"
BASE_URL = "https://trouverunlogement.lescrous.fr/"
FICHIER_SAUVEGARDE = "annonces_deja_vues.json"
INTERVALLE = 45  # en secondes

# Configuration email
EXPEDITEUR_EMAIL = "mamady22mansare@gmail.com"
MOT_DE_PASSE_APP = "vuhqliwmnwjyarlh"
DESTINATAIRE_EMAIL = "mamadymansare43@gmail.com"

def obtenir_headers_aleatoires():
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    ]
    accept_languages = [
        'fr-FR,fr;q=0.9,en;q=0.8',
        'fr,en;q=0.9,fr-FR;q=0.8',
        'fr-BE,fr;q=0.9,en;q=0.8',
        'fr-CH,fr;q=0.9,en;q=0.8'
    ]
    return {
        'User-Agent': random.choice(user_agents),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': random.choice(accept_languages),
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.google.com/'
    }

def faire_requete_cloudscraper():
    """Utilise cloudscraper pour passer les protections anti-bot"""
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'mobile': False
        },
        delay=random.uniform(0.6, 1.8)
    )
    headers = obtenir_headers_aleatoires()
    params = {
        'period': 'currentSchoolYear',
        'location': '',
        'maxPrice': '',
        '_': str(int(time.time() * 1000)),  # Timestamp
        'rnd': random.randint(1000, 9999)
    }
    url = BASE_URL + '?' + urlencode(params)
    try:
        # Visite d'abord la page d'accueil pour obtenir cookies/session
        scraper.get(BASE_URL, headers=headers, timeout=15)
        time.sleep(random.uniform(1, 2.5))
        response = scraper.get(url, headers=headers, timeout=25)
        if response.status_code == 200:
            print("✅ cloudscraper : accès réussi")
            return response.text
        else:
            print(f"⚠️ cloudscraper : statut {response.status_code}")
            return None
    except Exception as e:
        print(f"🚫 Erreur cloudscraper : {e}")
        return None

def charger_annonces_connues():
    try:
        with open(FICHIER_SAUVEGARDE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def sauvegarder_annonces(annonces):
    with open(FICHIER_SAUVEGARDE, 'w') as f:
        json.dump(annonces, f)

def extraire_annonces(html):
    if not html:
        return []
    soup = BeautifulSoup(html, 'html.parser')
    annonces = []
    elements_potentiels = soup.find_all(['div', 'article', 'section', 'li', 'tr'])
    for elem in elements_potentiels[:50]:
        try:
            texte = elem.get_text().lower()
            if VILLE_CIBLE.lower() not in texte:
                continue
            titre_elem = elem.find(['h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'span'])
            titre = titre_elem.text.strip() if titre_elem else "Logement CROUS Lille"
            prix_match = re.search(r'(\d+[\s€]*)+', elem.get_text())
            prix = prix_match.group(0).strip() if prix_match else "Prix non communiqué"
            lien_elem = elem.find('a')
            if lien_elem and lien_elem.get('href'):
                lien = lien_elem['href']
                if not lien.startswith('http'):
                    lien = BASE_URL + lien.lstrip('/')
            else:
                lien = BASE_URL
            id_annonce = str(abs(hash(titre + str(time.time()))))[-10:]
            annonces.append({
                'id': id_annonce,
                'titre': titre[:100],
                'lieu': VILLE_CIBLE,
                'prix': prix,
                'lien': lien,
                'timestamp': time.time()
            })
        except Exception:
            continue
    return annonces

def envoyer_notification(annonce):
    sujet = f"🚨 ALERTE LOGEMENT LILLE - {time.strftime('%H:%M')}"
    message = f"""
    NOUVEAU LOGEMENT DÉTECTÉ !

    📍 Lieu: {annonce['lieu']}
    🏠 Titre: {annonce['titre']}
    💰 Prix: {annonce['prix']}
    🔗 Lien: {annonce['lien']}

    ⏰ Détecté à: {time.strftime('%H:%M:%S')}
    """
    msg = MIMEText(message, 'plain', 'utf-8')
    msg['Subject'] = sujet
    msg['From'] = EXPEDITEUR_EMAIL
    msg['To'] = DESTINATAIRE_EMAIL
    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EXPEDITEUR_EMAIL, MOT_DE_PASSE_APP)
        server.send_message(msg)
        server.quit()
        print("📧 Notification envoyée")
    except Exception as e:
        print(f"❌ Erreur email: {e}")

def surveiller():
    annonces_connues = charger_annonces_connues()
    ids_connus = [a['id'] for a in annonces_connues]
    html = faire_requete_cloudscraper()
    if not html:
        print("💥 Impossible d'accéder au site. Pause de 5 minutes.")
        time.sleep(300)
        return
    nouvelles_annonces = extraire_annonces(html)
    for annonce in nouvelles_annonces:
        if annonce['id'] not in ids_connus:
            print(f"🎯 NOUVELLE ANNONCE: {annonce['titre']}")
            envoyer_notification(annonce)
            annonces_connues.append(annonce)
    # Nettoyer les anciennes annonces (> 24h)
    maintenant = time.time()
    annonces_connues = [a for a in annonces_connues if maintenant - a.get('timestamp', 0) < 86400]
    sauvegarder_annonces(annonces_connues[-150:])

if __name__ == "__main__":
    print("🛡️  Lancement du script avec cloudscraper (anti-403)")
    compteur = 0
    while True:
        try:
            compteur += 1
            print(f"\n🔍 Vérification #{compteur} - {time.strftime('%H:%M:%S')}")
            surveiller()
            delai = INTERVALLE + random.randint(-10, 10)
            time.sleep(max(30, delai))
        except KeyboardInterrupt:
            print("\n🛑 Arrêt demandé")
            break
        except Exception as e:
            print(f"💥 Erreur: {e} - Pause de 2 minutes")
            time.sleep(120)