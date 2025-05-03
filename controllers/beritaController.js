const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../models/db');

// Konfigurasi penyimpanan gambar menggunakan multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/fotoberita'),
  filename: (req, file, cb) => {
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Validasi tipe file yang diizinkan untuk diunggah
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase()) &&
                  allowedTypes.test(file.mimetype);
  cb(isValid ? null : new Error('Hanya file gambar yang diizinkan!'), isValid);
};

// Middleware upload dengan konfigurasi di atas
const upload = multer({ storage, fileFilter });
exports.upload = upload;

// Tambah berita baru
exports.createBerita = (req, res) => {
  const { category, title, subtitle, date, time } = req.body;
  const image_url = req.file ? `/uploads/fotoberita/${req.file.filename}` : null;

  const insertQuery = `
    INSERT INTO berita (image_url, category, title, subtitle, date, time)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(insertQuery, [image_url, category, title, subtitle, date, time], (err, result) => {
    if (err) return res.status(500).json({ message: 'Gagal menambah berita', error: err });

    const beritaId = result.insertId;
    const userQuery = `SELECT id FROM pengguna WHERE role = 'pengguna'`;

    db.query(userQuery, (err, users) => {
      if (err) return res.status(500).json({ message: 'Berita ditambahkan, gagal mengirim notifikasi', error: err });

      const notifications = users.map(user => [user.id, `Berita baru: ${title}`]);
      if (!notifications.length) {
        return res.status(201).json({ message: 'Berita berhasil ditambahkan tanpa notifikasi', id: beritaId });
      }

      const notifikasiQuery = `INSERT INTO notifikasi (user_id, pesan) VALUES ?`;
      db.query(notifikasiQuery, [notifications], (err) => {
        if (err) return res.status(500).json({ message: 'Berita berhasil, tapi gagal membuat notifikasi', error: err });
        res.status(201).json({ message: 'Berita dan notifikasi berhasil ditambahkan', id: beritaId });
      });
    });
  });
};

// Update data berita
exports.updateBerita = (req, res) => {
  const { id } = req.params;
  const { category, title, subtitle, date, time } = req.body;
  const newImage = req.file ? `/uploads/fotoberita/${req.file.filename}` : null;

  const fields = [];
  const values = [];

  // Tambahkan data yang ingin diperbarui
  if (category) {
    fields.push('category = ?');
    values.push(category);
  }

  if (title) {
    fields.push('title = ?');
    values.push(title);
  }

  if (subtitle) {
    fields.push('subtitle = ?');
    values.push(subtitle);
  }

  if (date) {
    fields.push('date = ?');
    values.push(date);
  }

  if (time) {
    fields.push('time = ?');
    values.push(time);
  }

  if (newImage) {
    fields.push('image_url = ?');
    values.push(newImage);
  }

  // Validasi: jika tidak ada data yang diubah
  if (fields.length === 0) {
    return res.status(400).json({ message: 'Tidak ada data yang diubah' });
  }

  // Fungsi untuk melakukan update
  const updateData = () => {
    const updateQuery = `UPDATE berita SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    db.query(updateQuery, values, (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Gagal memperbarui berita', error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Berita tidak ditemukan' });
      }

      return res.status(200).json({ message: 'Berita berhasil diperbarui' });
    });
  };

  // Jika ada gambar baru, hapus gambar lama terlebih dahulu
  if (newImage) {
    db.query('SELECT image_url FROM berita WHERE id = ?', [id], (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Gagal mengambil data berita', error: err });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Berita tidak ditemukan' });
      }

      const oldImagePath = path.join(__dirname, '..', rows[0].image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      updateData();
    });
  } else {
    updateData();
  }
};

// Ambil semua berita
exports.getAllBerita = (req, res) => {
  db.query('SELECT * FROM berita', (err, results) => {
    if (err) return res.status(500).json({ message: 'Gagal mengambil berita', error: err });
    res.status(200).json(results);
  });
};

// Ambil berita berdasarkan ID
exports.getBeritaById = (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM berita WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ message: 'Gagal mengambil berita', error: err });
    if (!results.length) return res.status(404).json({ message: 'Berita tidak ditemukan' });
    res.status(200).json(results[0]);
  });
};

// Hapus berita
exports.deleteBerita = (req, res) => {
  const { id } = req.params;

  db.query('SELECT image_url FROM berita WHERE id = ?', [id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Gagal mengambil berita', error: err });
    }

    if (!results.length) {
      return res.status(404).json({ message: 'Berita tidak ditemukan' });
    }

    const imageUrl = results[0].image_url;

    // Hapus file gambar jika ada
    if (imageUrl && typeof imageUrl === 'string') {
      const imagePath = path.join(__dirname, '..', imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error('Gagal menghapus gambar:', err);
          } else {
            console.log('Gambar berhasil dihapus');
          }
        });
      }
    }

    // Hapus data berita dari database
    db.query('DELETE FROM berita WHERE id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Gagal menghapus berita', error: err });
      }

      if (!result.affectedRows) {
        return res.status(404).json({ message: 'Berita tidak ditemukan' });
      }

      res.status(200).json({ message: 'Berita berhasil dihapus' });
    });
  });
};