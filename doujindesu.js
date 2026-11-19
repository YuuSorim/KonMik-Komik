// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.0
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
    'X-App-Secret': APP_SECRET
};

// 1. Fungsi Dekripsi (Hasil Reverse Engineering dari fungsi To)
function decrypt(hex, key) {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
        // Ambil 2 karakter hex, ubah ke integer basis 16
        const charCode = parseInt(hex.substring(i, i + 2), 16);
        // XOR dengan karakter kunci (berulang)
        const keyCode = key.charCodeAt((i / 2) % key.length);
        result += String.fromCharCode(charCode ^ keyCode);
    }
    return result;
}

// 2. Fungsi Fetch API
async function fetchApi(endpoint) {
    const res = await fetch(BASE + endpoint, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Jika data terenkripsi
    if (json._enc_resp_) {
        try {
            // Dekripsi data
            let decrypted = decrypt(json._enc_resp_, SALT);
            
            // Terkadang hasil dekripsi masih di-encode URL, kita coba decode
            try {
                decrypted = decodeURIComponent(decrypted);
            } catch(e) {}
            
            return JSON.parse(decrypted);
        } catch (e) {
            throw new Error('Gagal mendekripsi data');
        }
    }
    return json;
}

var KonmikExtension = {
    // 3. Ambil Daftar Komik
    async getList(page, query, filters) {
        let endpoint = query 
            ? `/api/manga?search=${encodeURIComponent(query)}&page=${page}`
            : `/api/manga?limit=12&type=manhwa&sort=latest_chapter&page=${page}`;
            
        const data = await fetchApi(endpoint);
        const mangaList = [];
        
        // Sesuaikan dengan struktur JSON DoujinDesu (biasanya data.data)
        const items = data.data || data.manga || [];
        
        for (const item of items) {
            mangaList.push({
                id: item.slug,
                title: item.title,
                cover_url: item.thumbnail || item.cover,
                latest_chapter: item.latest_chapter ? item.latest_chapter.title : '',
                rating: item.rating || '-',
                views: item.views || '-'
            });
        }
        
        return { manga_list: mangaList };
    },

    // 4. Ambil Detail Komik
    async getDetail(slug) {
        const data = await fetchApi(`/api/manga/${slug}`);
        
        return {
            title: data.title || 'Unknown',
            cover_url: data.thumbnail || '',
            description: data.synopsis || '',
            author: data.author || '',
            artist: data.artist || data.author || '',
            rating: data.rating || '-',
            views: data.views || '-',
            genres: data.genres ? data.genres.map(g => g.name) : [],
            chapters: (data.chapters || []).map(ch => ({
                id: ch.id,
                title: ch.title,
                endpoint: ch.id,
                date: ch.date || ''
            }))
        };
    },

    // 5. Ambil Gambar Chapter
    async getChapterImages(endpoint) {
        const data = await fetchApi(`/api/chapter/${endpoint}`);
        
        const images = data.images || [];
        return images.map(img => img.url || img);
    }
};
