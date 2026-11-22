// ID: ext_lunarx
// NAME: Lunar
// TYPE: comic
// VERSION: 1.0.4
// COLOR: #7C3AED
// ICON: https://www.google.com/s2/favicons?domain=lunarx.to&sz=64
// REFERER: https://lunarx.to/

const SITE = 'https://lunarx.to';
const API = 'https://api.lunarx.to';
const PAGE_SIZE = 30;
const LANG_PRIORITY = ['id', 'en']; // bahasa chapter yang diutamakan jika ada beberapa
const DEBUG = true; // true: jika katalog gagal/kosong, tampilkan penyebabnya sebagai satu "komik" di halaman 1

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Referer': 'https://lunarx.to/',
    'Origin': 'https://lunarx.to',
};

let _meta = {}; // slug -> data komik dari katalog (dipakai halaman detail, karena halaman web diblokir Cloudflare)
let _imgPattern = -1; // pola URL gambar chapter yang berhasil (disimpan setelah sukses pertama)
let _last = {};

async function fetchText(url) {
    const res = await fetch(url, { headers: HEADERS });
    const body = await res.text();
    _last = { url: url, status: res.status, head: body.substring(0, 100).replace(/\s+/g, ' ') };
    if (!res.ok) throw new Error('HTTP ' + res.status + ' :: ' + _last.head);
    return body;
}

// Pembaca JSON yang toleran: BOM, karakter kontrol, dan sisa teks di ujung tidak membuatnya gagal.
function tolerantParse(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (e1) {
        const msg = String(e1 && e1.message ? e1.message : e1);
        let t = text.replace(/^\uFEFF/, '').trim();
        t = t.replace(/[\u0000-\u001F]/g, ' ');
        try {
            return { ok: true, value: JSON.parse(t) };
        } catch (e2) { /* lanjut */ }
        const lastBrace = t.lastIndexOf('}');
        if (lastBrace > 0) {
            try {
                return { ok: true, value: JSON.parse(t.substring(0, lastBrace + 1)) };
            } catch (e3) { /* menyerah */ }
        }
        return { ok: false, msg: msg };
    }
}

async function fetchJson(url) {
    const text = await fetchText(url);
    const r = tolerantParse(text);
    if (r.ok) return r.value;
    const ctrl = (text.match(/[\u0000-\u001F]/g) || []).length;
    const bs = (text.match(/\\/g) || []).length;
    _last.parse = {
        msg: r.msg, len: text.length, ctrl: ctrl, backslash: bs,
        tail: text.substring(Math.max(0, text.length - 100)),
        sample: text.substring(0, 160)
    };
    // JSON rusak: kembalikan teks mentah, pemanggil memakai pembacaan cadangan (regex)
    return { __raw: text };
}

// ---- Pembacaan cadangan berbasis regex (dipakai bila JSON.parse gagal) ----
function rx(chunk, re) {
    const m = chunk.match(re);
    return m ? m[1] : '';
}

// Urutan kunci di data situs alfabetis, jadi tiap field dipotong sampai kunci berikutnya.
// Cara ini tetap jalan walau tanda kutip bersarang (judul alternatif, sinopsis) rusak.
function between(chunk, startKey, endKeys) {
    const i = chunk.indexOf('"' + startKey + '":');
    if (i < 0) return '';
    const from = i + startKey.length + 3;
    let end = -1;
    // kunci penutup yang paling awal muncul (sebagian kunci opsional, mis. theme_settings)
    for (const k of endKeys) {
        const j = chunk.indexOf(',"' + k + '":', from);
        if (j >= 0 && (end < 0 || j < end)) end = j;
    }
    let v = (end < 0 ? chunk.substring(from) : chunk.substring(from, end)).trim();
    if (v.charAt(0) === '"') v = v.substring(1);
    if (v.charAt(v.length - 1) === '"') v = v.substring(0, v.length - 1);
    return v;
}

