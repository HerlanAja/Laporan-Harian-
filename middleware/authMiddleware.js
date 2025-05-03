const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Cek apakah header Authorization ada dan formatnya benar
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Akses ditolak! Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  // Pastikan JWT_SECRET tersedia
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET tidak ditemukan di .env');
    return res.status(500).json({ message: 'Konfigurasi server tidak lengkap.' });
  }

  try {
    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Pastikan token memuat ID pengguna
    if (!decoded.id) {
      return res.status(400).json({ message: 'Token tidak valid: ID tidak ditemukan.' });
    }

    // Simpan data user dari token ke request
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Akses ditolak! Token tidak valid.', error: error.message });
  }
};

module.exports = authMiddleware;
