require('dotenv').config();
const express = require('express');
const cors = require('cors');
const penggunaRoutes = require('./routes/penggunaRoutes');
const laporanRoutes = require("./routes/laporanRoutes");
const beritaRoutes = require('./routes/beritaRoutes');
const tugasRoutes = require('./routes/tugasRoutes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use('/public', express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/api/pengguna', penggunaRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/berita', beritaRoutes);
app.use('/api/tugas', tugasRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));