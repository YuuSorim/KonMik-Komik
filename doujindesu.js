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

// Fungsi Enkripsi/Dekripsi XOR (karena situs ini mengenkripsi datanya)
function xorCrypt(str, key) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

async function fetchApi(endpoint) {
    const res = await fetch(BASE + endpoint, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    
    // Coba parsing JSON
    try {
        let json = JSON.parse(text);
        // Jika respons terenkripsi (biasanya ada field _enc_resp_)
        if (json._enc_resp_) {
            // Dekripsi menggunakan XOR (Ini asumsi logika dari kuroneko/doujin-scraper)
            const decrypted = xorCrypt(json._enc_resp_, SALT);
            json = JSON.parse(decrypted);
        }
        return json;
    } catch (e) {
        throw new Error('Gagal membaca data dari API');
    }
}

var KonmikExtension = {
    async getList(page, query, filters) {
        // Endpoint API berdasarkan pantauan Network (limit 12, sort terbaru)
        let endpoint = query 
            ? `/api/manga?search=${encodeURIComponent(query)}&page=${page}`
            : `/api/manga?limit=12&type=manhwa&sort=latest_chapter&page=${page}`;
            
        const data = await fetchApi(endpoint);
        const mangaList = [];
        
        // Asumsi data berbentuk array di dalam objek 'data'
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

    async getDetail(slug) {
        // Endpoint detail komik
        const data = await fetchApi(`/api/manga/${slug}`);
        
        // Parse data detail (sesuaikan dengan struktur JSON yang sebenarnya)
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

    async getChapterImages(endpoint) {
        // Endpoint gambar chapter
        const data = await fetchApi(`/api/chapter/${endpoint}`);
        
        // Ambil array gambar
        const images = data.images || [];
        return images.map(img => img.url || img);
    }
};
