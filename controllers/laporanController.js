const db = require("../models/db");
const multer = require("multer");
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const util = require('util');
const moment = require('moment');
const PDFDocument = require("pdfkit");
const axios = require("axios");




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

// FUngsi Melihat riwayat laporan
const riwayatLaporanHariIni = async (req, res) => {
    try {
        const pengguna_id = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        const [results] = await db.promise().query(
            `SELECT id, tanggal, jam_mulai, jam_selesai, deskripsi, foto_kegiatan 
             FROM laporan 
             WHERE pengguna_id = ? AND tanggal = ?
             ORDER BY jam_mulai DESC`,
            [pengguna_id, today]
        );

        res.status(200).json({
            message: "Riwayat laporan hari ini berhasil diambil",
            data: results
        });
    } catch (error) {
        console.error("Error in riwayatLaporanHariIni:", error);
        res.status(500).json({
            message: "Terjadi kesalahan saat mengambil riwayat laporan",
            error: error.message
        });
    }
};


// Promisify query
const query = util.promisify(db.query).bind(db);

// Konfigurasi
const BASE_URL = "http://silahar3272.ftp.sh:3000";
const LOGO_PATH = "/public/assets/Logo.png";

// Direktori
const UPLOADS_DIR = path.join(__dirname, "../uploads");
const FOTO_KEGIATAN_DIR = path.join(UPLOADS_DIR, "foto_kegiatan");
const TANDATANGAN_DIR = path.join(UPLOADS_DIR, "tandatangan");
const LAPORAN_DIR = path.join(UPLOADS_DIR, "laporan");
const TEMP_FILE_PREFIX = "temp_laporan_";