function unescapeText(v) {
    return v
        .replace(/\\r\\n|\\n/g, '\n')
        .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/\\"/g, '"')
        .replace(/\\\//g, '/')
        .replace(/\\\\/g, '\\');
}

function listFromText(text) {
    const parts = text.split('"alternative_titles"');
    const out = [];
    for (let i = 1; i < parts.length; i++) {
        const p = '"alternative_titles"' + parts[i];
        const slug = between(p, 'slug', ['theme_settings', 'themecolor', 'themes', 'title']);
        if (!slug) continue;
        const genreRaw = between(p, 'genres', ['is_official', 'manga_id']).replace(/\\/g, '');
        const genres = [];
        const gRe = /"([^"]+)"/g;
        let g;
        while ((g = gRe.exec(genreRaw)) !== null) genres.push(g[1]);
        out.push({
            slug: slug,
            title: unescapeText(between(p, 'title', ['tl_username', 'trailer', 'translated_languages', 'user_id'])),
            cover_url: between(p, 'cover_url', ['demographic', 'description', 'genres']),
            description: unescapeText(between(p, 'description', ['genres', 'is_official', 'manga_id'])),
            genres: genres,
            author: unescapeText(between(p, 'author', ['banner_url', 'characters', 'content_level', 'cover_url'])),
            artist: unescapeText(between(p, 'artist', ['author', 'banner_url'])),
            publication_status: between(p, 'publication_status', ['publication_year', 'publisher', 'rating']),
            rating: ''
        });
    }
    return out;
}

function chaptersFromText(text) {
    const parts = text.split('"average_rating"');
    const out = [];
    for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        const chapter = rx(p, /"chapter"\s*:\s*"([^"]*)"/);
        if (!chapter) continue;
        const sub = rx(p, /"chapter_subnumber"\s*:\s*(\d+)/);
        out.push({
            chapter: chapter,
            chapter_number: Number(rx(p, /"chapter_number"\s*:\s*(-?[\d.]+)/) || chapter),
            chapter_subnumber: sub === '' ? null : Number(sub),
            chapter_title: rx(p, /"chapter_title"\s*:\s*"((?:[^"\\]|\\.)*)"/),
            language: rx(p, /"language"\s*:\s*"([^"]*)"/) || 'en',
            uploaded_at: rx(p, /"uploaded_at"\s*:\s*"([^"]*)"/),
            is_coming_soon: /"is_coming_soon"\s*:\s*true/.test(p)
        });
    }
    return out;
}

