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
    try:
        # Crée le scraper sans le paramètre browser (plus sûr)
        scraper = cloudscraper.create_scraper(delay=random.uniform(0.6, 1.8))
        headers = obtenir_headers_aleatoires()
        params = {
            'period': 'currentSchoolYear',
            'location': '',
            'maxPrice': '',
            '_': str(int(time.time() * 1000)),  # Timestamp
            'rnd': random.randint(1000, 9999)
        }
        url = BASE_URL + '?' + urlencode(params)
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

# le reste du code inchangé
# ...
