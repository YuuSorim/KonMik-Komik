// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.4
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

// FUNGSI DEKRIPSI FINAL (Chained XOR dengan State)
function decryptData(hexStr) {
    let result = "";
    // Inisialisasi state dari kunci salt
    let s1 = 0, s2 = 0, s3 = 0;
    for (let i = 0; i < SALT.length; i++) {
        s1 = (s1 + SALT.charCodeAt(i)) % 256;
        s2 = (s2 ^ SALT.charCodeAt(i)) % 256;
        s3 = (s3 + (SALT.charCodeAt(i) * i)) % 256;
    }

    for (let i = 0; i < hexStr.length; i += 2) {
        let hexByte = hexStr.substring(i, i + 2);
        let c = parseInt(hexByte, 16);

        // Rumus Chained XOR (Reverse Engineering dari file index-C9QCqnCZ.js)
        let dec = c ^ s1 ^ s2 ^ s3;
        result += String.fromCharCode(dec);

        // Update state (ini yang bikin teksnya berubah-ubah)
        s1 = (s1 + 1) % 256;
        s2 = (s2 + dec) % 256;
        s3 = (s3 ^ dec) % 256;
    }

    try {
        // Kadang hasilnya masih ter-encode URL (%7B untuk '{')
        let cleanStr = decodeURIComponent(result);
        return JSON.parse(cleanStr);
    } catch (e) {
        // Kalau gagal, coba tanpa decode URI
        try {
            return JSON.parse(result);
        } catch (e2) {
            throw new Error("Gagal mendekripsi data. Kunci mungkin berubah.");
        }
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
        return decryptData(json._enc_resp_);
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
        
        // Sesuaikan dengan struktur JSON DoujinDesu
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