// Pastikan direktori ada
[UPLOADS_DIR, FOTO_KEGIATAN_DIR, TANDATANGAN_DIR, LAPORAN_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Direktori dibuat: ${dir}`);
  }
});

// Helper: Bangun URL
const buildUrl = (...segments) =>
  `${BASE_URL}/${segments.map(s => s.replace(/^\/+|\/+$/g, "")).join("/")}`;

// Helper: Tambah gambar ke PDF
const addImageToPdf = async (url, doc, x, y, options = {}) => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 5000,
    });

    if (response.status !== 200) throw new Error(`Status code ${response.status}`);

    const tempPath = path.join(LAPORAN_DIR, `${TEMP_FILE_PREFIX}${Date.now()}.tmp`);
    await fs.promises.writeFile(tempPath, response.data);

    doc.image(tempPath, x, y, options);
    await fs.promises.unlink(tempPath);

    return true;
  } catch (err) {
    console.error(`[LAPORAN] Gagal memuat gambar: ${err.message}`);
    return false;
  }
};

// Helper: Menggambar garis horizontal pada PDF
const drawHorizontalLine = (doc, y, marginLeft = 40, marginRight = 40) => {
  doc.moveTo(marginLeft, y)
     .lineTo(doc.page.width - marginRight, y)
     .stroke();
  return doc;
};

// Helper: Mengukur tinggi teks multi-line
const calculateTextHeight = (doc, text, options = {}) => {
  const defaultOptions = { width: 200, align: 'left' };
  const mergedOptions = { ...defaultOptions, ...options };
  return doc.heightOfString(text, mergedOptions);
};

// Fungsi Utama
const generateLaporanPDF = async (req, res) => {
  console.log("[LAPORAN] Memulai proses generate PDF", { query: req.query });

  const { pengguna_id, tanggal } = req.query;

  // Validasi input
  if (!pengguna_id || !tanggal) {
    return res.status(400).json({
      success: false,
      message: "Parameter pengguna_id dan tanggal diperlukan",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return res.status(400).json({
      success: false,
      message: "Format tanggal harus YYYY-MM-DD",
      received: tanggal,
    });
  }

  try {
    console.log("[LAPORAN] Query laporan dari database");

    const results = await query(`
      SELECT laporan.*, pengguna.nama_lengkap, pengguna.nip, pengguna.tandatangan 
      FROM laporan 
      JOIN pengguna ON laporan.pengguna_id = pengguna.id
      WHERE laporan.pengguna_id = ? AND laporan.tanggal = ?
      ORDER BY laporan.jam_mulai ASC
    `, [pengguna_id, tanggal]);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tidak ada laporan ditemukan untuk pengguna dan tanggal tersebut",
      });
    }

    const laporan = results;
    const { nama_lengkap, nip, tandatangan } = laporan[0];

    const logoUrl = buildUrl(LOGO_PATH);
    const ttdUrl = tandatangan ? buildUrl("uploads", "tandatangan", path.basename(tandatangan)) : null;

    const safeName = nama_lengkap.replace(/[^a-z0-9]/gi, "_").substring(0, 50);
    const timestamp = Date.now();
    const pdfFilename = `Laporan_${safeName}_${tanggal}_${timestamp}.pdf`;
    const pdfPath = path.join(LAPORAN_DIR, pdfFilename);

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Laporan Harian ${nama_lengkap}`,
        Author: nama_lengkap,
        CreationDate: new Date()
      }
    });

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // === HEADER SECTION ===
    // Tambahkan Logo di kiri
    const logoAdded = await addImageToPdf(logoUrl, doc, 50, 50, { width: 120, height: 50 });
    if (!logoAdded) doc.text("LOGO DINAS", 50, 50);

    // Judul Laporan - dibuat bold dan di tengah di bawah logo
    const titleY = 110; // Posisi Y di bawah logo
    doc.fontSize(16).font('Helvetica-Bold').text("LAPORAN KEGIATAN HARIAN", 50, titleY, { 
      align: "center", 
      width: doc.page.width - 100
    });
    
    // REMOVED: Garis di bawah judul
    // drawHorizontalLine(doc, titleY + 25, 50, 50);
    
    // === INFORMASI PEGAWAI ===
    doc.fontSize(12).font('Helvetica');
    
    const infoY = titleY + 40; 
    
    doc.text("Nama Lengkap", 50, infoY);
    doc.text(":", 200, infoY);
    doc.text(nama_lengkap, 220, infoY);
    
    doc.text("Nomor Induk Pegawai", 50, infoY + 20);
    doc.text(":", 200, infoY + 20);
    doc.text(nip, 220, infoY + 20);

    const formattedTanggal = new Date(tanggal).toLocaleDateString("id-ID", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    
    doc.text("Tanggal Laporan", 50, infoY + 40);
    doc.text(":", 200, infoY + 40);
    doc.text(formattedTanggal, 220, infoY + 40);
    
    // === TABEL KEGIATAN ===
    const tableTop = infoY + 80;
    
    // Header tabel
    doc.font('Helvetica-Bold').fontSize(12);
    
    // Garis atas tabel
    drawHorizontalLine(doc, tableTop - 5, 50, 50);
    
    // Header kolom
    doc.text("No", 50, tableTop);
    doc.text("Waktu", 80, tableTop);
    doc.text("Deskripsi", 180, tableTop);
    doc.text("Foto Kegiatan", 380, tableTop);
    
    // Garis bawah header
    drawHorizontalLine(doc, tableTop + 20, 50, 50);
    
    // Tampilkan data
    doc.font('Helvetica').fontSize(11);
    let currentY = tableTop + 30;
    
    // Konfigurasi untuk layout 6 foto per halaman
    const photosPerPage = 6;
    const photoWidth = 100;
    const photoHeight = 80;
    const photoGap = 10;
    
    // Menampilkan maksimal 6 kegiatan per halaman
    const maxEntries = Math.min(laporan.length, photosPerPage);
    
    for (let i = 0; i < maxEntries; i++) {
      const item = laporan[i];
      const jamMulai = item.jam_mulai?.slice(0, 5) || "-";
      const jamSelesai = item.jam_selesai?.slice(0, 5) || "-";
      
      // Menampilkan nomor
      doc.text(`${i + 1}`, 50, currentY);
      
      // Menampilkan waktu
      doc.text(`${jamMulai} - ${jamSelesai}`, 80, currentY);
      
      // Menampilkan deskripsi (dengan batas lebar)
      doc.text(item.deskripsi || "-", 180, currentY, { 
        width: 180, 
        align: "left" 
      });

      // Menampilkan foto kegiatan
      const fotoUrl = item.foto_kegiatan ? buildUrl("uploads", "foto_kegiatan", path.basename(item.foto_kegiatan)) : null;
      
      if (fotoUrl) {
        const fotoAdded = await addImageToPdf(fotoUrl, doc, 380, currentY - 5, { 
          width: photoWidth, 
          height: photoHeight,
          fit: [photoWidth, photoHeight] 
        });
        if (!fotoAdded) doc.text("(Foto tidak tersedia)", 380, currentY, { align: "center" });
      } else {
        doc.text("-", 380, currentY, { align: "center" });
      }
      
      // Update posisi Y untuk baris berikutnya
      currentY += photoHeight + photoGap;
      
      // Garis pembatas antar baris
      drawHorizontalLine(doc, currentY - 5, 50, 50);
    }

    // === TANDA TANGAN ===
    // Posisikan tanda tangan di sebelah kanan
    const ttdY = currentY + 20;
    
    const currentDate = new Date().toLocaleDateString("id-ID", {
      year: "numeric", month: "long", day: "numeric"
    });
    
    // Tempat dan tanggal
    doc.fontSize(11).text(`Sukabumi, ${currentDate}`, doc.page.width - 200, ttdY, { align: "right" });
    
    // Tambahkan tanda tangan
    if (ttdUrl) {
      const ttdAdded = await addImageToPdf(ttdUrl, doc, doc.page.width - 200, ttdY + 20, { width: 120, height: 60 });
      if (!ttdAdded) {
        doc.text("(Tanda tangan tidak tersedia)", doc.page.width - 200, ttdY + 20, { align: "right" });
      }
    }
    
    // Nama dan NIP
    doc.fontSize(11).text(nama_lengkap, doc.page.width - 200, ttdY + 90, { align: "right" });
    doc.text(`NIP. ${nip}`, doc.page.width - 200, ttdY + 105, { align: "right" });

    doc.end();

    writeStream.on("finish", () => {
      res.download(pdfPath, pdfFilename, async (err) => {
        if (err) {
          console.error("[LAPORAN] Gagal mengirim file:", err);
          return res.status(500).json({ success: false, message: "Gagal mengirim file PDF", error: err.message });
        }

        setTimeout(async () => {
          try {
            await fs.promises.unlink(pdfPath);
            console.log("[LAPORAN] File PDF berhasil dihapus");
          } catch (err) {
            console.error("[LAPORAN] Gagal menghapus file PDF:", err);
          }
        }, 10000);
      });
    });

    writeStream.on("error", (err) => {
      console.error("[LAPORAN] Error write stream:", err);
      throw err;
    });

  } catch (error) {
    console.error("[LAPORAN] Error utama:", {
      message: error.message,
      stack: error.stack,
      sqlMessage: error.sqlMessage,
      code: error.code,
    });

    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat membuat laporan",
      error: error.message,
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      }),
    });
  }
};

// For demonstration purposes
console.log("PDF generator modified - underline removed from title");


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
            baseUrl: process.env.BASE_URL || "http://silahar3272.ftp.sh:3000", // Menyediakan baseUrl untuk akses gambar
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
            baseUrl: process.env.BASE_URL || "http://silahar3272.ftp.sh:3000",
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
  
  

module.exports = { tambahLaporan, getAllLaporan, getLaporanByIdAndTanggal, generateLaporanPDF, generateLaporanPDFTanggal, generateLaporanPDFByIdAndTanggalRange, getGrafikLaporanHariIni, riwayatLaporanHariIni};
