const db = require("../models/db");
const multer = require("multer");
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const util = require('util');
const moment = require('moment');


// Konfigurasi penyimpanan file foto kegiatan
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/foto_kegiatan/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage }).single("foto_kegiatan");

const isValidTimeRange = (jam_mulai, jam_selesai) => {
    // Validasi format waktu (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(jam_mulai)) return false;
    if (!timeRegex.test(jam_selesai)) return false;

    // Parse waktu
    const [startHour, startMin] = jam_mulai.split(':').map(Number);
    const [endHour, endMin] = jam_selesai.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Validasi jam kerja: antara 08:00 s.d 16:00
    const workStart = 8 * 60;
    const workEnd = 16 * 60;

    if (startTime < workStart || endTime > workEnd) {
        return false;
    }

    // Validasi waktu selesai harus setelah waktu mulai
    if (endTime <= startTime) {
        return false;
    }

    // Tidak ada validasi kelipatan 30 menit lagi
    return true;
};


// Fungsi untuk mengecek apakah waktu laporan bertabrakan dengan laporan lain
const isTimeSlotAvailable = async (pengguna_id, tanggal, jam_mulai, jam_selesai) => {
    const query = `SELECT COUNT(*) AS count FROM laporan 
                  WHERE pengguna_id = ? AND tanggal = ? 
                  AND ((jam_mulai < ? AND jam_selesai > ?) 
                  OR (jam_mulai < ? AND jam_selesai > ?)
                  OR (jam_mulai >= ? AND jam_selesai <= ?))`;
    
    const [results] = await db.promise().query(query, [
        pengguna_id, 
        tanggal, 
        jam_selesai, jam_mulai,
        jam_selesai, jam_mulai,
        jam_mulai, jam_selesai
    ]);
    
    return results[0].count === 0;
};

