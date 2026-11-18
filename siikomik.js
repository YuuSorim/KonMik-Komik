// ID: ext_siikomik
// NAME: Siikomik
// TYPE: comic
// VERSION: 1.0.0
// COLOR: #ff4757
// ICON: https://www.google.com/s2/favicons?domain=siikomik.com&sz=64
// REFERER: https://siikomik.com/

const BASE = 'https://siikomik.com';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Referer': BASE + '/',
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

// Fungsi bantuan untuk mengekstrak JSON dari Next.js
function extractNextData(html) {
    const scriptRegex = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
    let match;
    let fullText = "";
    
    // Gabungkan semua script Next.js
    while ((match = scriptRegex.exec(html)) !== null) {
        let content = match[1];
        content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        fullText += content + "\n";
    }
    return fullText;
}

var KonmikExtension = {
    // 1. Ambil Daftar Komik (Katalog/Pencarian)
    async getList(page, query, filters) {
        // Karena halaman katalog siikomik cukup kompleks (menggunakan CSR/Client Side Rendering),
        // kita bisa memanfaatkan halaman pencarian mereka.
        let url = query 
            ? `${BASE}/cari/?q=${encodeURIComponent(query)}` 
            : `${BASE}/komik/`; // Halaman default komik
            
        // Catatan: Siikomik mungkin melakukan paginasi di halaman katalog, 
        // tapi untuk pencarian biasanya 1 halaman sudah cukup.
        
        const html = await fetchHtml(url);
        const mangaList = [];
        
        // Ekstraksi menggunakan Regex pada tag <a> dan <img>
        // (Karena halaman pencarian mungkin tidak memiliki JSON initialData yang rapi)
        const cardRegex = /<a[^>]+href="(\/komik\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<\/a>/gi;
        let m;
        const seen = new Set();
        
        while ((m = cardRegex.exec(html)) !== null) {
            const path = m[1];
            const cover = m[2];
            const title = m[3];
            
            // Filter agar tidak menangkap link chapter
            if (path.includes('/chapter-') || seen.has(path)) continue;
            seen.add(path);
            
            mangaList.push({
                id: path,
                title: title.trim() || path.split('/').filter(Boolean).pop().replace(/-/g, ' '),
                cover_url: cover,
                latest_chapter: '',
                rating: '-',
                views: '-'
            });
        }
        
        return { manga_list: mangaList };
    },

    // 2. Ambil Detail Komik
    async getDetail(slug) {
        // Pastikan slug dalam bentuk URL penuh atau path relatif
        let url = slug;
        if (!url.startsWith('http')) {
            url = slug.startsWith('/') ? BASE + slug : BASE + '/komik/' + slug + '/';
        }

        const html = await fetchHtml(url);
        const nextDataStr = extractNextData(html);

        // Ekstrak data JSON "initialChapters" dan "series" menggunakan manipulasi string
        // (Karena JSON-nya bisa sangat panjang, kita cari posisi indeksnya)
        
        let title = "";
        let cover = "";
        let description = "";
        let author = "";
        let rating = "";
        let views = "";
        let genres = [];
        let chapters = [];

        // 1. Ambil Judul
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (titleMatch) title = titleMatch[1].trim();

        // 2. Ambil Cover
        const coverMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (coverMatch) cover = coverMatch[1];

        // 3. Ambil Deskripsi/Sinopsis
        const descMatch = html.match(/<div class="prose-sk[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim();
        }

        // 4. Ambil Data JSON (Chapters, Rating, Views)
        if (nextDataStr) {
            // Ambil Rating
            const ratingMatch = nextDataStr.match(/"initialAvg":([\d.]+)/);
            if (ratingMatch) rating = ratingMatch[1];

            // Ambil Views
            const viewsMatch = nextDataStr.match(/"initialViews":(\d+)/);
            if (viewsMatch) {
                const v = parseInt(viewsMatch[1]);
                views = v > 1000 ? (v/1000).toFixed(1) + 'K' : v.toString();
            }
            
            // Ambil Genres
            const genreMatch = nextDataStr.match(/"genres":\[(.*?)\]/);
            if (genreMatch) {
                const gStr = genreMatch[1];
                const gMatches = gStr.match(/"([^"]+)"/g);
                if (gMatches) {
                    genres = gMatches.map(g => g.replace(/"/g, ''));
                }
            }

            // Ambil Chapters (mencari string "initialChapters":[...])
            const chIndex = nextDataStr.indexOf('"initialChapters":');
            if (chIndex !== -1) {
                const startIdx = nextDataStr.indexOf('[', chIndex);
                // Cari penutup array yang seimbang
                let bracketCount = 0;
                let endIdx = -1;
                for (let i = startIdx; i < nextDataStr.length; i++) {
                    if (nextDataStr[i] === '[') bracketCount++;
                    if (nextDataStr[i] === ']') bracketCount--;
                    if (bracketCount === 0) {
                        endIdx = i;
                        break;
                    }
                }
                
                if (endIdx !== -1) {
                    let chJsonStr = nextDataStr.substring(startIdx, endIdx + 1);
                    try {
                        const chArr = JSON.parse(chJsonStr);
                        // Urutkan dari Chapter 1 (terkecil ke terbesar)
                        chapters = chArr.sort((a, b) => a.number - b.number).map(ch => ({
                            id: `/komik/${slug.replace(/^\/komik\/|\/$/g, '')}/${ch.slug}/`,
                            title: ch.name,
                            endpoint: `/komik/${slug.replace(/^\/komik\/|\/$/g, '')}/${ch.slug}/`,
                            date: new Date(ch.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        }));
                    } catch(e) {
                        // Fallback jika JSON.parse gagal
                    }
                }
            }
        }

        // Fallback: Jika JSON gagal, ekstrak manual daftar chapter dari <noscript>
        if (chapters.length === 0) {
            const noscriptMatch = html.match(/<noscript>([\s\S]*?)<\/noscript>/i);
            if (noscriptMatch) {
                const linkRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
                let lm;
                while ((lm = linkRegex.exec(noscriptMatch[1])) !== null) {
                    chapters.push({
                        id: lm[1],
                        title: lm[2].trim(),
                        endpoint: lm[1],
                        date: ''
                    });
                }
                chapters.reverse(); // Urutkan dari awal
            }
        }

        return {
            title: title || "Unknown Title",
            cover_url: cover || "",
            description: description || "Tidak ada deskripsi.",
            author: author,
            artist: author,
            rating: rating || "-",
            views: views || "-",
            genres: genres,
            chapters: chapters
        };
    },

    // 3. Ambil Gambar Chapter
    async getChapterImages(endpoint) {
        const url = endpoint.startsWith('http') ? endpoint : BASE + endpoint;
        const html = await fetchHtml(url);
        const nextDataStr = extractNextData(html);

        let images = [];

        if (nextDataStr) {
            // Cari "initialPages"
            const pagesIndex = nextDataStr.indexOf('"initialPages":');
            if (pagesIndex !== -1) {
                const startIdx = nextDataStr.indexOf('{', pagesIndex);
                // Cari penutup JSON (kita tahu formatnya diakhiri dengan "status":"FREE"})
                const endIdx = nextDataStr.indexOf('"status":"FREE"', startIdx);
                if (startIdx !== -1 && endIdx !== -1) {
                    const jsonStr = nextDataStr.substring(startIdx, endIdx + 15) + '}';
                    try {
                        const pagesData = JSON.parse(jsonStr);
                        if (pagesData && pagesData.pages) {
                            images = pagesData.pages.map(p => p.url);
                        }
                    } catch (e) {
                        // Abaikan
                    }
                }
            }
        }

        // Fallback: Regex gambar langsung dari tag <img> jika JSON gagal
        if (images.length === 0) {
            const imgRegex = /<img[^>]+src="(https:\/\/siikomik\.com\/api\/media\/[^"]+)"[^>]*>/gi;
            let m;
            while ((m = imgRegex.exec(html)) !== null) {
                if (!images.includes(m[1])) {
                    images.push(m[1]);
                }
            }
        }

        return images;
    }
};
