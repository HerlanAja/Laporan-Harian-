const express = require("express");
const { tambahLaporan, getAllLaporan, getLaporanByIdAndTanggal, generateLaporanPDF, generateLaporanPDFTanggal, generateLaporanPDFByIdAndTanggalRange, getGrafikLaporanHariIni } = require("../controllers/laporanController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/tambah", authMiddleware, tambahLaporan);
router.get("/", getAllLaporan);
router.get("/:id/:tanggal",getLaporanByIdAndTanggal);
router.get('/download-laporan', generateLaporanPDF);
router.get("/download", generateLaporanPDFTanggal);
router.get("/download/all/:tanggal_awal/:tanggal_akhir", generateLaporanPDFByIdAndTanggalRange);
router.get("/download/:id/:tanggal_awal/:tanggal_akhir", generateLaporanPDFByIdAndTanggalRange); // per user
router.get("/grafik", getGrafikLaporanHariIni);

module.exports = router;
