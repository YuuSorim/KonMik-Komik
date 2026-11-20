// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.5
// COLOR: #ff4757
// ICON: https://www.google.com/s2/favicons?domain=doujin.desu.xxx&sz=64
// REFERER: https://doujin.desu.xxx/

const BASE = 'https://doujin.desu.xxx';
const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
const SALT = 'do-not-read-this-super-secret-salt-2026-v2';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
    'Origin': BASE,
    'X-App-Secret': APP_SECRET,
    'x-device-id': 'dev_bh7cicmqwyb_mmvv9'
};

// KUMPULAN RUMUS DEKRIPSI (Kita coba satu per satu)
function tryDecrypt(hexStr) {
    let methods = [
        // Metode 1: Chained XOR (State S1, S2, S3) - Teori sebelumnya
        function() {
            let r = "", s1 = 0, s2 = 0, s3 = 0;
            for (let i = 0; i < SALT.length; i++) {
                s1 = (s1 + SALT.charCodeAt(i)) % 256;
                s2 = (s2 ^ SALT.charCodeAt(i)) % 256;
                s3 = (s3 + (SALT.charCodeAt(i) * i)) % 256;
            }
            for (let i = 0; i < hexStr.length; i += 2) {
                let c = parseInt(hexStr.substring(i, i + 2), 16);
                let dec = c ^ s1 ^ s2 ^ s3;
                r += String.fromCharCode(dec);
                s1 = (s1 + 1) % 256;
                s2 = (s2 + dec) % 256;
                s3 = (s3 ^ dec) % 256;
            }
            return r;
        },
        // Metode 2: XOR dengan Kunci Berulang Biasa
        function() {
            let r = "";
            for (let i = 0; i < hexStr.length; i += 2) {
                let c = parseInt(hexStr.substring(i, i + 2), 16);
                let k = SALT.charCodeAt((i / 2) % SALT.length);
                r += String.fromCharCode(c ^ k);
            }
            return r;
        },
        // Metode 3: XOR dengan (APP_SECRET + SALT)
        function() {
            let r = "";
            const key = APP_SECRET + SALT;
            for (let i = 0; i < hexStr.length; i += 2) {
                let c = parseInt(hexStr.substring(i, i + 2), 16);
                let k = key.charCodeAt((i / 2) % key.length);
                r += String.fromCharCode(c ^ k);
            }
            return r;
        }
    ];

    for (let m of methods) {
        try {
            let result = m();
            // Coba parsing sebagai JSON
            try {
                let cleaned = decodeURIComponent(result);
                return JSON.parse(cleaned);
            } catch (e) {
                return JSON.parse(result);
            }
        } catch (e) {
            // Lanjut ke metode berikutnya jika gagal
        }
    }
    throw new Error("Semua metode dekripsi gagal. Kunci mungkin sudah berubah.");
}

async function fetchApi(endpoint) {
    const res = await fetch(BASE + endpoint, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch(e) {
        throw new Error('Respons bukan JSON');
    }

    if (json._enc_resp_) {
        return tryDecrypt(json._enc_resp_);
    }
    return json;
}

var KonmikExtension = {
    async getList(page, query, filters) {
        const offset = (page - 1) * 20;
        let endpoint = query 
            ? `/api/manga?search=${encodeURIComponent(query)}&limit=20&offset=${offset}`
            : `/api/manga?limit=20&offset=${offset}`;
            
        const data = await fetchApi(endpoint);
        const mangaList = [];
        
        const items = data.data || data.manga || data.results || [];
        
        for (const item of items) {
            mangaList.push({
                id: item.slug,
                title: item.title,
                cover_url: item.thumbnail || item.cover || item.image,
                latest_chapter: item.latest_chapter ? item.latest_chapter.title : '',
                rating: item.rating || '-',
                views: item.views || '-'
            });
        }
        return { manga_list: mangaList };
    },

    async getDetail(slug) {
        const data = await fetchApi(`/api/manga/${slug}`);
        
        return {
            title: data.title || 'Unknown',
            cover_url: data.thumbnail || '',
            description: data.synopsis || data.description || '',
            author: data.author || '',
            artist: data.artist || data.author || '',
            rating: data.rating || '-',
            views: data.views || '-',
            genres: data.genres ? data.genres.map(g => typeof g === 'string' ? g : g.name) : [],
            chapters: (data.chapters || []).map(ch => ({
                id: ch.id,
                title: ch.title || ch.name,
                endpoint: ch.id,
                date: ch.date || ch.created_at || ''
            }))
        };
    },

    async getChapterImages(endpoint) {
        const data = await fetchApi(`/api/chapter/${endpoint}`);
        
        const images = data.images || data.pages || [];
        return images.map(img => typeof img === 'string' ? img : (img.url || img.image));
    }
};
