const express = require("express");
const { tambahLaporan, getAllLaporan, getLaporanByIdAndTanggal, generateLaporanPDF, generateLaporanPDFTanggal, generateLaporanPDFByIdAndTanggalRange, getGrafikLaporanHariIni, riwayatLaporanHariIni } = require("../controllers/laporanController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Middleware untuk menangani error secara spesifik
const handlePDFErrors = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error('PDF Generation Error:', {
      message: err.message,
      stack: err.stack,
      query: req.query,
      params: req.params
    });
    
    res.status(500).json({
      success: false,
      message: "Gagal menghasilkan laporan PDF",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      details: process.env.NODE_ENV === 'development' ? {
        stack: err.stack
      } : undefined
    });
  });
};

router.get('/download-laporan', handlePDFErrors(generateLaporanPDF));

router.post("/tambah", authMiddleware, tambahLaporan);
router.get("/", getAllLaporan);
router.get("/:id/:tanggal",getLaporanByIdAndTanggal);
router.get("/download", generateLaporanPDFTanggal);
router.get("/download/all/:tanggal_awal/:tanggal_akhir", generateLaporanPDFByIdAndTanggalRange); // semua user
router.get("/download/:id/:tanggal_awal/:tanggal_akhir", generateLaporanPDFByIdAndTanggalRange); // per user
router.get("/grafik", getGrafikLaporanHariIni);
router.get("/riwayat", authMiddleware, riwayatLaporanHariIni);


module.exports = router;
