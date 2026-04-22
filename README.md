# 📦 StockFlow

Application web de gestion de stock — responsive web & mobile.

## Fonctionnalités

- **Tableau de bord** : KPIs en temps réel (valeur stock, CA, marge, alertes)
- **Produits** : CRUD complet — n'importe quel type de produit, catégorie libre
- **Stock** : Suivi des niveaux, alertes rupture et stock faible, mouvements
- **Ventes** : Enregistrement multi-articles, historique, détails par vente
- **Rapports** : Graphiques Chart.js, statistiques financières
- **Export Excel** : Via SheetJS (XLSX), multi-feuilles
- **Export PDF** : Via jsPDF + autoTable, avec en-têtes et tableaux formatés
- **Temps réel** : Synchronisation Supabase Realtime

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML5 / CSS3 / JavaScript vanilla |
| Base de données | Supabase (PostgreSQL) |
| Déploiement | Vercel |
| Graphiques | Chart.js 4 |
| Export Excel | SheetJS (xlsx) |
| Export PDF | jsPDF + jsPDF-AutoTable |

## Structure

```
stockflow/
├── index.html    # Structure HTML, imports CDN
├── style.css     # Thème dark, responsive
├── script.js     # Logique app, Supabase, exports
└── vercel.json   # Config déploiement
```

## Base de données (Supabase)

Tables créées :
- `categories` — catégories de produits
- `suppliers` — fournisseurs
- `products` — produits avec prix, stock, icône, SKU
- `stock_movements` — historique des mouvements
- `sales` — ventes
- `sale_items` — lignes de vente
- `settings` — paramètres de l'application
