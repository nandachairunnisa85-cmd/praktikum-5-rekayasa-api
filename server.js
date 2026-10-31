console.log("=== KELOMPOK 3 - KELAS TI B ===");
console.log("Nanda Chairunnisa           - F5512520041");
console.log("Mutiara Fajarianti         - F5512520043");
console.log("Muh. Rizky Jumadil.M       - F5512520045");
console.log("Muh. Zufar Fauzan          - F5512520074");
console.log("Juan Terrin K. Samatimbang - F5512520051");
console.log("================================");

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { buildSchema, graphql } = require('graphql');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'destinations.json');
const REGION_FILE = path.join(__dirname, 'data', 'regions.json');
const KEY_FILE = path.join(__dirname, 'data', 'api-keys.json');

// ---------- helper respons ----------
function kirimJSON(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function kirimError(res, statusCode, pesan) {
    kirimJSON(res, statusCode, { error: pesan });
}

// ---------- helper data ----------
async function bacaData() {
    const isi = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(isi);
}

async function simpanData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

async function bacaRegions() {
    const isi = await fs.readFile(REGION_FILE, 'utf8');
    return JSON.parse(isi);
}

// ---------- helper request ----------
function buatError(statusCode, pesan) {
    const err = new Error(pesan);
    err.statusCode = statusCode;
    return err;
}

function bacaBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            if (body === '') return resolve(null);
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(buatError(400, 'Body request bukan JSON yang valid'));
            }
        });
        req.on('error', reject);
    });
}

// ---------- keamanan (API Key) ----------
async function periksaApiKey(req) {
    const kunci = req.headers['x-api-key'];
    if (!kunci) {
        throw buatError(401, 'API key tidak disertakan. Kirim melalui header x-api-key');
    }

    const isi = await fs.readFile(KEY_FILE, 'utf8');
    const pemilik = JSON.parse(isi).find((k) => k.key === kunci);
    if (!pemilik) {
        throw buatError(401, 'API key tidak dikenal');
    }
    return pemilik;
}

// ---------- logika destinasi ----------
async function periksaDestinasi(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw buatError(400, 'Data destinasi harus berupa object');
    }

    const kurang = ['name', 'category'].filter(
        (field) => typeof input[field] !== 'string' || input[field].trim() === ''
    );
    if (kurang.length > 0) {
        throw buatError(400, `Field wajib belum diisi: ${kurang.join(', ')}`);
    }

    const regionId = Number(input.regionId);
    const regions = await bacaRegions();
    if (!regions.some((r) => r.id === regionId)) {
        throw buatError(400, 'regionId wajib diisi dengan id region yang tersedia');
    }

    return {
        name: input.name.trim(),
        category: input.category.trim(),
        regionId: regionId
    };
}

async function buatDestinasi(input) {
    const bersih = await periksaDestinasi(input);
    const data = await bacaData();
    const idBaru = data.length === 0 ? 1 : Math.max(...data.map((d) => d.id)) + 1;
    const item = { id: idBaru, ...bersih };
    data.push(item);
    await simpanData(data);
    return item;
}

// ---------- handler destinations ----------
async function daftarDestinasi(req, res, url) {
    let data = await bacaData();
    const kategori = url.searchParams.get('category');
    if (kategori) {
        data = data.filter((item) => item.category === kategori);
    }
    kirimJSON(res, 200, data);
}

async function detailDestinasi(req, res, id) {
    const data = await bacaData();
    const item = data.find((d) => d.id === id);
    if (!item) {
        return kirimError(res, 404, `Destinasi dengan id ${id} tidak ditemukan`);
    }
    kirimJSON(res, 200, item);
}

async function tambahDestinasi(req, res) {
    const input = await bacaBody(req);
    const item = await buatDestinasi(input);
    res.setHeader('Location', `/destinations/${item.id}`);
    kirimJSON(res, 201, item);
}

async function ubahDestinasi(req, res, id) {
    const input = await bacaBody(req);
    const data = await bacaData();
    const index = data.findIndex((d) => d.id === id);
    if (index === -1) {
        return kirimError(res, 404, `Destinasi dengan id ${id} tidak ditemukan`);
    }

    const bersih = await periksaDestinasi(input);
    data[index] = { id: id, ...bersih };
    await simpanData(data);
    kirimJSON(res, 200, data[index]);
}

async function hapusDestinasi(req, res, id) {
    const data = await bacaData();
    const index = data.findIndex((d) => d.id === id);
    if (index === -1) {
        return kirimError(res, 404, `Destinasi dengan id ${id} tidak ditemukan`);
    }

    data.splice(index, 1);
    await simpanData(data);
    res.writeHead(204);
    res.end();
}

// ---------- handler regions ----------
async function tanganiRegions(req, res, segmen) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return kirimError(res, 405, `Method ${req.method} tidak didukung pada endpoint ini`);
    }

    const regions = await bacaRegions();
    if (segmen.length === 1) {
        return kirimJSON(res, 200, regions);
    }

    const item = regions.find((r) => r.id === Number(segmen[1]));
    if (!item) {
        return kirimError(res, 404, `Region dengan id ${segmen[1]} tidak ditemukan`);
    }
    kirimJSON(res, 200, item);
}

// ---------- graphql: schema ----------
const schema = buildSchema(`
    type Destination {
        id: ID!
        name: String!
        category: String
    }

    type Query {
        destinations: [Destination]
    }
`);

// ---------- router ----------
async function router(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const segmen = url.pathname.split('/').filter(Boolean);

    // Lapisan 1: Pengecekan API Key untuk setiap request
    const aplikasi = await periksaApiKey(req);
    console.log(`  aplikasi: ${aplikasi.client}`);

    if (segmen[0] === 'regions' && segmen.length <= 2) {
        return tanganiRegions(req, res, segmen);
    }

    if (segmen[0] !== 'destinations' || segmen.length > 2) {
        return kirimError(res, 404, 'Endpoint tidak ditemukan');
    }

    // Endpoint koleksi: /destinations
    if (segmen.length === 1) {
        if (req.method === 'GET') return daftarDestinasi(req, res, url);
        if (req.method === 'POST') return tambahDestinasi(req, res);
        res.setHeader('Allow', 'GET, POST');
        return kirimError(res, 405, `Method ${req.method} tidak didukung pada endpoint ini`);
    }

    // Endpoint item: /destinations/:id
    const id = Number(segmen[1]);
    if (!Number.isInteger(id) || id < 1) {
        return kirimError(res, 400, 'id harus berupa bilangan bulat positif');
    }

    if (req.method === 'GET') return detailDestinasi(req, res, id);
    if (req.method === 'PUT') return ubahDestinasi(req, res, id);
    if (req.method === 'DELETE') return hapusDestinasi(req, res, id);
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return kirimError(res, 405, `Method ${req.method} tidak didukung pada endpoint ini`);
}

// ---------- server runner ----------
const server = http.createServer(async (req, res) => {
    try {
        await router(req, res);
    } catch (err) {
        const status = err.statusCode || 500;
        kirimError(res, status, err.message);
    }
});

server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});