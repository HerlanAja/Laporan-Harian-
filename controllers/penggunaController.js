const db = require('../models/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Fungsi validasi password
const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
    return passwordRegex.test(password);
};

// Pastikan folder uploads/tandatangan ada
const uploadDir = 'uploads/tandatangan/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi Multer untuk Upload Tanda Tangan
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Filter hanya menerima file gambar
const fileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
    }
    cb(null, true);
};

const upload = multer({ storage, fileFilter }).single('tandatangan');

// Fungsi Tambah Pengguna dengan Validasi Password
exports.tambahPengguna = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: 'Gagal mengupload tanda tangan', error: err.message });

        const { nama_lengkap, nip, email, password, username, role } = req.body;
        const tandatangan = req.file ? req.file.path : null;

        // Validasi password
        if (!isValidPassword(password)) {
            return res.status(400).json({
                message: "Password harus minimal 8 karakter, mengandung huruf besar, angka, dan karakter unik (!@#$%^&*)"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = 'INSERT INTO pengguna (nama_lengkap, nip, email, password, username, role, tandatangan) VALUES (?, ?, ?, ?, ?, ?, ?)';

        db.query(sql, [nama_lengkap, nip, email, hashedPassword, username, role || 'pengguna', tandatangan], (err, result) => {
            if (err) return res.status(500).json({ message: 'Gagal menambahkan pengguna', error: err });
            res.json({ message: 'Pengguna berhasil ditambahkan!', userId: result.insertId });
        });
    });
};


// Fungsi Get Semua Pengguna atau Pengguna berdasarkan ID
exports.getPengguna = (req, res) => {
    const { id } = req.params;

    let sql = 'SELECT id, nama_lengkap, nip, email, username, role, tandatangan FROM pengguna';
    let params = [];

    if (id) {
        sql += ' WHERE id = ?';
        params.push(id);
    }

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ message: 'Gagal mengambil data pengguna', error: err });

        if (id && results.length === 0) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
        }

        res.json({ message: 'Data pengguna berhasil diambil!', data: results });
    });
};


// Fungsi Login Pengguna dengan Username
exports.loginPengguna = (req, res) => {
    console.log('Isi req.body:', req.body);

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password wajib diisi!' });
    }

    db.query(
        "SELECT id, nama_lengkap, nip, password, role FROM pengguna WHERE BINARY username = ?", 
        [username], 
        async (err, results) => {
            if (err) {
                console.error('Kesalahan Query:', err);
                return res.status(500).json({ message: 'Login gagal', error: err });
            }

            if (results.length === 0) {
                return res.status(401).json({ message: 'Username tidak ditemukan!' });
            }

            const user = results[0];

            try {
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(401).json({ message: 'Password salah!' });
                }

                // Buat token JWT dengan tambahan `nama_lengkap` dan `nip`
                const token = jwt.sign(
                    { id: user.id, nama_lengkap: user.nama_lengkap, nip: user.nip, role: user.role },
                    process.env.JWT_SECRET || "secret_key",
                    { expiresIn: "1d" }
                );

                res.json({
                    message: 'Login berhasil!',
                    token,
                    user: {
                        id: user.id,
                        nama_lengkap: user.nama_lengkap,
                        nip: user.nip,
                        role: user.role
                    }
                });
            } catch (error) {
                console.error('Kesalahan saat membandingkan password:', error);
                return res.status(500).json({ message: 'Terjadi kesalahan saat login' });
            }
        }
    );
};


exports.editPengguna = (req, res) => {
    const { id } = req.params;
    const { nama_lengkap, nip, email, username } = req.body;

    // Ambil data pengguna saat ini untuk mengetahui nilai yang tidak diubah
    db.query('SELECT * FROM pengguna WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Gagal mengambil data pengguna', error: err });

        if (results.length === 0) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
        }

        const existingUser = results[0];

        // Gunakan data lama jika field kosong (null/undefined)
        const updatedNamaLengkap = nama_lengkap !== undefined ? nama_lengkap : existingUser.nama_lengkap;
        const updatedNip = nip !== undefined ? nip : existingUser.nip;
        const updatedEmail = email !== undefined ? email : existingUser.email;
        const updatedUsername = username !== undefined ? username : existingUser.username;

        // Update hanya field yang tersedia
        db.query(
            'UPDATE pengguna SET nama_lengkap=?, nip=?, email=?, username=? WHERE id=?',
            [updatedNamaLengkap, updatedNip, updatedEmail, updatedUsername, id],
            (err, result) => {
                if (err) return res.status(500).json({ message: 'Gagal mengedit pengguna', error: err });

                res.json({ message: 'Pengguna berhasil diperbarui!' });
            }
        );
    });
};


// Fungsi Hapus Pengguna
exports.hapusPengguna = (req, res) => {
    const { id } = req.params;

    db.query('SELECT tandatangan FROM pengguna WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Gagal menghapus pengguna', error: err });

        if (results.length > 0 && results[0].tandatangan) {
            fs.unlink(results[0].tandatangan, (err) => {
                if (err) console.error('Gagal menghapus tanda tangan:', err);
            });
        }

        db.query('DELETE FROM pengguna WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ message: 'Gagal menghapus pengguna', error: err });
            res.json({ message: 'Pengguna berhasil dihapus!' });
        });
    });
};

// Fungsi Reset Password dengan Validasi
exports.resetPassword = async (req, res) => {
    const { id } = req.params;
    const { password_baru } = req.body;

    try {
        // Validasi password baru
        if (!isValidPassword(password_baru)) {
            return res.status(400).json({
                message: "Password harus minimal 8 karakter, mengandung huruf besar, angka, dan karakter unik (!@#$%^&*)"
            });
        }

        // Cek apakah pengguna dengan ID tersebut ada
        const userCheckQuery = 'SELECT id FROM pengguna WHERE id = ?';
        const [userExists] = await new Promise((resolve, reject) => {
            db.query(userCheckQuery, [id], (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        if (userExists.length === 0) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan!' });
        }

        // Hash password baru sebelum menyimpan ke database
        const hashedPassword = await bcrypt.hash(password_baru, 10);
        const updatePasswordQuery = 'UPDATE pengguna SET password = ? WHERE id = ?';

        await new Promise((resolve, reject) => {
            db.query(updatePasswordQuery, [hashedPassword, id], (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.json({ message: 'Password berhasil direset!' });
    } catch (error) {
        console.error('Error saat reset password:', error);
        res.status(500).json({ message: 'Gagal reset password', error });
    }
};

// Fungsi untuk menghitung jumlah total pengguna
exports.jumlahPengguna = (req, res) => {
    const sql = 'SELECT COUNT(*) AS total FROM pengguna';

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Gagal menghitung jumlah pengguna', error: err });
        }

        res.json({ message: 'Jumlah pengguna berhasil dihitung', total: results[0].total });
    });
};