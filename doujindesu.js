// ID: ext_doujindesu
// NAME: Doujindesu
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #E91E63
// ICON: https://pic.desu.xxx/content/web/1217a30e-c660-4212-9d80-548df7aa166d.webp
// REFERER: https://doujin.desu.xxx/

const SITE = 'https://doujin.desu.xxx';
const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
const KEY_PERIOD = 3600000; // kunci enkripsi situs berganti tiap 1 jam

// Nilai awal hash kunci. Ada 3 kandidat (zona waktu WIB / WITA / WIT);
// yang cocok dipilih otomatis saat respons pertama berhasil didekripsi.
const H0_CANDIDATES = [2467384909, 3922124140, 1081896075];
let _h0 = null;

const DEVICE_ID = 'dev_' + Math.random().toString(36).substring(2, 13) + '_' + Date.now().toString(36);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://doujin.desu.xxx/',
    'x-app-secret': APP_SECRET,
    'x-device-id': DEVICE_ID,
    'x-device-name': 'Chrome on Windows',
};

// ---------- Dekripsi respons ----------
function makeKey(h0, t) {
    let r = h0 | 0;
    const s = '_' + t;
    for (let i = 0; i < s.length; i++) {
        r = (r << 5) - r + s.charCodeAt(i);
        r |= 0;
    }
    let d = Math.abs(r) || 123456789;
    let out = '';
    for (let i = 0; i < 32; i++) {
        d = (d * 1664525 + 1013904223) % 4294967296;
        out += String.fromCharCode(33 + d % 93);
    }
    return out;
}

function ro(hex, key) {
    const bytes = [];
    for (let m = 0; m < hex.length; m += 2) {
        const p = hex.substring(m, m + 2);
        if (!p) break;
        bytes.push(parseInt(p, 16));
    }
    const out = [];
    const kl = key.length;
    let l = 42;
    for (let m = 0; m < bytes.length; m++) {
        const b = bytes[m];
        const v = b ^ key.charCodeAt(m % kl) ^ (m * 13) ^ l;
        out.push(String.fromCharCode(v & 255));
        l = (l + b) % 256;
    }
    return out.join('');
}

function tryDecrypt(hex, h0list) {
    const now = Math.floor(Date.now() / KEY_PERIOD);
    for (const h0 of h0list) {
        for (const n of [now, now - 1, now + 1]) {
            const key = makeKey(h0, n);
            const head = ro(hex.substring(0, 24), key);
            if (!/^%(7B|5B)/i.test(head)) continue;
            try {
                const data = JSON.parse(decodeURIComponent(ro(hex, key)));
                return { data: data, h0: h0 };
            } catch (e) { /* kunci salah, coba berikutnya */ }
        }
    }
    return null;
}

function decodeResponse(text) {
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('Respons bukan JSON'); }
    if (!json || typeof json._enc_resp_ !== 'string') return json;

    let res = null;
    if (_h0 !== null) res = tryDecrypt(json._enc_resp_, [_h0]);
    if (!res) res = tryDecrypt(json._enc_resp_, H0_CANDIDATES);
    if (!res) throw new Error('Gagal dekripsi. Cek jam HP (harus akurat) atau situs mengubah enkripsinya.');
    _h0 = res.h0;
    return res.data;
}

async function apiGet(path) {
    const url = SITE + path;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
    return decodeResponse(await res.text());
}

function fmtDate(iso) {
    return iso ? String(iso).substring(0, 10) : '-';
}

// ---------- Ekstensi ----------
var KonmikExtension = {
    // Katalog / pencarian (24 komik per halaman)
    async getList(page, query, filters) {
        page = page || 1;
        const q = query && query.trim().length > 0 ? encodeURIComponent(query.trim()) : '';
        const offset = (page - 1) * 24;
        const path = '/api/manga?search=' + q + '&genre=&status=&type=doujinshi,manga&sort=latest_chapter&limit=24&offset=' + offset;
        const data = await apiGet(path);
        const items = Array.isArray(data) ? data : ((data && data.data) || []);

        const list = [];
        for (const it of items) {
            if (!it || !it.slug) continue;
            let latest = '';
            if (it.chapters && it.chapters.length > 0) {
                let max = it.chapters[0].chapter_number;
                for (const c of it.chapters) if (c.chapter_number > max) max = c.chapter_number;
                latest = 'Ch. ' + max;
            }
            list.push({
                id: it.slug,
                title: it.title || it.slug,
                cover_url: it.cover_url || '',
                latest_chapter: latest,
                rating: it.rating != null ? String(it.rating) : '-',
                views: it.views != null ? String(it.views) : '-'
            });
        }
        return { manga_list: list };
    },

    // Detail komik + daftar chapter. slug = slug komik.
    async getDetail(slug) {
        const d = await apiGet('/api/manga/' + slug);

        const genres = [];
        for (const g of (d.manga_genres || [])) {
            const name = g && g.genres && g.genres.name;
            if (name && genres.indexOf(name) === -1) genres.push(name);
        }
        if (genres.length === 0) genres.push(d.type || 'Komik');

        let description = d.description && d.description.trim() ? d.description.trim() : '';
        if (d.alt_titles) description += (description ? '\n\n' : '') + 'Judul lain: ' + d.alt_titles;
        if (!description) description = 'Tidak ada deskripsi.';

        const chapters = (d.chapters || []).slice().sort(function (a, b) {
            return b.chapter_number - a.chapter_number;
        }).map(function (c) {
            return {
                id: c.id,
                title: 'Chapter ' + c.chapter_number,
                endpoint: c.id,
                date: fmtDate(c.created_at)
            };
        });

        return {
            title: d.title,
            cover_url: d.cover_url || '',
            description: description,
            author: d.author || '-',
            artist: d.artist || d.author || '-',
            rating: d.rating != null ? String(d.rating) : '-',
            views: d.views != null ? String(d.views) : '-',
            genres: genres,
            chapters: chapters
        };
    },

    // Gambar halaman. endpoint = id chapter.
    async getChapterImages(endpoint) {
        const id = endpoint.indexOf('/') > -1 ? endpoint.substring(endpoint.lastIndexOf('/') + 1) : endpoint;
        const d = await apiGet('/api/chapters/' + id);
        return (d.content_urls || []).filter(function (u) { return typeof u === 'string' && u.length > 0; });
    }
};
