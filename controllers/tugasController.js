const db = require("../models/db");
const jwt = require('jsonwebtoken');

// Admin - Buat tugas baru untuk user
exports.createTugas = (req, res) => {
    const { user_id, judul, deskripsi, tanggal_deadline } = req.body;
    const admin_id = req.user.id; 

    if (!user_id || !judul || !tanggal_deadline || !admin_id) {
        return res.status(400).json({ error: 'user_id, judul, tanggal_deadline, dan admin_id wajib diisi.' });
    }

    const query = `
        INSERT INTO tugas (user_id, judul, deskripsi, tanggal_diberikan, tanggal_deadline, admin_id)
        VALUES (?, ?, ?, CURDATE(), ?, ?)
    `;

    db.query(query, [user_id, judul, deskripsi, tanggal_deadline, admin_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Tugas berhasil dibuat.', tugasId: result.insertId });
    });
};

// Admin - Melihat semua tugas (semua user)
exports.getAllTugas = (req, res) => {
    const query = `
        SELECT 
            tugas.*, 
            pengguna.nama_lengkap AS nama_pengguna,
            admin.nama_lengkap AS nama_admin
        FROM tugas 
        JOIN pengguna ON tugas.user_id = pengguna.id
        LEFT JOIN pengguna AS admin ON tugas.admin_id = admin.id
        ORDER BY tugas.tanggal_deadline ASC
    `;

    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};


// Admin - Melihat tugas berdasarkan ID tugas
exports.getTugasById = (req, res) => {
    const tugasId = req.params.tugasId;
    const query = `SELECT * FROM tugas WHERE id = ?`;

    db.query(query, [tugasId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) {
            return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
        }
        res.json(result[0]);
    });
};

// Admin - Update tugas (status, judul, deskripsi, tanggal deadline)
exports.updateTugas = (req, res) => {
    const tugasId = req.params.tugasId;
    const { judul, deskripsi, tanggal_deadline } = req.body;
  
    if (!judul || !tanggal_deadline) {
      return res.status(400).json({ error: 'Judul dan deadline wajib diisi.' });
    }
  
    const query = `UPDATE tugas SET judul = ?, deskripsi = ?, tanggal_deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  
    db.query(query, [judul, deskripsi, tanggal_deadline, tugasId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
      }
      res.json({ message: 'Tugas berhasil diperbarui.' });
    });
  };
  

// Admin - Hapus tugas
exports.deleteTugas = (req, res) => {
    const tugasId = req.params.tugasId;

    const query = `DELETE FROM tugas WHERE id = ?`;

    db.query(query, [tugasId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
        }
        res.json({ message: 'Tugas berhasil dihapus.' });
    });
};


// User - Melihat semua tugas mereka
exports.getTugasByUser = (req, res) => {
  const userId = req.params.userId;

  const query = `SELECT * FROM tugas WHERE user_id = ? ORDER BY tanggal_deadline ASC`;

  db.query(query, [userId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
  });
};

// User - Update status tugas mereka dengan validasi token
exports.updateStatusTugas = (req, res) => {
    const tugasId = req.params.tugasId;
    const { status } = req.body;

    const allowedStatus = ['belum_dikerjakan', 'sedang_dikerjakan', 'selesai'];
    if (!allowedStatus.includes(status)) {
        return res.status(400).json({ error: 'Status tidak valid. Pilihan: belum_dikerjakan, sedang_dikerjakan, selesai.' });
    }

    // Ambil token dari header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token tidak ditemukan atau tidak valid.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verifikasi token
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Pastikan env JWT_SECRET sudah diatur
        const userId = decoded.id; // Sesuaikan field ID user di payload token kamu

        // Cek apakah tugas milik user tersebut
        const selectQuery = `SELECT * FROM tugas WHERE id = ? AND user_id = ?`;
        db.query(selectQuery, [tugasId, userId], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            if (result.length === 0) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses untuk mengubah tugas ini.' });
            }

            // Kalau benar milik dia, update status
            const updateQuery = `UPDATE tugas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            db.query(updateQuery, [status, tugasId], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });

                res.json({ message: 'Status tugas berhasil diperbarui.' });
            });
        });
    } catch (error) {
        return res.status(401).json({ error: 'Token tidak valid.' });
    }
};