// Fungsi untuk menambah laporan dengan validasi waktu yang lebih fleksibel
const tambahLaporan = (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ message: "Gagal mengupload foto kegiatan", error: err });

        try {
            const now = new Date();
            const tanggal = now.toISOString().split("T")[0];
            const pengguna_id = req.user.id;
            const { jam_mulai, jam_selesai, deskripsi } = req.body;
            const foto_kegiatan = req.file ? `/uploads/foto_kegiatan/${req.file.filename}` : null;

            // Validasi waktu laporan
            if (!isValidTimeRange(jam_mulai, jam_selesai)) {
                return res.status(400).json({ 
                    message: "Waktu laporan tidak valid. Harus dalam rentang 08:00-16:00 dengan format HH:MM dan kelipatan 30 menit (contoh: 10:00-12:00 atau 10:30-12:30)" 
                });
            }

            // Cek apakah slot waktu sudah digunakan
            const isAvailable = await isTimeSlotAvailable(pengguna_id, tanggal, jam_mulai, jam_selesai);
            if (!isAvailable) {
                return res.status(400).json({ 
                    message: "Anda sudah membuat laporan untuk waktu ini atau waktu yang tumpang tindih" 
                });
            }

            // Ambil data pengguna
            const [userResults] = await db.promise().query(
                `SELECT nama_lengkap, nip FROM pengguna WHERE id = ?`,
                [pengguna_id]
            );

            if (userResults.length === 0) {
                return res.status(400).json({ message: "Pengguna tidak ditemukan" });
            }

            const { nama_lengkap, nip } = userResults[0];

            // Simpan laporan
            const [insertResults] = await db.promise().query(
                `INSERT INTO laporan (pengguna_id, tanggal, jam_mulai, jam_selesai, deskripsi, foto_kegiatan, nama_lengkap, nip) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [pengguna_id, tanggal, jam_mulai, jam_selesai, deskripsi, foto_kegiatan, nama_lengkap, nip]
            );

            res.status(201).json({ message: "Laporan berhasil ditambahkan", data: insertResults });
        } catch (error) {
            console.error("Error in tambahLaporan:", error);
            res.status(500).json({ message: "Terjadi kesalahan", error: error.message });
        }
    });
};


// Fungsi untuk mengambil semua laporan per tanggal hari ini
const getAllLaporan = (req, res) => {
    const query = "SELECT * FROM laporan WHERE DATE(tanggal) = CURDATE()";

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Gagal mengambil laporan", error: err });
        }
        res.status(200).json({ message: "Data laporan hari ini berhasil diambil", data: results });
    });
};


//Fungsi untuk mengambil laporan berbadasarkan ID dan tanggl
const getLaporanByIdAndTanggal = (req, res) => {
    const { id, tanggal } = req.params;
    const query = "SELECT * FROM laporan WHERE pengguna_id = ? AND tanggal = ?";
    db.query(query, [id, tanggal], (err, results) => {
        if (err) return res.status(500).json({ message: "Gagal mengambil laporan", error: err });

        if (results.length === 0) {
            return res.status(404).json({ message: "Laporan tidak ditemukan" });
        }

        res.status(200).json({ message: "Data laporan berhasil diambil", data: results });
    });
};


// Fungsi Membuat PDF
const query = util.promisify(db.query).bind(db);

const generateLaporanPDF = async (req, res) => {
    const { pengguna_id, tanggal } = req.query;

    try {
        // Ambil data laporan dari database menggunakan Promise
        const results = await query(
            `SELECT laporan.*, pengguna.nama_lengkap, pengguna.nip, pengguna.tandatangan 
            FROM laporan 
            JOIN pengguna ON laporan.pengguna_id = pengguna.id
            WHERE laporan.pengguna_id = ? AND laporan.tanggal = ?`,
            [pengguna_id, tanggal]
        );

        if (results.length === 0) {
            return res.status(404).json({ message: "Tidak ada laporan ditemukan" });
        }

        // Siapkan data untuk template EJS
        const dataLaporan = {
            nama_lengkap: results[0].nama_lengkap,
            nip: results[0].nip,
            tanggal: results[0].tanggal,
            laporan: results,
            tandatangan: results[0].tandatangan ? `/` + results[0].tandatangan.replace(/\\/g, "/") : null,
            baseUrl: process.env.BASE_URL || "https://silahar3272.ftv.sh",
        };

        // Render file EJS ke HTML
        const templatePath = path.join(__dirname, "../views/laporan.ejs");
        const html = await ejs.renderFile(templatePath, dataLaporan);

        // Konversi HTML ke PDF dengan Puppeteer
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        // Tentukan lokasi penyimpanan file PDF
        const pdfFilename = `Laporan_${pengguna_id}_${tanggal}.pdf`;
        const pdfPath = path.join(__dirname, "../public", pdfFilename);

        // Generate PDF dan simpan
        await page.pdf({ path: pdfPath, format: "A4" });
        await browser.close();

        // Kirim file PDF ke user
        res.download(pdfPath, pdfFilename, async (err) => {
            if (err) {
                console.error("Gagal mengirim file PDF:", err);
            } else {
                try {
                    // Hapus file PDF setelah 5 detik
                    setTimeout(async () => {
                        await fs.promises.unlink(pdfPath);
                        console.log(`File ${pdfPath} berhasil dihapus.`);
                    }, 5000);
                } catch (unlinkErr) {
                    console.error("Gagal menghapus file PDF:", unlinkErr);
                }
            }
        });
    } catch (error) {
        console.error("Terjadi kesalahan:", error);
        res.status(500).json({ message: "Terjadi kesalahan", error });
    }
};


// Fungsi Membuat PDF Berdasarkan rentang tanggal
const generateLaporanPDFTanggal = async (req, res) => {
    const { tanggal_awal, tanggal_akhir } = req.query;

    try {
        // Ambil data laporan dalam rentang tanggal
        const results = await query(
            `SELECT laporan.*, pengguna.nama_lengkap, pengguna.nip, pengguna.tandatangan 
            FROM laporan 
            JOIN pengguna ON laporan.pengguna_id = pengguna.id
            WHERE laporan.tanggal BETWEEN ? AND ? 
            ORDER BY laporan.tanggal ASC, pengguna.nama_lengkap ASC`,
            [tanggal_awal, tanggal_akhir]
        );

        if (results.length === 0) {
            return res.status(404).json({ message: "Tidak ada laporan ditemukan dalam rentang tanggal yang dipilih." });
        }

        // Kelompokkan laporan berdasarkan pengguna_id
        const laporanByUser = {};
        results.forEach((laporan) => {
            if (!laporanByUser[laporan.pengguna_id]) {
                laporanByUser[laporan.pengguna_id] = {
                    nama_lengkap: laporan.nama_lengkap,
                    nip: laporan.nip,
                    tandatangan: laporan.tandatangan ? `/` + laporan.tandatangan.replace(/\\/g, "/") : null,
                    laporan: [],
                };
            }
            laporanByUser[laporan.pengguna_id].laporan.push(laporan);
        });

        // Render laporan ke dalam file HTML menggunakan EJS
        const templatePath = path.join(__dirname, "../views/laporan_all.ejs");
        const html = await ejs.renderFile(templatePath, {
            laporanByUser,
            tanggal_awal,
            tanggal_akhir,
            baseUrl: process.env.BASE_URL || "https://silahar3272.ftp.sh", // Menyediakan baseUrl untuk akses gambar
        });

        // Konversi HTML ke PDF menggunakan Puppeteer
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        // Tentukan lokasi penyimpanan file PDF
        const pdfFilename = `Laporan_${tanggal_awal}_sampai_${tanggal_akhir}.pdf`;
        const pdfPath = path.join(__dirname, "../public", pdfFilename);

        // Generate PDF dan simpan
        await page.pdf({ path: pdfPath, format: "A4" });
        await browser.close();

        // Kirim file PDF ke user
        res.download(pdfPath, pdfFilename, async (err) => {
            if (err) {
                console.error("Gagal mengirim file PDF:", err);
            } else {
                try {
                    // Hapus file PDF setelah 10 detik
                    setTimeout(async () => {
                        await fs.promises.unlink(pdfPath);
                        console.log(`File ${pdfPath} berhasil dihapus.`);
                    }, 10000);
                } catch (unlinkErr) {
                    console.error("Gagal menghapus file PDF:", unlinkErr);
                }
            }
        });
    } catch (error) {
        console.error("Terjadi kesalahan:", error);
        res.status(500).json({ message: "Terjadi kesalahan", error });
    }
};

const generateLaporanPDFByIdAndTanggalRange = async (req, res) => {
    const { id, tanggal_awal, tanggal_akhir } = req.params;

    try {
        const formattedTanggalAwal = moment(tanggal_awal, 'YYYY-MM-DD').startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const formattedTanggalAkhir = moment(tanggal_akhir, 'YYYY-MM-DD').endOf('day').format('YYYY-MM-DD HH:mm:ss');

        let results;
        if (id) {
            results = await query(
                `SELECT laporan.*, pengguna.nama_lengkap, pengguna.nip, pengguna.tandatangan 
                 FROM laporan 
                 JOIN pengguna ON laporan.pengguna_id = pengguna.id
                 WHERE laporan.pengguna_id = ? AND laporan.tanggal BETWEEN ? AND ? 
                 ORDER BY laporan.tanggal ASC, laporan.jam_mulai ASC`,
                [id, formattedTanggalAwal, formattedTanggalAkhir]
            );
        } else {
            results = await query(
                `SELECT laporan.*, pengguna.nama_lengkap, pengguna.nip, pengguna.tandatangan 
                 FROM laporan 
                 JOIN pengguna ON laporan.pengguna_id = pengguna.id
                 WHERE laporan.tanggal BETWEEN ? AND ? 
                 ORDER BY pengguna.nama_lengkap ASC, laporan.tanggal ASC, laporan.jam_mulai ASC`,
                [formattedTanggalAwal, formattedTanggalAkhir]
            );
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "Tidak ada laporan ditemukan." });
        }

        let laporanByUser = {};
        if (!id) {
            results.forEach(laporan => {
                if (!laporanByUser[laporan.pengguna_id]) {
                    laporanByUser[laporan.pengguna_id] = {
                        nama_lengkap: laporan.nama_lengkap,
                        nip: laporan.nip,
                        tandatangan: laporan.tandatangan,
                        laporan: []
                    };
                }
                laporanByUser[laporan.pengguna_id].laporan.push(laporan);
            });
        }

        const templatePath = path.join(__dirname, "../views/laporan_all.ejs");
        const html = await ejs.renderFile(templatePath, {
            laporanByUser,
            user: id
                ? {
                    nama_lengkap: results[0].nama_lengkap,
                    nip: results[0].nip,
                    tandatangan: results[0].tandatangan
                        ? `/${results[0].tandatangan.replace(/\\/g, "/")}` : null,
                }
                : null,
            tanggal_awal,
            tanggal_akhir,
            moment,
            baseUrl: process.env.BASE_URL || "https://silahar3272.ftp.sh",
        });

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        const filename = id
            ? `Laporan_${results[0].nama_lengkap}_${tanggal_awal}_sampai_${tanggal_akhir}.pdf`
            : `Laporan_SemuaPengguna_${tanggal_awal}_sampai_${tanggal_akhir}.pdf`;

        const pdfPath = path.join(__dirname, "../public", filename);
        await page.pdf({ path: pdfPath, format: "A4" });
        await browser.close();

        // Kirim file ke klien, lalu hapus setelah berhasil diunduh
        res.download(pdfPath, filename, (err) => {
            if (err) {
                console.error("Gagal mengunduh file:", err);
            } else {
                // Hapus file setelah berhasil dikirim
                setTimeout(() => {
                    fs.unlink(pdfPath, (err) => {
                        if (err) console.error("Gagal menghapus file PDF:", err);
                        else console.log(`File ${filename} berhasil dihapus.`);
                    });
                }, 5000); // Delay agar unduhan tidak terpotong
            }
        });
    } catch (error) {
        console.error("Terjadi kesalahan:", error);
        res.status(500).json({ message: "Terjadi kesalahan saat generate laporan", error });
    }
};



//Grafik
const getGrafikLaporanHariIni = (req, res) => {
    const today = new Date().toISOString().split("T")[0];
  
    const query = `
      SELECT 
        p.nama_lengkap,
        l.jam_mulai,
        l.jam_selesai
      FROM laporan l
      JOIN pengguna p ON l.pengguna_id = p.id
      WHERE l.tanggal = ?
      ORDER BY l.jam_mulai ASC
    `;
  
    db.query(query, [today], (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Gagal mengambil data laporan hari ini", error: err });
      }
  
      res.status(200).json({ message: "Data laporan berhasil diambil", data: results });
    });
  };
  
  

module.exports = { tambahLaporan, getAllLaporan, getLaporanByIdAndTanggal, generateLaporanPDF, generateLaporanPDFTanggal, generateLaporanPDFByIdAndTanggalRange, getGrafikLaporanHariIni };