function imagesFromText(text) {
    const block = text.match(/"images"\s*:\s*\[([\s\S]*?)\]/);
    if (!block) return [];
    const urls = block[1].match(/https?:[^"\s,\]]+/g) || [];
    return urls.map(function (u) { return u.replace(/\\+$/, '').replace(/\\\//g, '/'); });
}

async function probeImage(url) {
    try {
        const res = await fetch(url, { headers: Object.assign({}, HEADERS, { 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8' }) });
        return 'HTTP ' + res.status;
    } catch (e) {
        return 'ERR ' + String(e && e.message ? e.message : e).substring(0, 40);
    }
}

function parseJsonField(v) {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string' || !v) return [];
    try {
        const a = JSON.parse(v);
        return Array.isArray(a) ? a : [];
    } catch (e) {
        return [];
    }
}

function debugItem(msg) {
    return {
        manga_list: [{
            id: 'debug',
            title: '[DEBUG] ' + msg,
            cover_url: '',
            latest_chapter: '',
            rating: '-',
            views: '-'
        }]
    };
}

// ---- Membaca data Next.js (RSC) yang tertanam di HTML halaman ----
function rscText(html) {
    const marker = 'self.__next_f.push([1,"';
    let out = '';
    let pos = 0;
    while (true) {
        const start = html.indexOf(marker, pos);
        if (start < 0) break;
        let i = start + marker.length;
        let j = i;
        while (j < html.length) {
            const c = html.charCodeAt(j);
            if (c === 92) { j += 2; continue; } // backslash: lewati karakter berikutnya
            if (c === 34) break; // tanda kutip penutup
            j++;
        }
        try {
            out += JSON.parse('"' + html.substring(i, j) + '"');
        } catch (e) { /* potongan rusak, lewati */ }
        pos = j + 1;
    }
    return out;
}

function extractObject(text, startIdx) {
    let depth = 0;
    let inStr = false;
    for (let i = startIdx; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (inStr) {
            if (c === 92) { i++; continue; }
            if (c === 34) inStr = false;
            continue;
        }
        if (c === 34) inStr = true;
        else if (c === 123) depth++;
        else if (c === 125) {
            depth--;
            if (depth === 0) return text.substring(startIdx, i + 1);
        }
    }
    return null;
}

function findMangaObject(html) {
    const text = rscText(html);
    const idMark = text.indexOf('"manga_id"');
    if (idMark < 0) return null;
    const start = text.lastIndexOf('{"', idMark);
    // mundur ke kurung buka objek manga (yang memuat "alternative_titles" / "title")
    let s = text.lastIndexOf('{"alternative_titles"', idMark);
    if (s < 0) s = text.lastIndexOf('{"artist"', idMark);
    if (s < 0) s = start;
    const objText = extractObject(text, s);
    if (!objText) return null;
    try {
        return JSON.parse(objText);
    } catch (e) {
        return null;
    }
}

var KonmikExtension = {
    // ---------- KATALOG / PENCARIAN (30 per halaman) ----------
    async getList(page, query, filters) {
        page = page || 1;
        try {
            const items = await this._list(page, query, filters);
            if (items.manga_list.length === 0 && DEBUG && page === 1) {
                return debugItem('Kosong. status=' + _last.status + ' :: ' + _last.head);
            }
            return items;
        } catch (e) {
            if (DEBUG && page === 1) return debugItem('[ERROR] ' + (e && e.message ? e.message : e));
            throw e;
        }
    },

    async _list(page, query, filters) {
        let url = API + '/api/manga/search?page=' + page + '&limit=' + PAGE_SIZE + '&sort=relevance&order=desc';
        if (query && query.trim().length > 0) {
            // CATATAN: nama parameter pencarian belum diverifikasi, jadi beberapa nama dikirim bersamaan.
            const q = encodeURIComponent(query.trim());
            url += '&q=' + q + '&query=' + q + '&search=' + q;
        }
        const json = await fetchJson(url);
        const data = json && json.__raw ? listFromText(json.__raw) : ((json && json.manga) || []);
        if (json && json.__raw && data.length === 0) throw new Error('Bukan JSON dan pembacaan cadangan gagal');

        const list = [];
        for (const it of data) {
            if (!it || !it.slug) continue;
            _meta[it.slug] = it;
            list.push({
                id: it.slug,
                title: it.title || it.slug,
                cover_url: it.cover_url || '',
                latest_chapter: it.publication_status ? String(it.publication_status) : '',
                rating: '-',
                views: '-'
            });
        }
        return { manga_list: list };
    },

    // ---------- DETAIL KOMIK + DAFTAR CHAPTER ----------
    // slug = slug komik, contoh "the-cliff"
    async getDetail(slug) {
        if (slug === 'debug') {
            return {
                title: 'DEBUG', cover_url: '', description: JSON.stringify(_last, null, 1), author: '-', artist: '-',
                rating: '-', views: '-', genres: ['debug'], chapters: []
            };
        }

        // 1) Metadata: dari katalog yang sudah dibuka -> cari lewat API -> (terakhir) halaman web
        let meta = _meta[slug] || null;
        if (!meta) {
            try { meta = await this._lookup(slug); } catch (e) { /* lanjut */ }
        }
        if (!meta) {
            try {
                const html = await fetchText(SITE + '/manga/' + slug);
                if (!/Just a moment|Checking your browser/i.test(html)) meta = findMangaObject(html);
            } catch (e) { /* lanjut tanpa metadata */ }
        }

        // 2) Daftar chapter dari API
        const ch = await fetchJson(API + '/api/manga/' + slug);
        const raw = ch && ch.__raw ? chaptersFromText(ch.__raw) : ((ch && ch.data) || []);

        // pilih satu entri per nomor chapter, utamakan bahasa di LANG_PRIORITY
        const byKey = {};
        for (const c of raw) {
            if (!c || c.is_coming_soon) continue;
            const key = String(c.chapter) + (c.chapter_subnumber != null ? '.' + c.chapter_subnumber : '');
            const rank = LANG_PRIORITY.indexOf(c.language);
            const score = rank < 0 ? 99 : rank;
            if (!byKey[key] || score < byKey[key].score) byKey[key] = { c: c, score: score, key: key };
        }
        const chapters = Object.keys(byKey).map(function (k) { return byKey[k]; })
            .sort(function (a, b) {
                const na = Number(a.c.chapter_number) + (a.c.chapter_subnumber != null ? Number('0.' + a.c.chapter_subnumber) : 0);
                const nb = Number(b.c.chapter_number) + (b.c.chapter_subnumber != null ? Number('0.' + b.c.chapter_subnumber) : 0);
                return nb - na;
            })
            .map(function (o) {
                // pemisah "~" aman dari penyandian URL (tidak seperti "|")
                const id = slug + '~' + o.key + '~' + (o.c.language || 'en');
                return {
                    id: id,
                    title: o.c.chapter_title || ('Chapter ' + o.key),
                    endpoint: id,
                    date: o.c.uploaded_at ? String(o.c.uploaded_at).substring(0, 10) : '-'
                };
            });

        const genres = meta ? parseJsonField(meta.genres) : [];
        if (genres.length === 0) genres.push('Komik');

        let description = meta && meta.description ? String(meta.description).trim() : '';
        if (!description) description = 'Tidak ada deskripsi.';

        return {
            title: (meta && meta.title) || slug.replace(/-/g, ' '),
            cover_url: (meta && meta.cover_url) || '',
            description: description,
            author: (meta && meta.author) || '-',
            artist: (meta && (meta.artist || meta.author)) || '-',
            rating: '-',
            views: '-',
            genres: genres,
            chapters: chapters
        };
    },

    // Cari metadata satu komik lewat API pencarian (nama parameter pencarian belum terverifikasi)
    async _lookup(slug) {
        const q = encodeURIComponent(slug.replace(/-/g, ' '));
        const json = await fetchJson(API + '/api/manga/search?page=1&limit=30&sort=relevance&order=desc&q=' + q + '&query=' + q + '&search=' + q);
        const arr = json && json.__raw ? listFromText(json.__raw) : ((json && json.manga) || []);
        for (const it of arr) {
            if (it && it.slug) _meta[it.slug] = it;
        }
        return _meta[slug] || null;
    },

    // ---------- GAMBAR CHAPTER ----------
    // endpoint = "slug~nomor~bahasa" (juga menerima pemisah "|" atau "%7C")
    async getChapterImages(endpoint) {
        let ep = String(endpoint);
        try { ep = decodeURIComponent(ep); } catch (e) { /* biarkan */ }
        const parts = ep.split(/[~|]/);
        const slug = parts[0];
        const num = parts[1];
        const lang = parts[2] || 'en';
        const base = API + '/api/manga/' + slug;
        const patterns = [
            base + '/chapter/' + num + '?lang=' + lang,
            base + '/chapter/' + num,
            base + '/chapters/' + num,
            base + '/' + num + '?lang=' + lang
        ];
        const order = [];
        if (_imgPattern >= 0) order.push(_imgPattern);
        for (let i = 0; i < patterns.length; i++) if (i !== _imgPattern) order.push(i);

        const notes = [];
        for (const i of order) {
            try {
                const json = await fetchJson(patterns[i]);
                const imgs = json && json.__raw ? imagesFromText(json.__raw) : (json && json.data && json.data.images);
                if (Array.isArray(imgs) && imgs.length > 0) {
                    _imgPattern = i;
                    const list = imgs.filter(function (u) { return typeof u === 'string' && u.length > 0; });
                    if (DEBUG) {
                        const st = await probeImage(list[0]);
                        const info = ['P' + (i + 1) + ' ok, ' + list.length + ' gambar', 'gambar1: ' + st, list[0].substring(list[0].length - 45)];
                        return info.map(function (t) {
                            return 'https://placehold.co/900x260/1a1a1a/ffffff.png?text=' + encodeURIComponent(t);
                        }).concat(list);
                    }
                    return list;
                }
                notes.push('P' + (i + 1) + ': kosong');
            } catch (e) {
                notes.push('P' + (i + 1) + ': ' + String(e && e.message ? e.message : e).substring(0, 60));
            }
        }
        if (DEBUG) {
            // Pembaca hanya menampilkan "Gagal memuat gambar", jadi alasan ditampilkan sebagai gambar teks.
            const lines = ['slug=' + slug + ' no=' + num + ' lang=' + lang].concat(notes);
            return lines.map(function (t) {
                return 'https://placehold.co/900x420/1a1a1a/ffffff.png?text=' + encodeURIComponent(t);
            });
        }
        throw new Error('Gambar chapter tidak ditemukan :: ' + notes.join(' | '));
    }
};
