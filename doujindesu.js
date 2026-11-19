// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.3
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
    'x-device-id': 'dev_bh7cicmqwyb_mamv9'
};

// FUNGSI DEKRIPSI ASLI (Berdasarkan baris ke-4 dari screenshot kamu)
function decryptData(hexStr, keyStr) {
    let r = [];
    let n = []; // Array nilai kunci
    for (let i = 0; i < keyStr.length; i++) {
        n.push(keyStr.charCodeAt(i));
    }
    
    let o = 0, a = 0; // Variabel state
    for (let i = 0; i < hexStr.length; i += 2) {
        // Ambil 2 digit hex (contoh: "a1")
        let hexPair = hexStr.substring(i, i + 2);
        let val = parseInt(hexPair, 16); // Konversi ke angka desimal
        
        // Ambil kunci berdasarkan indeks modulo
        let k = (i / 2) % n.length;
        
        // Rumus Chained XOR (dari screenshot)
        let l = (val - n[k]) % 256;
        if (l < 0) l += 256; // Pastikan positif
        
        // XOR dengan state sebelumnya
        let decodedChar = l ^ a ^ o ^ r[n.length % 5]; 
        
        r.push(String.fromCharCode(decodedChar));
        
        // Update state (mengikuti logika matematika dari kode asli)
        o = (o + 1) % 256;
        a = (a + decodedChar) % 256;
    }
    
    try {
        // Kadang hasilnya perlu di-decode dari URL encoding
        let resultStr = r.join('');
        try {
            resultStr = decodeURIComponent(resultStr);
        } catch(e) {}
        
        return JSON.parse(resultStr);
    } catch (e) {
        throw new Error('Gagal mendekripsi data');
    }
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
        return decryptData(json._enc_resp_, SALT);
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

    async getChapterImages(endpoint) {
        const data = await fetchApi(`/api/chapter/${endpoint}`);
        const images = data.images || [];
        return images.map(img => img.url || img);
    }
};
