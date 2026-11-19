// ID: ext_doujindesu
// NAME: DoujinDesu
// TYPE: comic
// VERSION: 1.0.1
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

// 1. Fungsi XOR Dasar
function xorDecrypt(str, key) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

// 2. Fungsi Dekripsi Utama (Mengikuti logika fungsi To & il)
function decryptData(hexStr) {
    // Konversi Hex ke String Binary
    let binStr = '';
    for (let i = 0; i < hexStr.length; i += 2) {
        binStr += String.fromCharCode(parseInt(hexStr.substring(i, i + 2), 16));
    }

    // Di DoujinDesu, kunci XOR dibentuk dari gabungan APP_SECRET dan SALT
    // Kita coba beberapa kemungkinan kunci yang biasa dipakai situs ini
    const keysToTry = [
        APP_SECRET + SALT,
        SALT + APP_SECRET,
        SALT,
        APP_SECRET
    ];

    for (let key of keysToTry) {
        try {
            let decrypted = xorDecrypt(binStr, key);
            // Kadang hasilnya masih di-encode URL (seperti %7B untuk '{')
            try {
                decrypted = decodeURIComponent(decrypted);
            } catch(e) {}
            
            // Cek apakah hasilnya JSON yang valid
            if (decrypted.startsWith('{') || decrypted.startsWith('[')) {
                return JSON.parse(decrypted);
            }
        } catch (e) {
            // Lanjut coba kunci berikutnya
        }
    }
    throw new Error('Kunci dekripsi tidak cocok');
}

// 3. Fungsi Fetch API
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

    // Jika data terenkripsi
    if (json._enc_resp_) {
        return decryptData(json._enc_resp_);
    }
    return json;
}

var KonmikExtension = {
    // 4. Ambil Daftar Komik
    async getList(page, query, filters) {
        // Kita ganti endpoint-nya agar lebih umum (manga, manhwa, doujin)
        let endpoint = query 
            ? `/api/manga?search=${encodeURIComponent(query)}&page=${page}`
            : `/api/manga?limit=20&page=${page}`; 
            
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

    // 5. Ambil Detail Komik
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

    // 6. Ambil Gambar Chapter
    async getChapterImages(endpoint) {
        const data = await fetchApi(`/api/chapter/${endpoint}`);
        
        const images = data.images || [];
        return images.map(img => img.url || img);
    }
};
