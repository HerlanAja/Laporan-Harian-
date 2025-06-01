// controllers/profileController.js
const db = require('../models/db');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Konfigurasi Multer langsung di sini
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let folder = '';
    if (file.fieldname === 'visi_misi_image') {
      folder = 'uploads/visi_misi';
    } else if (file.fieldname === 'berakhlak_image') {
      folder = 'uploads/berakhlak';
    }
    fs.mkdirSync(folder, { recursive: true }); 
    cb(null, folder);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });
exports.upload = upload;

// CREATE
exports.createProfile = (req, res) => {
  const newVisiMisi = req.files['visi_misi_image']?.[0]?.path;
  const newBerakhlak = req.files['berakhlak_image']?.[0]?.path;

  if (!newVisiMisi && !newBerakhlak) {
    return res.status(400).json({ error: 'At least one image is required' });
  }

  // Cek apakah profile sudah ada
  db.query('SELECT * FROM profile LIMIT 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (rows.length > 0) {
      // Profile sudah ada → update
      const existing = rows[0];

      if (newVisiMisi && fs.existsSync(existing.visi_misi_image)) {
        fs.unlinkSync(existing.visi_misi_image);
      }
      if (newBerakhlak && fs.existsSync(existing.berakhlak_image)) {
        fs.unlinkSync(existing.berakhlak_image);
      }

      const sql = `
        UPDATE profile
        SET 
          visi_misi_image = COALESCE(?, visi_misi_image),
          berakhlak_image = COALESCE(?, berakhlak_image),
          updated_at = NOW()
        WHERE id = ?
      `;
      db.query(sql, [newVisiMisi, newBerakhlak, existing.id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Profile updated', id: existing.id });
      });

    } else {
      // Tidak ada profile → insert
      const sql = `
        INSERT INTO profile (visi_misi_image, berakhlak_image)
        VALUES (?, ?)
      `;
      db.query(sql, [newVisiMisi || null, newBerakhlak || null], (err3, result) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ message: 'Profile created', id: result.insertId });
      });
    }
  });
};


// READ semua
exports.getAllProfile = (req, res) => {
  db.query("SELECT * FROM profile", (err, results) => {
    if (err) return res.status(500).json({ message: "Gagal mengambil data profile", error: err });
    res.status(200).json({ message: "Data profile berhasil diambil", data: results });
  });
};

// READ - Visi Misi saja
exports.getVisiMisi = (req, res) => {
  db.query('SELECT visi_misi_image FROM profile LIMIT 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'No profile found' });
    res.json({ visi_misi_image: rows[0].visi_misi_image });
  });
};

// READ - Berakhlak saja
exports.getBerakhlak = (req, res) => {
  db.query('SELECT berakhlak_image FROM profile LIMIT 1', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'No profile found' });
    res.json({ berakhlak_image: rows[0].berakhlak_image });
  });
};

// UPDATE - dengan hapus gambar lama
exports.updateProfile = (req, res) => {
  const { id } = req.params;
  const newVisiMisi = req.files['visi_misi_image']?.[0]?.path;
  const newBerakhlak = req.files['berakhlak_image']?.[0]?.path;

  db.query('SELECT * FROM profile WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'Profile not found' });

    const oldVisiMisi = rows[0].visi_misi_image;
    const oldBerakhlak = rows[0].berakhlak_image;

    if (newVisiMisi && fs.existsSync(oldVisiMisi)) fs.unlinkSync(oldVisiMisi);
    if (newBerakhlak && fs.existsSync(oldBerakhlak)) fs.unlinkSync(oldBerakhlak);

    const sql = `
      UPDATE profile 
      SET 
        visi_misi_image = COALESCE(?, visi_misi_image),
        berakhlak_image = COALESCE(?, berakhlak_image),
        updated_at = NOW()
      WHERE id = ?
    `;

    db.query(sql, [newVisiMisi, newBerakhlak, id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: 'Profile updated' });
    });
  });
};

// DELETE
exports.deleteProfile = (req, res) => {
  const { id } = req.params;

  db.query('SELECT * FROM profile WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'Profile not found' });

    const { visi_misi_image, berakhlak_image } = rows[0];

    if (fs.existsSync(visi_misi_image)) fs.unlinkSync(visi_misi_image);
    if (fs.existsSync(berakhlak_image)) fs.unlinkSync(berakhlak_image);

    db.query('DELETE FROM profile WHERE id = ?', [id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: 'Profile deleted' });
    });
  });
};
