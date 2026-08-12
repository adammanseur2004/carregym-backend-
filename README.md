# 🏋️ Carré Gym - Backend + Tableau de Bord Admin

Site web complet avec **backend Node.js**, **base de données SQLite**, et **tableau de bord administrateur** pour gérer les réservations.

---

## 📁 Structure du projet

```
carre-gym-backend/
├── server.js              # Serveur Express (backend)
├── package.json           # Dépendances Node.js
├── .env.example           # Variables d'environnement
├── database.sqlite        # Base de données (créée auto)
└── public/
    ├── index.html         # Site principal (client)
    ├── admin-login.html   # Page connexion admin
    ├── admin.html         # Tableau de bord admin
    ├── admin.js           # Logique du dashboard
    ├── style.css          # Styles admin
    └── carre_gym_logo.png # Logo officiel
```

---

## 🚀 Installation locale

### 1. Prérequis
- [Node.js](https://nodejs.org) (v18 ou plus)

### 2. Installation

```bash
# 1. Extraire le dossier carre-gym-backend
cd carre-gym-backend

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env
cp .env.example .env

# 4. Lancer le serveur
npm start
```

Le site sera accessible sur : `http://localhost:3000`

Le tableau de bord admin : `http://localhost:3000/admin`

---

## 🔐 Accès Admin

- **URL** : `http://localhost:3000/admin`
- **Mot de passe** : `carrgym2026` (modifiable dans `.env`)

---

## 🛠️ Déploiement en ligne (GRATUIT)

### Option A : Render (Recommandé)

1. Créez un compte sur [render.com](https://render.com)
2. Cliquez **"New +"** → **"Web Service"**
3. Connectez votre repo GitHub ou uploadez les fichiers
4. Remplissez :
   - **Name** : `carre-gym`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
5. Cliquez **"Create Web Service"**
6. Dans **Environment Variables**, ajoutez :
   - `ADMIN_PASSWORD` = `votre-mot-de-passe`
   - `JWT_SECRET` = `une-cle-super-secrete`

### Option B : Railway

1. Créez un compte sur [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Ajoutez les variables d'environnement
4. Déployez

---

## 📋 Fonctionnalités

### Site Client (`/`)
- ✅ Présentation de la salle
- ✅ Tarifs
- ✅ **Formulaire de réservation en ligne**
- ✅ Galerie photos
- ✅ Avis clients
- ✅ Horaires & Contact
- ✅ Carte Google Maps

### Tableau de Bord Admin (`/admin`)
- ✅ Authentification sécurisée (JWT)
- ✅ **Stats en temps réel** (Total, Aujourd'hui, En attente, Confirmées)
- ✅ **Liste complète des réservations**
- ✅ Filtres (date, statut, recherche)
- ✅ **Confirmer / Remettre en attente**
- ✅ **Supprimer une réservation**
- ✅ Rafraîchissement auto toutes les 30s

### API Backend
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/reservations` | POST | Créer une réservation |
| `/api/reservations` | GET | Liste (protégé) |
| `/api/reservations/:id` | DELETE | Supprimer (protégé) |
| `/api/reservations/:id` | PATCH | Changer statut (protégé) |
| `/api/admin/stats` | GET | Statistiques (protégé) |
| `/api/admin/login` | POST | Connexion admin |

---

## ⚙️ Personnalisation

### Changer le mot de passe admin

Dans `.env` :
```
ADMIN_PASSWORD=votre-nouveau-mot-de-passe
```

### Changer les couleurs

Dans `public/style.css` (section `:root`) :
```css
--vert: #82b43c;        /* Vert officiel Carré Gym */
--noir: #000000;        /* Noir */
--blanc: #ffffff;       /* Blanc */
```

### Changer les tarifs

Dans `public/index.html`, section **Tarifs**, modifiez :
```html
<div class="price">3000<span> DZD / mois</span></div>
```

### Changer les photos

Dans `public/index.html`, remplacez les URLs `https://images.unsplash.com/...` par vos propres photos.

---

## 🔒 Sécurité

- Mots de passe **jamais** stockés en clair dans le code
- Authentification par **JWT** avec expiration 24h
- Requêtes API protégées par middleware
- SQLite locale (pas de données exposées)
- HTTPS forcé en production (Render/Railway)

---

## 📞 Support

Problème avec le déploiement ? Vérifiez :
1. Le fichier `.env` existe
2. `npm install` a bien fonctionné
3. Le port n'est pas déjà utilisé
4. Les fichiers sont bien dans `public/`

---

**Carré Gym** · Rue Hassiba Ben Bouali, Rouïba · 0556 75 14 08
