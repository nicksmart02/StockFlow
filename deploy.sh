#!/bin/bash
# ============================================
# StockFlow - Script de déploiement
# GitHub + Vercel
# ============================================

set -e

echo "🚀 Déploiement StockFlow..."

# ---- CONFIGURATION ----
GITHUB_USER="nicksmart02"
REPO_NAME="StockFlow"
BRANCH="main"

# ---- 1. Init Git ----
echo "📁 Initialisation Git..."
git init
git config user.email "jahadjitse@gmail.com"
git config user.name "nicksmart02"
git checkout -b main 2>/dev/null || git checkout main

# ---- 2. Commit files ----
echo "📝 Commit des fichiers..."
git add -A
git commit -m "feat: StockFlow v1.0 - Gestion de stock complète

- Tableau de bord avec KPIs temps réel
- Gestion produits (CRUD, tout type de marchandise)
- Gestion stock avec alertes rupture et stock faible
- Module ventes multi-articles
- Rapports avec graphiques Chart.js
- Export Excel (SheetJS) et PDF (jsPDF)
- Base de données Supabase PostgreSQL
- Responsive web & mobile"

# ---- 3. Create GitHub repo and push ----
echo "🐙 Création du dépôt GitHub..."
if command -v gh &> /dev/null; then
  gh repo create "$REPO_NAME" --public --description "Application web de gestion de stock - Supabase + Vercel" --push --source=. 2>/dev/null || {
    echo "Repo existe déjà, on push..."
    git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git" 2>/dev/null || true
    git push -u origin main --force
  }
else
  echo "⚠️  gh CLI non disponible. Configuration manuelle:"
  echo "   git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
  echo "   git push -u origin main"
fi

# ---- 4. Deploy to Vercel ----
echo "▲ Déploiement Vercel..."
if command -v vercel &> /dev/null; then
  vercel --prod --yes --name "$REPO_NAME" 2>/dev/null || vercel --prod --yes
elif command -v npx &> /dev/null; then
  npx vercel --prod --yes --name "$REPO_NAME"
else
  echo "⚠️  vercel CLI non disponible."
  echo "   Installe-le: npm i -g vercel"
  echo "   Puis: vercel --prod"
fi

echo ""
echo "✅ Déploiement terminé !"
echo "🌐 URL: https://$REPO_NAME.vercel.app (ou similaire)"
