// shooting-manager-backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Pool de connexion MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==================== ROUTES ====================

// ✅ GET - Tous les shootings
app.get('/api/shootings', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [shootings] = await connection.query(`
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
    connection.release();
    res.json(shootings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Tous les types
app.get('/api/types', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [types] = await connection.query(
      'SELECT id, nom, couleur FROM shooting_types ORDER BY nom'
    );
    connection.release();
    res.json(types);
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
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'INSERT INTO shooting_types (nom, couleur) VALUES (?, ?)',
      [nom, couleur]
    );
    connection.release();
    
    res.status(201).json({
      id: result.insertId,
      nom,
      couleur
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ce type existe déjà' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Un shooting spécifique
app.get('/api/shootings/:id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [shootings] = await connection.query(
      'SELECT * FROM shootings WHERE id = ?',
      [req.params.id]
    );
    connection.release();
    if (shootings.length === 0) {
      return res.status(404).json({ error: 'Shooting non trouvé' });
    }
    res.json(shootings[0]);
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
    const connection = await pool.getConnection();
    
    const TAX_RATE = 0.967;
    const pct = pourcentage_agence || 15;
    let montant_final = parseFloat(montant);

    if (categorie === 'agence') {
      const apresImpots = montant_final * TAX_RATE;
      const fraisAgence = montant_final * (pct / 100);
      montant_final = apresImpots - fraisAgence;
    }

    const [result] = await connection.query(
      'INSERT INTO shootings (nom, date, montant, categorie, pourcentage_agence, montant_final, type_id, notes, paye) VALUES (?, ?, ?, ?, ?, ?, ?, ?, false)',
      [nom, date, montant, categorie || 'agence', pct, montant_final, type_id, notes || '']
    );
    
    const [newShooting] = await connection.query(`
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
      WHERE s.id = ?
    `, [result.insertId]);

    connection.release();
    
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
    const connection = await pool.getConnection();
    
    const TAX_RATE = 0.967;
    const pct = pourcentage_agence || 15;
    let montant_final = parseFloat(montant);

    if (categorie === 'agence') {
      const apresImpots = montant_final * TAX_RATE;
      const fraisAgence = montant_final * (pct / 100);
      montant_final = apresImpots - fraisAgence;
    }

    await connection.query(
      'UPDATE shootings SET nom = ?, date = ?, montant = ?, categorie = ?, pourcentage_agence = ?, montant_final = ?, type_id = ?, notes = ?, paye = ? WHERE id = ?',
      [nom, date, montant, categorie, pct, montant_final, type_id, notes || '', paye || false, req.params.id]
    );
    
    const [updatedShooting] = await connection.query(`
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
      WHERE s.id = ?
    `, [req.params.id]);

    connection.release();
    
    res.json(updatedShooting[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ DELETE - Supprimer un shooting
app.delete('/api/shootings/:id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM shootings WHERE id = ?', [req.params.id]);
    connection.release();
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
    const connection = await pool.getConnection();
    
    // Montant reçu ce mois (payés)
    const [receivedMonth] = await connection.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE paye = true
      AND MONTH(date) = MONTH(CURDATE())
      AND YEAR(date) = YEAR(CURDATE())
    `);

    // Montant généré ce mois (payés + impayés)
    const [generatedMonth] = await connection.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE MONTH(date) = MONTH(CURDATE())
      AND YEAR(date) = YEAR(CURDATE())
    `);

    // Montant impayé TOTAL (tous les mois)
    const [unpaidTotal] = await connection.query(`
      SELECT COALESCE(SUM(montant_final), 0) as montant
      FROM shootings
      WHERE paye = false
    `);

    // Nombre de shoots
    const [counts] = await connection.query(`
      SELECT 
        COUNT(CASE WHEN paye = true AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) THEN 1 END) as shoots_payes,
        COUNT(CASE WHEN paye = false THEN 1 END) as shoots_impaye,
        COUNT(CASE WHEN MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) THEN 1 END) as nombre_shoots
      FROM shootings
    `);

    connection.release();

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
    const connection = await pool.getConnection();

    const [stats] = await connection.query(`
      SELECT 
        categorie,
        COUNT(*) as nombre,
        SUM(montant_final) as total
      FROM shootings
      WHERE MONTH(date) = MONTH(CURDATE())
      AND YEAR(date) = YEAR(CURDATE())
      GROUP BY categorie
    `);

    connection.release();
    res.json(stats || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Timeline par mois (pour graphique)
app.get('/api/stats/timeline', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [stats] = await connection.query(`
      SELECT 
        DATE_FORMAT(date, '%Y-%m') as mois,
        SUM(montant_final) as montant
      FROM shootings
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY mois ASC
    `);

    connection.release();
    res.json(stats || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});



// ==================== ROUTES PAIEMENTS ====================

// ✅ GET - Tous les paiements
app.get('/api/payments', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [payments] = await connection.query(`
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
      const [shootings] = await connection.query(
        'SELECT s.* FROM shootings s JOIN shooting_payments sp ON s.id = sp.shooting_id WHERE sp.payment_id = ?',
        [payment.id]
      );
      payment.shootings = shootings;
    }

    connection.release();
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
    const connection = await pool.getConnection();

    // Calculer le montant total des shootings
    const [shootings] = await connection.query(
      'SELECT SUM(montant_final) as total FROM shootings WHERE id IN (?)',
      [shooting_ids]
    );

    const montant = shootings[0].total || 0;

    // Créer le paiement
    const [paymentResult] = await connection.query(
      'INSERT INTO payments (date_paiement, montant) VALUES (?, ?)',
      [date_paiement, montant]
    );

    const payment_id = paymentResult.insertId;

    // Associer les shootings au paiement
    for (let shooting_id of shooting_ids) {
      await connection.query(
        'INSERT INTO shooting_payments (shooting_id, payment_id) VALUES (?, ?)',
        [shooting_id, payment_id]
      );
      // Marquer le shooting comme payé
      await connection.query(
        'UPDATE shootings SET paye = true WHERE id = ?',
        [shooting_id]
      );
    }

    connection.release();

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
    const connection = await pool.getConnection();

    // Récupérer les shootings avant suppression
    const [shootings] = await connection.query(
      'SELECT shooting_id FROM shooting_payments WHERE payment_id = ?',
      [req.params.id]
    );

    // Supprimer le paiement (cascade supprime shooting_payments)
    await connection.query('DELETE FROM payments WHERE id = ?', [req.params.id]);

    // Marquer les shootings comme impayés
    for (let row of shootings) {
      await connection.query(
        'UPDATE shootings SET paye = false WHERE id = ?',
        [row.shooting_id]
      );
    }

    connection.release();
    res.json({ message: 'Paiement supprimé' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Timeline des paiements par mois
app.get('/api/stats/payments-timeline', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [stats] = await connection.query(`
      SELECT 
        DATE_FORMAT(date_paiement, '%Y-%m') as mois,
        SUM(montant) as montant,
        COUNT(*) as nombre_paiements
      FROM payments
      GROUP BY DATE_FORMAT(date_paiement, '%Y-%m')
      ORDER BY mois ASC
    `);

    connection.release();
    res.json(stats || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET - Shootings impayés (pour le formulaire de paiement)
app.get('/api/shootings/unpaid', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [shootings] = await connection.query(
      'SELECT * FROM shootings WHERE paye = false ORDER BY date DESC'
    );
    connection.release();
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
/*app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});*/

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});