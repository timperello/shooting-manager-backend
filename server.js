// shooting-manager-backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Remplacez app.use(cors()); par :
app.use(cors({
  origin: [ 
    'https://shooting-manager-frontend-txze-alpha.vercel.app' 
  ],
  credentials: true
}));
app.use(express.json());

// Pool de connexion PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false // Requis par Supabase en production
  }
});

// ==================== ROUTES ====================

// ✅ GET - Tous les shootings
app.get('/api/shootings', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        s.id,
        s.nom,
        s.date,
        s.montant,
        s.montant_final,
        s.categorie,
        s.pourcentage_agence,
        s.notes,
        s.paye,
        s.type_id,
        t.nom as type_nom,
        t.couleur as type_couleur
      FROM shootings s
      LEFT JOIN shooting_types t ON s.type_id = t.id
      ORDER BY s.date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Tous les types
app.get('/api/types', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nom, couleur FROM shooting_types ORDER BY nom'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ POST - Créer un nouveau type
app.post('/api/types', async (req, res) => {
  const { nom, couleur } = req.body;

  if (!nom || !couleur) {
    return res.status(400).json({ error: 'Nom et couleur requis' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO shooting_types (nom, couleur) VALUES ($1, $2) RETURNING *',
      [nom, couleur]
    );
    
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Code d'erreur contrainte unique sous PostgreSQL
      return res.status(400).json({ error: 'Ce type existe déjà' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Un shooting spécifique
app.get('/api/shootings/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM shootings WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Shooting non trouvé' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ POST - Créer un nouveau shooting
app.post('/api/shootings', async (req, res) => {
  const { nom, date, montant, categorie, pourcentage_agence, type_id, notes } = req.body;

  if (!nom || !date || !montant || !type_id) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  try {
    const TAX_RATE = 0.967;
    const pct = pourcentage_agence || 15;
    let montant_final = parseFloat(montant);

    if (categorie === 'agence') {
      const apresImpots = montant_final * TAX_RATE;
      const fraisAgence = montant_final * (pct / 100);
      montant_final = apresImpots - fraisAgence;
    }

    const insertResult = await pool.query(
      'INSERT INTO shootings (nom, date, montant, categorie, pourcentage_agence, montant_final, type_id, notes, paye) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) RETURNING id',
      [nom, date, montant, categorie || 'agence', pct, montant_final, type_id, notes || '']
    );
    
    const newId = insertResult.rows[0].id;

    const { rows: newShooting } = await pool.query(`
      SELECT 
        s.id,
        s.nom,
        s.date,
        s.montant,
        s.montant_final,
        s.categorie,
        s.pourcentage_agence,
        s.notes,
        s.paye,
        s.type_id,
        t.nom as type_nom,
        t.couleur as type_couleur
      FROM shootings s
      LEFT JOIN shooting_types t ON s.type_id = t.id
      WHERE s.id = $1
    `, [newId]);

    res.status(201).json(newShooting[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ PUT - Mettre à jour un shooting
app.put('/api/shootings/:id', async (req, res) => {
  const { nom, date, montant, categorie, pourcentage_agence, type_id, notes, paye } = req.body;

  try {
    const TAX_RATE = 0.967;
    const pct = pourcentage_agence || 15;
    let montant_final = parseFloat(montant);

    if (categorie === 'agence') {
      const apresImpots = montant_final * TAX_RATE;
      const fraisAgence = montant_final * (pct / 100);
      montant_final = apresImpots - fraisAgence;
    }

    await pool.query(
      'UPDATE shootings SET nom = $1, date = $2, montant = $3, categorie = $4, pourcentage_agence = $5, montant_final = $6, type_id = $7, notes = $8, paye = $9 WHERE id = $10',
      [nom, date, montant, categorie, pct, montant_final, type_id, notes || '', paye || false, req.params.id]
    );
    
    const { rows: updatedShooting } = await pool.query(`
      SELECT 
        s.id,
        s.nom,
        s.date,
        s.montant,
        s.montant_final,
        s.categorie,
        s.pourcentage_agence,
        s.notes,
        s.paye,
        s.type_id,
        t.nom as type_nom,
        t.couleur as type_couleur
      FROM shootings s
      LEFT JOIN shooting_types t ON s.type_id = t.id
      WHERE s.id = $1
    `, [req.params.id]);

    res.json(updatedShooting[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ DELETE - Supprimer un shooting
app.delete('/api/shootings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM shootings WHERE id = $1', [req.params.id]);
    res.json({ message: 'Shooting supprimé' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES STATS ====================

// ✅ GET - Stats du mois courant
app.get('/api/stats/current-month', async (req, res) => {
  try {
    // Montant reçu ce mois (payés)
    const { rows: receivedMonth } = await pool.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE paye = true
      AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    // Montant généré ce mois (payés + impayés)
    const { rows: generatedMonth } = await pool.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    // Montant impayé TOTAL (tous les mois)
    const { rows: unpaidTotal } = await pool.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE paye = false
    `);

    // Nombre de shoots
    const { rows: counts } = await pool.query(`
      SELECT 
        COUNT(CASE WHEN paye = true AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN 1 END) as shoots_payes,
        COUNT(CASE WHEN paye = false THEN 1 END) as shoots_impaye,
        COUNT(CASE WHEN EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN 1 END) as nombre_shoots
      FROM shootings
    `);

    res.json({
      montant_recu: receivedMonth[0].montant,
      montant_genere: generatedMonth[0].montant,
      montant_attente: unpaidTotal[0].montant,
      shoots_payes: counts[0].shoots_payes,
      shoots_impaye: counts[0].shoots_impaye,
      nombre_shoots: counts[0].nombre_shoots
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Revenu par catégorie (ce mois)
app.get('/api/stats/by-category', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        categorie,
        COUNT(*) as nombre,
        SUM(montant_final) as total
      FROM shootings
      WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY categorie
    `);

    res.json(rows || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Timeline par mois (pour graphique)
app.get('/api/stats/timeline', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        TO_CHAR(date, 'YYYY-MM') as mois,
        SUM(montant_final) as montant
      FROM shootings
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY mois ASC
    `);

    res.json(rows || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES PAIEMENTS ====================

// ✅ GET - Tous les paiements
app.get('/api/payments', async (req, res) => {
  try {
    const { rows: payments } = await pool.query(`
      SELECT 
        p.id,
        p.date_paiement,
        p.montant,
        p.created_at,
        COUNT(sp.shooting_id) as nombre_shoots
      FROM payments p
      LEFT JOIN shooting_payments sp ON p.id = sp.payment_id
      GROUP BY p.id
      ORDER BY p.date_paiement DESC
    `);

    // Pour chaque paiement, récupère les shootings associés
    for (let payment of payments) {
      const { rows: shootings } = await pool.query(
        'SELECT s.* FROM shootings s JOIN shooting_payments sp ON s.id = sp.shooting_id WHERE sp.payment_id = $1',
        [payment.id]
      );
      payment.shootings = shootings;
    }

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ POST - Créer un paiement
app.post('/api/payments', async (req, res) => {
  const { date_paiement, shooting_ids } = req.body;

  if (!date_paiement || !shooting_ids || shooting_ids.length === 0) {
    return res.status(400).json({ error: 'Date et shootings requis' });
  }

  try {
    // Calculer le montant total des shootings
    const { rows: shootings } = await pool.query(
      'SELECT SUM(montant_final) as total FROM shootings WHERE id = ANY($1::int[])',
      [shooting_ids]
    );

    const montant = shootings[0].total || 0;

    // Créer le paiement
    const paymentResult = await pool.query(
      'INSERT INTO payments (date_paiement, montant) VALUES ($1, $2) RETURNING id',
      [date_paiement, montant]
    );

    const payment_id = paymentResult.rows[0].id;

    // Associer les shootings au paiement
    for (let shooting_id of shooting_ids) {
      await pool.query(
        'INSERT INTO shooting_payments (shooting_id, payment_id) VALUES ($1, $2)',
        [shooting_id, payment_id]
      );
      // Marquer le shooting comme payé
      await pool.query(
        'UPDATE shootings SET paye = true WHERE id = $1',
        [shooting_id]
      );
    }

    res.status(201).json({
      id: payment_id,
      date_paiement,
      montant,
      nombre_shoots: shooting_ids.length,
      shootings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ DELETE - Supprimer un paiement
app.delete('/api/payments/:id', async (req, res) => {
  try {
    // Récupérer les shootings avant suppression
    const { rows: shootings } = await pool.query(
      'SELECT shooting_id FROM shooting_payments WHERE payment_id = $1',
      [req.params.id]
    );

    // Supprimer le paiement (cascade supprime shooting_payments)
    await pool.query('DELETE FROM payments WHERE id = $1', [req.params.id]);

    // Marquer les shootings comme impayés
    for (let row of shootings) {
      await pool.query(
        'UPDATE shootings SET paye = false WHERE id = $1',
        [row.shooting_id]
      );
    }

    res.json({ message: 'Paiement supprimé' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Timeline des paiements par mois
app.get('/api/stats/payments-timeline', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        TO_CHAR(date_paiement, 'YYYY-MM') as mois,
        SUM(montant) as montant,
        COUNT(*) as nombre_paiements
      FROM payments
      GROUP BY TO_CHAR(date_paiement, 'YYYY-MM')
      ORDER BY mois ASC
    `);

    res.json(rows || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Shootings impayés (pour le formulaire de paiement)
app.get('/api/shootings/unpaid', async (req, res) => {
  try {
    const { rows: shootings } = await pool.query(
      'SELECT * FROM shootings WHERE paye = false ORDER BY date DESC'
    );
    res.json(shootings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur `);
});

